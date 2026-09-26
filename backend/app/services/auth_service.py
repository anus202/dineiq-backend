from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core import audit
from app.core.roles import PRIVILEGED_ROLES, RoleName
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Customer, Login, Role, Signup
from app.schemas.auth import LoginRequest, SignupRequest, StaffCreateRequest


class AuthError(Exception):
    """Base class for auth failures the controller turns into HTTP errors."""


class EmailAlreadyRegistered(AuthError):
    pass


class InvalidCredentials(AuthError):
    pass


class InactiveAccount(AuthError):
    pass


class PhoneBelongsToAnotherCustomer(AuthError):
    """The phone is on a customer profile we can't safely hand to this signup."""


class RoleChangeNotAllowed(AuthError):
    pass


class UserNotFound(AuthError):
    pass


async def _role(db: AsyncSession, name: RoleName) -> Role:
    return await db.scalar(select(Role).where(Role.Name == name.value))


async def _email_taken(db: AsyncSession, email: str) -> bool:
    return await db.scalar(select(Signup.Id).where(Signup.Email == email)) is not None


async def _save_new_user(db: AsyncSession, user: Signup) -> Signup:
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # Another request registered the same email (or linked the same customer) meanwhile.
        await db.rollback()
        raise EmailAlreadyRegistered
    return await get_user(db, user.Id)


async def signup(db: AsyncSession, payload: SignupRequest) -> Signup:
    """Public registration: always a CUSTOMER, linked to a customer profile when a phone is given.

    - Phone not on file: a new tbl_Customer profile is created for this account.
    - Phone on file with the same email and no account yet: that profile (with its orders
      and points) is linked.
    - Phone on file otherwise: refused, so nobody can take over another customer's
      history just by typing their number. Staff can link it after checking identity.
    """
    email = payload.Email.lower()
    if await _email_taken(db, email):
        raise EmailAlreadyRegistered

    customer_id = None
    if payload.PhoneNumber:
        existing = await db.scalar(
            select(Customer).where(Customer.Phone == payload.PhoneNumber, Customer.IsDeleted == False)  # noqa: E712
        )
        if existing is None:
            profile = Customer(Name=payload.FullName, Phone=payload.PhoneNumber, Email=email)
            db.add(profile)
            await db.flush()
            customer_id = profile.Id
        else:
            already_linked = await db.scalar(select(Signup.Id).where(Signup.CustomerId == existing.Id))
            if already_linked is not None or (existing.Email or "").lower() != email:
                raise PhoneBelongsToAnotherCustomer
            customer_id = existing.Id

    role = await _role(db, RoleName.CUSTOMER)
    user = Signup(
        FullName=payload.FullName,
        Email=email,
        PhoneNumber=payload.PhoneNumber,
        # bcrypt is CPU-bound; keep it off the event loop.
        PasswordHash=await run_in_threadpool(hash_password, payload.Password),
        RoleId=role.Id,
        CustomerId=customer_id,
        IsActive=True,
    )
    return await _save_new_user(db, user)


async def login(db: AsyncSession, payload: LoginRequest, ip_address: Optional[str]) -> tuple[Signup, str]:
    """Verify credentials, record the attempt in tbl_Login, and return (user, access token)."""
    email = payload.Email.lower()
    # "== False" (not .is_(False)): SQL Server rejects "IS 0".
    user = await db.scalar(
        select(Signup).where(Signup.Email == email, Signup.IsDeleted == False)  # noqa: E712
    )

    password_ok = await run_in_threadpool(verify_password, payload.Password, user.PasswordHash if user else None)

    # tbl_Login.SignupId is required, so attempts on unknown emails can't be logged.
    if user is None:
        raise InvalidCredentials

    succeeded = password_ok and user.IsActive
    db.add(Login(SignupId=user.Id, Email=email, IpAddress=ip_address, IsSuccess=succeeded))
    if succeeded:
        await audit.record(db, "LOGIN", "Signup", user.Id, None, {"Email": email}, user.Id)
    await db.commit()

    if not password_ok:
        raise InvalidCredentials
    if not user.IsActive:
        raise InactiveAccount

    return user, create_access_token(user.Id, user.Email, user.Role.Name)


