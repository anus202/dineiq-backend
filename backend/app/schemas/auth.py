from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.roles import RoleName
from app.schemas.customer_schema import validate_phone

if TYPE_CHECKING:
    from app.models import Signup

def _strip_full_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("FullName cannot be blank")
    return value

def _password_fits_bcrypt(value: str) -> str:

    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return value

class SignupRequest(BaseModel):

    FullName: str = Field(..., min_length=1, max_length=100, examples=["Anas Khan"])
    Email: EmailStr = Field(..., max_length=150, examples=["anas@example.com"])
    PhoneNumber: Optional[str] = Field(
        None, max_length=20, description="Links or creates your customer profile (loyalty points, orders)",
        examples=["03001234567"],
    )
    Password: str = Field(..., min_length=8, examples=["StrongPass123"])

    _full_name = field_validator("FullName")(_strip_full_name)
    _password = field_validator("Password")(_password_fits_bcrypt)

    _phone = field_validator("PhoneNumber")(validate_phone)

class StaffCreateRequest(BaseModel):

    FullName: str = Field(..., min_length=1, max_length=100, examples=["Sara Ali"])
    Email: EmailStr = Field(..., max_length=150, examples=["sara@dineiq.pk"])
    PhoneNumber: Optional[str] = Field(None, max_length=20)
    Password: str = Field(..., min_length=8, examples=["StrongPass123"])
    Role: RoleName = Field(..., examples=[RoleName.CASHIER])

    BranchId: Optional[int] = Field(None, description="Restaurant branch this account is scoped to; omit for all branches")
    CanAccessInventory: bool = False
    CanTriggerPipeline: bool = False
    CanAccessMenuManagement: bool = False
    CanAccessBranchAnalytics: bool = False

    _full_name = field_validator("FullName")(_strip_full_name)
    _password = field_validator("Password")(_password_fits_bcrypt)

class RoleUpdateRequest(BaseModel):
    Role: RoleName = Field(..., examples=[RoleName.INVENTORY_MANAGER])

class LoginRequest(BaseModel):
    Email: EmailStr = Field(..., examples=["anas@example.com"])
    Password: str = Field(..., min_length=1, examples=["StrongPass123"])

class UserData(BaseModel):
    Id: int
    FullName: str
    Email: str
    PhoneNumber: Optional[str] = None
    Role: str
    CustomerId: Optional[int] = Field(None, description="Linked customer profile (CUSTOMER accounts)")
    BranchId: Optional[int] = None
    BranchName: Optional[str] = None
    CanAccessInventory: bool = False
    CanTriggerPipeline: bool = False
    CanAccessMenuManagement: bool = False
    CanAccessBranchAnalytics: bool = False
    IsActive: bool
    CreatedAt: datetime

    @classmethod
    def from_user(cls, user: "Signup") -> "UserData":
        return cls(
            Id=user.Id,
            FullName=user.FullName,
            Email=user.Email,
            PhoneNumber=user.PhoneNumber,
            Role=user.Role.Name,
            CustomerId=user.CustomerId,
            BranchId=user.BranchId,
            BranchName=user.Branch.BranchName if user.Branch else None,
            CanAccessInventory=user.CanAccessInventory,
            CanTriggerPipeline=user.CanTriggerPipeline,
            CanAccessMenuManagement=user.CanAccessMenuManagement,
            CanAccessBranchAnalytics=user.CanAccessBranchAnalytics,
            IsActive=user.IsActive,
            CreatedAt=user.CreatedAt,
        )

class AuthResponse(BaseModel):
    Success: bool
    Message: str
    Token: Optional[str] = None
    TokenType: Optional[str] = None
    Data: Optional[UserData] = None

class TokenResponse(BaseModel):

    access_token: str
    token_type: str = "bearer"

class RoleResponse(BaseModel):
    Id: int
    Name: str
    Description: Optional[str] = None

class UserListResponse(BaseModel):
    Total: int
    Skip: int
    Limit: int
    Items: List[UserData]
