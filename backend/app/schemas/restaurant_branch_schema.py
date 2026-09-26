from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _strip_required(value: str, field_name: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{field_name} cannot be blank")
    return value


class RestaurantBranchBase(BaseModel):
    BranchName: str = Field(..., min_length=1, max_length=150, examples=["Gulberg Branch"])
    Address: str = Field(..., min_length=1, max_length=255, examples=["12-A Main Boulevard"])
    City: str = Field(..., min_length=1, max_length=100, examples=["Lahore"])
    Phone: str = Field(..., min_length=1, max_length=20, examples=["+92 42 1234567"])
    OperatingHours: str = Field(..., min_length=1, max_length=100, examples=["9:00 AM - 11:00 PM"])

    @field_validator("BranchName")
    @classmethod
    def _branch_name(cls, value: str) -> str:
        return _strip_required(value, "BranchName")

    @field_validator("Address")
    @classmethod
    def _address(cls, value: str) -> str:
        return _strip_required(value, "Address")

    @field_validator("City")
    @classmethod
    def _city(cls, value: str) -> str:
        return _strip_required(value, "City")

    @field_validator("Phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return _strip_required(value, "Phone")

    @field_validator("OperatingHours")
    @classmethod
    def _hours(cls, value: str) -> str:
        return _strip_required(value, "OperatingHours")


class RestaurantBranchCreate(RestaurantBranchBase):
    ManagerId: Optional[int] = Field(None, description="Signup.Id of the assigned branch manager")
    IsActive: bool = True


class RestaurantBranchUpdate(RestaurantBranchBase):
    ManagerId: Optional[int] = None
    IsActive: bool = True


class RestaurantBranchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    Id: int
    BranchName: str
    Address: str
    City: str
    Phone: str
    OperatingHours: str
    ManagerId: Optional[int] = None
    ManagerName: Optional[str] = None
    IsActive: bool
    TotalRevenue: float = 0.0
    CreatedAt: datetime
    UpdatedAt: datetime
