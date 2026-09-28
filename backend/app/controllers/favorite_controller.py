from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import RoleName
from app.db.session import get_db
from app.models import Signup
from app.schemas.favorite_schema import FavoriteListResponse, FavoriteToggleResponse
from app.services import favorite_service
from app.services.favorite_service import MenuItemNotFound

router = APIRouter(
    prefix="/api/v1/favorites",
    tags=["Favorites"],
    dependencies=[Depends(require_roles([RoleName.CUSTOMER]))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Your role can't use this endpoint"}},
)

def _require_customer_profile(user: Signup) -> int:
    if user.CustomerId is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account has no linked customer profile yet, so it can't have favorites.",
        )
    return user.CustomerId

@router.get("", response_model=FavoriteListResponse, summary="My favorited menu items")
async def list_my_favorites(
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles([RoleName.CUSTOMER])),
):
    customer_id = _require_customer_profile(current_user)
    return FavoriteListResponse(MenuItemIds=await favorite_service.list_favorite_ids(db, customer_id))

@router.post(
    "/{menu_item_id}/toggle",
    response_model=FavoriteToggleResponse,
    summary="Toggle a menu item's favorite state",
    description="Adds it to favorites if not already favorited, removes it if it was.",
    responses={404: {"description": "Menu item not found"}},
)
async def toggle_favorite(
    menu_item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles([RoleName.CUSTOMER])),
):
    customer_id = _require_customer_profile(current_user)
    try:
        is_favorite = await favorite_service.toggle_favorite(db, customer_id, menu_item_id, current_user.Id)
    except MenuItemNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return FavoriteToggleResponse(MenuItemId=menu_item_id, IsFavorite=is_favorite)
