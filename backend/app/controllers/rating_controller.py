from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import EVERYONE, RoleName
from app.db.session import get_db
from app.models import Signup
from app.schemas.rating_schema import RatingCreate, RatingListResponse, RatingResponse
from app.services import rating_service
from app.services.rating_service import MenuItemNotFound, NoCustomerProfile, OrderNotOwnedByCustomer

router = APIRouter(
    prefix="/api/v1/ratings",
    tags=["Ratings"],
    dependencies=[Depends(require_roles(EVERYONE))],
    responses={401: {"description": "Missing, invalid or expired token"}},
)

# Only a CUSTOMER submits ratings — staff accounts have no customer profile to rate as.
customer_only = require_roles([RoleName.CUSTOMER], allow_super_admin=False)


@router.post("", response_model=RatingResponse, status_code=status.HTTP_201_CREATED, summary="Rate a menu item")
async def create_rating(
    payload: RatingCreate,
    db: AsyncSession = Depends(get_db),
    user: Signup = Depends(customer_only),
):
    try:
        rating = await rating_service.create_rating(db, payload, user)
    except NoCustomerProfile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your account has no linked customer profile")
    except MenuItemNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Menu item {payload.MenuItemId} not found")
    except OrderNotOwnedByCustomer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That order doesn't belong to you")
    return RatingResponse.from_model(rating)


@router.get("/menu-item/{id}", response_model=RatingListResponse, summary="Ratings for a menu item")
async def ratings_for_menu_item(
    id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    total, rows = await rating_service.list_for_menu_item(db, id, skip, limit)
    return RatingListResponse(Total=total, Skip=skip, Limit=limit, Items=[RatingResponse.from_model(r) for r in rows])


@router.get("/me", response_model=RatingListResponse, summary="My submitted ratings")
async def my_ratings(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: Signup = Depends(customer_only),
):
    if user.CustomerId is None:
        return RatingListResponse(Total=0, Skip=skip, Limit=limit, Items=[])
    total, rows = await rating_service.list_for_customer(db, user.CustomerId, skip, limit)
    return RatingListResponse(Total=total, Skip=skip, Limit=limit, Items=[RatingResponse.from_model(r) for r in rows])
