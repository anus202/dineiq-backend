from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

class RatingCreate(BaseModel):
    MenuItemId: int
    OrderId: Optional[int] = Field(None, description="Ties the rating to the order it came from, if known")
    Score: int = Field(..., ge=1, le=5)
    Comment: Optional[str] = Field(None, max_length=500)

class RatingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    Id: int
    MenuItemId: int
    MenuItemName: str
    CustomerId: int
    CustomerName: str
    OrderId: Optional[int] = None
    BranchId: Optional[int] = None
    Score: int
    Comment: Optional[str] = None
    CreatedAt: datetime

    @classmethod
    def from_model(cls, r) -> "RatingResponse":
        return cls(
            Id=r.Id,
            MenuItemId=r.MenuItemId,
            MenuItemName=r.MenuItem.Name,
            CustomerId=r.CustomerId,
            CustomerName=r.Customer.Name,
            OrderId=r.OrderId,
            BranchId=r.BranchId,
            Score=r.Score,
            Comment=r.Comment,
            CreatedAt=r.CreatedAt,
        )

class RatingListResponse(BaseModel):
    Total: int
    Skip: int
    Limit: int
    Items: List[RatingResponse]

class MenuItemRatingSummary(BaseModel):
    MenuItemId: int
    AverageScore: float
    RatingCount: int
