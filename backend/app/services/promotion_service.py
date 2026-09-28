from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BUSINESS_UTC_OFFSET_MINUTES
from app.models import Promotion

def _business_today():
    return (datetime.utcnow() + timedelta(minutes=BUSINESS_UTC_OFFSET_MINUTES)).date()

async def validate_code(db: AsyncSession, code: str, branch_id: Optional[int] = None) -> Optional[Promotion]:
    today = _business_today()
    stmt = select(Promotion).where(
        func.lower(Promotion.Code) == code.strip().lower(),
        Promotion.IsDeleted == False,
        Promotion.IsActive == True,
        Promotion.StartDate <= today,
        Promotion.EndDate >= today,
    )
    promotion = await db.scalar(stmt)
    if promotion is None:
        return None
    if promotion.BranchId is not None and branch_id is not None and promotion.BranchId != branch_id:
        return None
    return promotion
