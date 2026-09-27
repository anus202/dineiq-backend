from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models import Signup
from app.schemas.promotion_schema import PromoValidateResponse
from app.services import promotion_service

# Any logged-in user (staff placing an order, or a customer checking out) can check a
# voucher code -- there's nothing role-sensitive about it.
router = APIRouter(
    prefix="/api/v1/promotions",
    tags=["Promotions"],
    dependencies=[Depends(get_current_user)],
    responses={401: {"description": "Missing, invalid or expired token"}},
)


@router.get(
    "/validate/{code}",
    response_model=PromoValidateResponse,
    summary="Validate a voucher/promo code",
    description="Returns Valid=false with a generic message for any code that doesn't currently redeem "
    "(unknown, expired, inactive, or not valid at the given branch) -- never says which.",
)
async def validate_promo_code(
    code: str,
    branch_id: Optional[int] = Query(None, gt=0, description="Check this code against a specific branch"),
    db: AsyncSession = Depends(get_db),
    _current_user: Signup = Depends(get_current_user),
):
    promotion = await promotion_service.validate_code(db, code, branch_id)
    if promotion is None:
        return PromoValidateResponse(Valid=False, Message="This code isn't valid.")
    return PromoValidateResponse(
        Valid=True,
        Code=promotion.Code,
        PromotionName=promotion.Name,
        DiscountPercent=promotion.DiscountPercent,
        Message=f"{promotion.DiscountPercent}% off applied.",
    )
