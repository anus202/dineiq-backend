from typing import Callable, Iterable, Optional

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import current_user_id
from app.core.roles import BRANCH_SCOPED_ROLES, RoleName
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Signup

# OAuth2 password flow: Swagger's Authorize button logs in through /auth/token with
# username (= email) and password. Clients can also send "Authorization: Bearer <Token>"
# with the Token from /auth/login. auto_error=False so a missing token gets our 401.
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/token",
    auto_error=False,
    description="Log in with your email as the username",
)


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Signup:
    """401 unless the request carries a valid token for an active account."""
    if not token:
        raise _unauthorized("Not authenticated")
    try:
        user_id = int(decode_access_token(token)["sub"])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token has expired")
    except (jwt.InvalidTokenError, ValueError):
        raise _unauthorized("Invalid token")

    user = await db.scalar(
        select(Signup).where(
            Signup.Id == user_id,
            Signup.IsActive == True,  # noqa: E712
            Signup.IsDeleted == False,  # noqa: E712  ("IS 0" is invalid in SQL Server)
        )
    )
    if user is None:
        raise _unauthorized("User not found or inactive")
    current_user_id.set(user.Id)  # attributes this request's audit entries to the user
    return user


def require_roles(roles: Iterable[RoleName | str], *, allow_super_admin: bool = True, extra_permission: Optional[str] = None) -> Callable:
    """Dependency: 401 without a valid token, 403 unless the user has one of `roles`.

    SUPER_ADMIN passes every check unless allow_super_admin=False (used for the customer
    portal, which needs the caller's own customer profile).

    `extra_permission`, when given, is the name of one of tbl_Signup's per-account grant
    flags (CanAccessInventory, CanTriggerPipeline, CanAccessMenuManagement,
    CanAccessBranchAnalytics -- see the "System permissions" toggles on user creation): a
    user whose role isn't in `roles` still passes if that flag is set on their account,
    letting an admin hand one manager extra module access without changing their role.

        @router.get("/x", dependencies=[Depends(require_roles([RoleName.ADMIN]))])
        async def x(user: Signup = Depends(require_roles(["ADMIN", "CASHIER"]))): ...
    """
    allowed = {RoleName(r).value for r in roles}
    if allow_super_admin:
        allowed.add(RoleName.SUPER_ADMIN.value)
    label = ", ".join(sorted(allowed))

    async def dependency(user: Signup = Depends(get_current_user)) -> Signup:
        if user.Role.Name in allowed:
            return user
        if extra_permission and getattr(user, extra_permission, False):
            return user
        detail = f"Requires one of these roles: {label} (you are {user.Role.Name})"
        if extra_permission:
            detail += f", or {extra_permission}=true on your account"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

    return dependency


def branch_scope() -> Callable:
    """Dependency: resolves the branch_id an endpoint should filter its query by.

    - RESTAURANT_MANAGER / INVENTORY_MANAGER: always their own assigned branch — any
      `branch_id` query param they send is ignored, so they can never read another
      branch's data by tampering with the URL. 400 if their account has no branch.
    - ADMIN / SUPER_ADMIN: the `branch_id` query param, or None for "all branches".
    - Any other role: None (not expected to reach a branch-scoped endpoint at all —
      the route's own require_roles() dependency should already have refused it).

    Usage:
        @router.get("/x", dependencies=[Depends(require_roles(BRANCH_MANAGERS))])
        async def x(branch_id: Optional[int] = Depends(branch_scope()), user: Signup = Depends(get_current_user)): ...
    """

    async def dependency(
        branch_id: Optional[int] = Query(None, description="ADMIN/SUPER_ADMIN only: filter to one branch, omit for all branches"),
        user: Signup = Depends(get_current_user),
    ) -> Optional[int]:
        role = RoleName(user.Role.Name)
        if role in BRANCH_SCOPED_ROLES:
            if user.BranchId is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Your account has no assigned branch — ask an admin to assign one.",
                )
            return user.BranchId
        return branch_id

    return dependency
