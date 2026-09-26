from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_roles
from app.core.roles import ADMIN_ONLY, RoleName
from app.db.session import get_db
from app.models import Signup
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RoleResponse,
    RoleUpdateRequest,
    SignupRequest,
    StaffCreateRequest,
    TokenResponse,
    UserData,
    UserListResponse,
)
from app.services import auth_service
from app.services.auth_service import (
    EmailAlreadyRegistered,
    InactiveAccount,
    InvalidCredentials,
    PhoneBelongsToAnotherCustomer,
    RoleChangeNotAllowed,
    UserNotFound,
)

TAG = "Authentication & Roles"
router = APIRouter(prefix="/api/v1/auth", tags=[TAG])
users_router = APIRouter(
    prefix="/api/v1/users",
    tags=[TAG],
    responses={401: {"description": "Not logged in"}, 403: {"description": "Requires ADMIN or SUPER_ADMIN"}},
)


def error_response(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=AuthResponse(Success=False, Message=message).model_dump(mode="json"),
    )


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register as a customer",
    description=(
        "Public. Creates a CUSTOMER account. With a PhoneNumber it also creates your customer profile, "
        "or links an existing one if its phone and email both match yours. Staff accounts are created "
        "by an admin via POST /api/v1/users."
    ),
    responses={
        400: {"model": AuthResponse, "description": "Email already registered"},
        409: {"model": AuthResponse, "description": "Phone belongs to another customer profile"},
    },
)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    try:
        user = await auth_service.signup(db, payload)
    except EmailAlreadyRegistered:
        return error_response(status.HTTP_400_BAD_REQUEST, "Email is already registered")
    except PhoneBelongsToAnotherCustomer:
        return error_response(
            status.HTTP_409_CONFLICT,
            "This phone number already belongs to a customer profile. Ask the restaurant to link it to your account.",
        )
    return AuthResponse(Success=True, Message="Signup successful", Data=UserData.from_user(user))


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Log in (JSON) and get a JWT access token",
    responses={
        401: {"model": AuthResponse, "description": "Invalid email or password"},
        403: {"model": AuthResponse, "description": "Account is inactive"},
    },
)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        user, token = await auth_service.login(db, payload, _client_ip(request))
    except InvalidCredentials:
        return error_response(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    except InactiveAccount:
        return error_response(status.HTTP_403_FORBIDDEN, "Account is inactive")
    return AuthResponse(
        Success=True, Message="Login successful", Token=token, TokenType="bearer", Data=UserData.from_user(user)
    )


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="OAuth2 password login (used by Swagger's Authorize button)",
    description="Form fields: username = your email, password.",
    responses={401: {"description": "Invalid email or password"}, 403: {"description": "Account is inactive"}},
)
async def token(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    try:
        credentials = LoginRequest(Email=form.username, Password=form.password)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    try:
        _, access_token = await auth_service.login(db, credentials, _client_ip(request))
    except InvalidCredentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InactiveAccount:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserData, summary="The logged-in account and its role")
async def me(user: Signup = Depends(get_current_user)):
    return UserData.from_user(user)


@router.get(
    "/roles",
    response_model=List[RoleResponse],
    summary="All roles",
    dependencies=[Depends(require_roles(ADMIN_ONLY))],
)
async def roles(db: AsyncSession = Depends(get_db)):
    return [RoleResponse(Id=r.Id, Name=r.Name, Description=r.Description) for r in await auth_service.get_roles(db)]


# --- User management (ADMIN / SUPER_ADMIN) ---------------------------------------------


@users_router.get("", response_model=UserListResponse, summary="List accounts")
async def list_users(
    role: Optional[RoleName] = Query(None, description="Only this role"),
    branch_id: Optional[int] = Query(None, description="Only accounts scoped to this branch"),
    search: Optional[str] = Query(None, max_length=100, description="Part of the name or email"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: Signup = Depends(require_roles(ADMIN_ONLY)),
):
    total, users = await auth_service.get_users(db, skip, limit, role, search, branch_id)
    return UserListResponse(Total=total, Skip=skip, Limit=limit, Items=[UserData.from_user(u) for u in users])


@users_router.post(
    "",
    response_model=UserData,
    status_code=status.HTTP_201_CREATED,
    summary="Create a staff account with a role",
    description="ADMIN can create INVENTORY_MANAGER, CASHIER and CUSTOMER accounts; only SUPER_ADMIN can create admins.",
    responses={400: {"description": "Email already registered"}},
)
async def create_user(
    payload: StaffCreateRequest,
    db: AsyncSession = Depends(get_db),
    actor: Signup = Depends(require_roles(ADMIN_ONLY)),
):
    try:
        return UserData.from_user(await auth_service.create_staff(db, payload, actor))
    except EmailAlreadyRegistered:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already registered")
    except RoleChangeNotAllowed as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@users_router.put(
    "/{id}/role",
    response_model=UserData,
    summary="Change an account's role",
    description="Takes effect on the user's next request. You can't change your own role.",
    responses={404: {"description": "User not found"}},
)
async def change_role(
    id: int,
    payload: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    actor: Signup = Depends(require_roles(ADMIN_ONLY)),
):
    try:
        return UserData.from_user(await auth_service.change_role(db, id, payload.Role, actor))
    except UserNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {id} not found")
    except RoleChangeNotAllowed as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@users_router.delete(
    "/{id}",
    response_model=UserData,
    summary="Deactivate an account",
    description="Soft-deactivate: the account can no longer log in, but its history is kept. You can't deactivate your own account.",
    responses={404: {"description": "User not found"}},
)
async def deactivate_account(
    id: int,
    db: AsyncSession = Depends(get_db),
    actor: Signup = Depends(require_roles(ADMIN_ONLY)),
):
    try:
        return UserData.from_user(await auth_service.deactivate_user(db, id, actor))
    except UserNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {id} not found")
    except RoleChangeNotAllowed as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
