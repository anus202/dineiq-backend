import re
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator

from app.schemas.common import TWO_PLACES, Money, MoneyTotal

_PHONE_SEPARATORS = re.compile(r"[\s\-().]")
_PHONE_PATTERN = re.compile(r"^\+?\d{7,15}$")


def normalize_phone(value: str) -> str:
    """Drop spaces, dashes, dots and brackets: "0300-123 4567" -> "03001234567"."""
    return _PHONE_SEPARATORS.sub("", value.strip())


def validate_phone(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    phone = normalize_phone(value)
    if not _PHONE_PATTERN.match(phone):
        raise ValueError("Phone must be 7-15 digits, optionally starting with +")
    return phone


def _strip_name(value: Optional[str]) -> Optional[str]:
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


def _lower_email(value: Optional[str]) -> Optional[str]:
    return value.lower() if value else value


class CustomerCreate(BaseModel):
    Name: str = Field(..., min_length=1, max_length=100, examples=["Ahmed Raza"])
    Phone: str = Field(..., max_length=20, examples=["0300-1234567"])
    Email: Optional[EmailStr] = Field(None, max_length=100, examples=["ahmed@example.com"])
    Address: Optional[str] = Field(None, max_length=250, examples=["House 12, Block 5, Gulshan-e-Iqbal, Karachi"])

    _name = field_validator("Name")(_strip_name)
    _phone = field_validator("Phone")(validate_phone)
    _email = field_validator("Email")(_lower_email)
    _address = field_validator("Address")(_strip_optional)


class CustomerUpdate(BaseModel):
    """Send only the fields to change."""

    Name: Optional[str] = Field(None, min_length=1, max_length=100)
    Phone: Optional[str] = Field(None, max_length=20)
    Email: Optional[EmailStr] = Field(None, max_length=100)
    Address: Optional[str] = Field(None, max_length=250)

    _name = field_validator("Name")(_strip_name)
    _phone = field_validator("Phone")(validate_phone)
    _email = field_validator("Email")(_lower_email)
    _address = field_validator("Address")(_strip_optional)

    @field_validator("Name", "Phone")
    @classmethod
    def not_null(cls, value):
        # Omit a field to leave it unchanged; an explicit null would violate NOT NULL.
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the current value")
        return value


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    Id: int
    Name: str
    Phone: str
    Email: Optional[str] = None
    Address: Optional[str] = None
    LoyaltyPoints: int
    IsActive: bool
    CreatedBy: Optional[int] = None
    UpdatedBy: Optional[int] = None
    CreatedAt: datetime
    UpdatedAt: datetime


class CustomerListResponse(BaseModel):
    Total: int = Field(..., description="Customers matching the search, before pagination")
    Skip: int
    Limit: int
    Items: List[CustomerResponse]


class CustomerOrderSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    Id: int
    OrderNumber: str
    OrderDate: datetime
    OrderType: str
    Status: str
    GuestCount: int
    TotalAmount: Money
    NetAmount: Money


class CustomerStats(BaseModel):
    """Lifetime figures over the customer's Completed orders (Pending ones aren't paid yet)."""

    TotalOrders: int
    TotalSpent: MoneyTotal = Field(..., description="Sum of NetAmount (Customer Lifetime Value)")
    TotalGuests: int
    LastOrderDate: Optional[datetime] = None

    @computed_field
    @property
    def AverageOrderValue(self) -> MoneyTotal:
        return (self.TotalSpent / self.TotalOrders).quantize(TWO_PLACES) if self.TotalOrders else Decimal("0.00")

    @computed_field(description="TotalSpent / TotalGuests: what was actually paid per guest")
    @property
    def AverageSpendPerGuest(self) -> MoneyTotal:
        return (self.TotalSpent / self.TotalGuests).quantize(TWO_PLACES) if self.TotalGuests else Decimal("0.00")


class CustomerDetailResponse(CustomerResponse):
    Stats: CustomerStats
    RecentOrders: List[CustomerOrderSummary] = Field(..., description="Latest orders first (up to 50)")
