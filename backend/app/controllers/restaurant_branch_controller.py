from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_roles
from app.core.roles import ADMIN_ONLY
from app.db.session import get_db
from app.models import Signup
from app.schemas.restaurant_branch_schema import (
    RestaurantBranchCreate,
    RestaurantBranchResponse,
    RestaurantBranchUpdate,
)
from app.services import restaurant_branch_service

# Reading the branch list/detail is open to any logged-in user (staff and customers alike
# need it -- e.g. the branch picker on customer self-checkout). Creating, editing or
# deactivating a branch (FR 1.6-ii) stays ADMIN/SUPER_ADMIN-only, applied per-route below.
router = APIRouter(
    prefix="/api/v1/restaurants",
    tags=["Restaurant Branches"],
    responses={401: {"description": "Missing, invalid or expired token"}},
)

NOT_FOUND = {404: {"description": "Branch not found"}}


def _not_found(branch_id: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Branch {branch_id} not found")


@router.get(
    "/branches",
    response_model=list[RestaurantBranchResponse],
    summary="List restaurant branches",
    dependencies=[Depends(get_current_user)],
)
async def list_branches(
    search: Optional[str] = Query(None, max_length=100, description="Part of the branch name or city"),
    is_active: Optional[bool] = Query(None, description="Filter by active/inactive status"),
    db: AsyncSession = Depends(get_db),
):
    return await restaurant_branch_service.get_all(db, search, is_active)


@router.get(
    "/branch/{id}",
    response_model=RestaurantBranchResponse,
    summary="Get branch by ID",
    responses=NOT_FOUND,
    dependencies=[Depends(get_current_user)],
)
async def get_branch(id: int, db: AsyncSession = Depends(get_db)):
    branch = await restaurant_branch_service.get_response_by_id(db, id)
    if branch is None:
        raise _not_found(id)
    return branch


@router.post(
    "/branch",
    response_model=RestaurantBranchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a restaurant branch",
    responses={403: {"description": "Requires ADMIN or SUPER_ADMIN"}},
)
async def create_branch(
    payload: RestaurantBranchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles(ADMIN_ONLY)),
):
    return await restaurant_branch_service.create(db, payload, current_user.Id)


@router.put("/branch/{id}", response_model=RestaurantBranchResponse, summary="Update a restaurant branch", responses=NOT_FOUND)
async def update_branch(
    id: int,
    payload: RestaurantBranchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles(ADMIN_ONLY)),
):
    branch = await restaurant_branch_service.update(db, id, payload, current_user.Id)
    if branch is None:
        raise _not_found(id)
    return branch


@router.delete("/branch/{id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deactivate a restaurant branch", responses=NOT_FOUND)
async def deactivate_branch(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles(ADMIN_ONLY)),
):
    if not await restaurant_branch_service.deactivate(db, id, current_user.Id):
        raise _not_found(id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
