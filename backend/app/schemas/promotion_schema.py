from typing import Optional

from pydantic import BaseModel


class PromoValidateResponse(BaseModel):
    Valid: bool
    Code: Optional[str] = None
    PromotionName: Optional[str] = None
    DiscountPercent: Optional[int] = None
    Message: str