# --- Roles and staff accounts ----------------------------------------------------------


def _check_can_grant(actor: Signup, *roles: str) -> None:
    """Only a SUPER_ADMIN may grant ADMIN / SUPER_ADMIN, or change someone who has one."""
    if actor.Role.Name != RoleName.SUPER_ADMIN.value and any(RoleName(r) in PRIVILEGED_ROLES for r in roles):
        raise RoleChangeNotAllowed("Only a SUPER_ADMIN can grant or change ADMIN and SUPER_ADMIN roles")


async def get_roles(db: AsyncSession) -> list[Role]:
    return list(await db.scalars(select(Role).order_by(Role.Id)))


async def get_user(db: AsyncSession, user_id: int) -> Optional[Signup]:
    return await db.scalar(
        select(Signup)
        .where(Signup.Id == user_id, Signup.IsDeleted == False)  # noqa: E712
        .execution_options(populate_existing=True)
    )


async def get_users(
    db: AsyncSession,
    skip: int,
    limit: int,
    role: Optional[RoleName],
    search: Optional[str],
    branch_id: Optional[int] = None,
) -> tuple[int, list[Signup]]:
    filters = [Signup.IsDeleted == False]  # noqa: E712
    if role is not None:
        filters.append(Signup.RoleId == select(Role.Id).where(Role.Name == role.value).scalar_subquery())
    if branch_id is not None:
        filters.append(Signup.BranchId == branch_id)
    if search and search.strip():
        term = search.strip()
        filters.append(or_(Signup.FullName.contains(term, autoescape=True), Signup.Email.contains(term.lower(), autoescape=True)))
    total = await db.scalar(select(func.count()).select_from(Signup).where(*filters))
    users = await db.scalars(select(Signup).where(*filters).order_by(Signup.Id).offset(skip).limit(limit))
    return total or 0, list(users)


async def create_staff(db: AsyncSession, payload: StaffCreateRequest, actor: Signup) -> Signup:
    _check_can_grant(actor, payload.Role.value)
    email = payload.Email.lower()
    if await _email_taken(db, email):
        raise EmailAlreadyRegistered
    role = await _role(db, payload.Role)
    user = Signup(
        FullName=payload.FullName,
        Email=email,
        PhoneNumber=payload.PhoneNumber,
        PasswordHash=await run_in_threadpool(hash_password, payload.Password),
        RoleId=role.Id,
        BranchId=payload.BranchId,
        CanAccessInventory=payload.CanAccessInventory,
        CanTriggerPipeline=payload.CanTriggerPipeline,
        CanAccessMenuManagement=payload.CanAccessMenuManagement,
        CanAccessBranchAnalytics=payload.CanAccessBranchAnalytics,
        IsActive=True,
        CreatedBy=actor.Id,
        UpdatedBy=actor.Id,
    )
    return await _save_new_user(db, user)


async def deactivate_user(db: AsyncSession, user_id: int, actor: Signup) -> Signup:
    if user_id == actor.Id:
        raise RoleChangeNotAllowed("You can't deactivate your own account")
    user = await get_user(db, user_id)
    if user is None:
        raise UserNotFound
    _check_can_grant(actor, user.Role.Name)
    user.IsActive = False
    user.UpdatedBy = actor.Id
    await db.commit()
    return await get_user(db, user_id)


async def change_role(db: AsyncSession, user_id: int, new_role: RoleName, actor: Signup) -> Signup:
    if user_id == actor.Id:
        raise RoleChangeNotAllowed("You can't change your own role")
    user = await get_user(db, user_id)
    if user is None:
        raise UserNotFound
    _check_can_grant(actor, user.Role.Name, new_role.value)
    user.RoleId = (await _role(db, new_role)).Id
    user.UpdatedBy = actor.Id
    await db.commit()
    return await get_user(db, user_id)
