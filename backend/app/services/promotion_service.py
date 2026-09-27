from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BUSINESS_UTC_OFFSET_MINUTES
from app.models import Promotion


def _business_today():
    return (datetime.utcnow() + timedelta(minutes=BUSINESS_UTC_OFFSET_MINUTES)).date()


async def validate_code(db: AsyncSession, code: str, branch_id: Optional[int] = None) -> Optional[Promotion]:
    """Looks up an active, in-date, redeemable promotion by its voucher code (case-insensitive).

    A promotion with a NULL BranchId applies everywhere; one with a specific BranchId only
    validates for that branch. Returns None if the code doesn't match anything currently
    redeemable -- the controller turns that into a single generic "invalid code" message
    (never revealing *why* it failed, so a customer can't fish for which codes exist,
    which ones have expired, or which ones are branch-restricted).
    """
    today = _business_today()
    stmt = select(Promotion).where(
        func.lower(Promotion.Code) == code.strip().lower(),
        Promotion.IsDeleted == False,  # noqa: E712
        Promotion.IsActive == True,  # noqa: E712
        Promotion.StartDate <= today,
        Promotion.EndDate >= today,
    )
    promotion = await db.scalar(stmt)
    if promotion is None:
        return None
    if promotion.BranchId is not None and branch_id is not None and promotion.BranchId != branch_id:
        return None
    return promotion
