from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, RestaurantBranch
from app.schemas.restaurant_branch_schema import RestaurantBranchCreate, RestaurantBranchResponse, RestaurantBranchUpdate

async def _total_revenue(db: AsyncSession, branch_id: int) -> float:
    total = await db.scalar(
        select(func.coalesce(func.sum(Order.NetAmount), 0)).where(
            Order.BranchId == branch_id, Order.IsDeleted == False
        )
    )
    return float(total or 0)

async def _to_response(db: AsyncSession, branch: RestaurantBranch) -> RestaurantBranchResponse:
    revenue = await _total_revenue(db, branch.Id)
    return RestaurantBranchResponse(
        Id=branch.Id,
        BranchName=branch.BranchName,
        Address=branch.Address,
        City=branch.City,
        Phone=branch.Phone,
        OperatingHours=branch.OperatingHours,
        ManagerId=branch.ManagerId,
        ManagerName=branch.Manager.FullName if branch.Manager else None,
        IsActive=branch.IsActive,
        TotalRevenue=revenue,
        CreatedAt=branch.CreatedAt,
        UpdatedAt=branch.UpdatedAt,
    )

async def get_all(
    db: AsyncSession, search: Optional[str], is_active: Optional[bool]
) -> list[RestaurantBranchResponse]:
    filters = [RestaurantBranch.IsDeleted == False]
    if is_active is not None:
        filters.append(RestaurantBranch.IsActive == is_active)
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(or_(RestaurantBranch.BranchName.like(term), RestaurantBranch.City.like(term)))
    branches = await db.scalars(
        select(RestaurantBranch).where(*filters).order_by(RestaurantBranch.Id)
    )
    return [await _to_response(db, b) for b in branches]

async def get_by_id(db: AsyncSession, branch_id: int) -> Optional[RestaurantBranch]:
    return await db.scalar(
        select(RestaurantBranch).where(RestaurantBranch.Id == branch_id, RestaurantBranch.IsDeleted == False)
    )

async def get_response_by_id(db: AsyncSession, branch_id: int) -> Optional[RestaurantBranchResponse]:
    branch = await get_by_id(db, branch_id)
    return await _to_response(db, branch) if branch else None

async def create(db: AsyncSession, payload: RestaurantBranchCreate, user_id: int) -> RestaurantBranchResponse:
    branch = RestaurantBranch(
        BranchName=payload.BranchName,
        Address=payload.Address,
        City=payload.City,
        Phone=payload.Phone,
        OperatingHours=payload.OperatingHours,
        ManagerId=payload.ManagerId,
        IsActive=payload.IsActive,
        CreatedBy=user_id,
        UpdatedBy=user_id,
    )
    db.add(branch)
    await db.commit()
    await db.refresh(branch, attribute_names=["Manager"])
    return await _to_response(db, branch)

async def update(
    db: AsyncSession, branch_id: int, payload: RestaurantBranchUpdate, user_id: int
) -> Optional[RestaurantBranchResponse]:
    branch = await get_by_id(db, branch_id)
    if branch is None:
        return None
    branch.BranchName = payload.BranchName
    branch.Address = payload.Address
    branch.City = payload.City
    branch.Phone = payload.Phone
    branch.OperatingHours = payload.OperatingHours
    branch.ManagerId = payload.ManagerId
    branch.IsActive = payload.IsActive
    branch.UpdatedBy = user_id
    await db.commit()
    await db.refresh(branch, attribute_names=["Manager"])
    return await _to_response(db, branch)

async def deactivate(db: AsyncSession, branch_id: int, user_id: int) -> bool:
    branch = await get_by_id(db, branch_id)
    if branch is None:
        return False
    branch.IsActive = False
    branch.UpdatedBy = user_id
    await db.commit()
    return True
