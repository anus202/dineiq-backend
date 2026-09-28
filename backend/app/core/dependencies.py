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
            Signup.IsActive == True,
            Signup.IsDeleted == False,
        )
    )
    if user is None:
        raise _unauthorized("User not found or inactive")
    current_user_id.set(user.Id)
    return user

def require_roles(roles: Iterable[RoleName | str], *, allow_super_admin: bool = True, extra_permission: Optional[str] = None) -> Callable:
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
