from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

class CategoryBase(BaseModel):
    Name: str = Field(..., min_length=1, max_length=100, examples=["Desserts"])

    @field_validator("Name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(CategoryBase):
    pass

class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    Id: int
    Name: str
    IsActive: bool
    CreatedBy: Optional[int] = None
    UpdatedBy: Optional[int] = None
    CreatedAt: datetime
    UpdatedAt: datetime
