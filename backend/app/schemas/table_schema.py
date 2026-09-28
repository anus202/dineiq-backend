from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Money

class TableStatusEnum(str, Enum):
    AVAILABLE = "AVAILABLE"
    OCCUPIED = "OCCUPIED"
    RESERVED = "RESERVED"

class ManualTableStatusEnum(str, Enum):

    AVAILABLE = "AVAILABLE"
    RESERVED = "RESERVED"

class TableCreate(BaseModel):
    TableNumber: str = Field(..., min_length=1, max_length=20, examples=["T-01"])
    Capacity: int = Field(..., ge=1, le=50, examples=[4])

    @field_validator("TableNumber")
    @classmethod
    def strip_number(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("TableNumber cannot be blank")
        return value

class TableStatusUpdate(BaseModel):
    Status: ManualTableStatusEnum = Field(..., examples=[ManualTableStatusEnum.RESERVED])

class TableAssignRequest(BaseModel):
    TableId: int = Field(..., gt=0, examples=[1])
    OrderId: int = Field(..., gt=0, examples=[1])
    GuestCount: Optional[int] = Field(None, ge=1, le=50, description="Pax; omit to keep the order's GuestCount", examples=[4])

class SeatedOrder(BaseModel):
    OrderId: int
    OrderNumber: str
    GuestCount: int
    NetAmount: Money
    OrderDate: datetime

class TableResponse(BaseModel):
    Id: int
    TableNumber: str
    Capacity: int
    Status: str
    CurrentOrder: Optional[SeatedOrder] = Field(None, description="The Pending order seated here, if any")

class TableListResponse(BaseModel):
    Total: int
    Available: int
    Occupied: int
    Reserved: int
    Items: List[TableResponse]
