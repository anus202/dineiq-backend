from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING, Optional

from pydantic import BaseModel, Field, computed_field, field_validator

from app.schemas.common import TWO_PLACES, Money

if TYPE_CHECKING:
    from app.models import MenuItem


def _strip_required(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    value = value.strip()
    if not value:
        raise ValueError("Name cannot be blank")
    return value


def _strip_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    return value.strip() or None


class MenuItemCreate(BaseModel):
    CategoryId: int = Field(..., gt=0, examples=[1])
    Name: str = Field(..., min_length=1, max_length=150, examples=["Chicken Biryani"])
    Description: Optional[str] = Field(None, max_length=500, examples=["Basmati rice with spiced chicken"])
    Price: Money = Field(..., gt=0, examples=[850.00])
    Cost: Money = Field(Decimal("0"), ge=0, examples=[420.00])
    IsAvailable: bool = True

    _name = field_validator("Name")(_strip_required)
    _description = field_validator("Description")(_strip_optional)


class MenuItemUpdate(BaseModel):
    """Send only the fields to change (partial update) or all of them (full update)."""

    CategoryId: Optional[int] = Field(None, gt=0, examples=[1])
    Name: Optional[str] = Field(None, min_length=1, max_length=150, examples=["Chicken Biryani (Large)"])
    Description: Optional[str] = Field(None, max_length=500)
    Price: Optional[Money] = Field(None, gt=0, examples=[950.00])
    Cost: Optional[Money] = Field(None, ge=0, examples=[460.00])
    IsAvailable: Optional[bool] = None

    _name = field_validator("Name")(_strip_required)
    _description = field_validator("Description")(_strip_optional)

    @field_validator("CategoryId", "Name", "Price", "Cost", "IsAvailable")
    @classmethod
    def not_null(cls, value):
        # Omit a field to leave it unchanged; an explicit null would violate NOT NULL.
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the current value")
        return value


class CategorySummary(BaseModel):
    CategoryId: int
    CategoryName: str


class MenuItemResponse(BaseModel):
    Id: int
    CategoryId: int
    Name: str
    Description: Optional[str] = None
    Price: Money
    Cost: Money
    IsAvailable: bool
    IsActive: bool
    Category: CategorySummary
    CreatedBy: Optional[int] = None
    UpdatedBy: Optional[int] = None
    CreatedAt: datetime
    UpdatedAt: datetime

    @computed_field
    @property
    def ContributionMargin(self) -> Money:
        return (self.Price - self.Cost).quantize(TWO_PLACES)

    @computed_field
    @property
    def ProfitMarginPercentage(self) -> Money:
        """Contribution margin as a percentage of price."""
        return ((self.Price - self.Cost) / self.Price * 100).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    @classmethod
    def from_model(cls, item: "MenuItem") -> "MenuItemResponse":
        """Build from an ORM MenuItem whose Category relationship is loaded."""
        return cls(
            Id=item.Id,
            CategoryId=item.CategoryId,
            Name=item.Name,
            Description=item.Description,
            Price=item.Price,
            Cost=item.Cost,
            IsAvailable=item.IsAvailable,
            IsActive=item.IsActive,
            Category=CategorySummary(CategoryId=item.Category.Id, CategoryName=item.Category.Name),
            CreatedBy=item.CreatedBy,
            UpdatedBy=item.UpdatedBy,
            CreatedAt=item.CreatedAt,
            UpdatedAt=item.UpdatedAt,
        )


class MenuItemListResponse(BaseModel):
    Total: int = Field(..., description="Items matching the filters, before pagination")
    Skip: int
    Limit: int
    Items: list[MenuItemResponse]
