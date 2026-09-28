from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.schemas.common import Money, MoneyTotal
from app.schemas.common import Quantity as Qty

class UnitEnum(str, Enum):
    KG = "kg"
    LITERS = "liters"
    PCS = "pcs"

def _strip_name(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    value = value.strip()
    if not value:
        raise ValueError("ItemName cannot be blank")
    return value

class InventoryItemCreate(BaseModel):
    ItemName: str = Field(..., min_length=1, max_length=150, examples=["Basmati Rice"])
    Unit: UnitEnum = Field(..., examples=[UnitEnum.KG])
    CurrentStock: Qty = Field(Decimal("0"), ge=0, examples=[50])
    ReorderLevel: Qty = Field(Decimal("0"), ge=0, examples=[10])
    UnitCost: Money = Field(Decimal("0"), ge=0, description="Purchase cost per unit (PKR), for valuation", examples=[320])

    _name = field_validator("ItemName")(_strip_name)

class InventoryItemUpdate(BaseModel):

    ItemName: Optional[str] = Field(None, min_length=1, max_length=150)
    Unit: Optional[UnitEnum] = None
    ReorderLevel: Optional[Qty] = Field(None, ge=0)
    UnitCost: Optional[Money] = Field(None, ge=0)

    _name = field_validator("ItemName")(_strip_name)

    @field_validator("ItemName", "Unit", "ReorderLevel", "UnitCost")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the current value")
        return value

class MovementTypeEnum(str, Enum):
    INITIAL_STOCK = "INITIAL_STOCK"
    MANUAL_ADDITION = "MANUAL_ADDITION"
    MANUAL_DEDUCTION = "MANUAL_DEDUCTION"
    ORDER_CONSUMPTION = "ORDER_CONSUMPTION"

class StockAdjustment(BaseModel):
    InventoryItemId: int = Field(..., gt=0, examples=[1])
    Quantity: Qty = Field(
        ..., description="Positive to add stock (purchase), negative to remove (wastage, correction)", examples=[25]
    )
    Reason: str = Field(..., min_length=3, max_length=250, description="Stored in the movement log", examples=["Weekly purchase from Metro"])

    @field_validator("Reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Reason must be at least 3 characters")
        return value

    @field_validator("Quantity")
    @classmethod
    def not_zero(cls, value: Decimal) -> Decimal:
        if value == 0:
            raise ValueError("Quantity cannot be 0")
        return value

class InventoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    Id: int
    ItemName: str
    Unit: str
    CurrentStock: Qty
    ReorderLevel: Qty
    UnitCost: Money
    IsActive: bool
    CreatedBy: Optional[int] = None
    UpdatedBy: Optional[int] = None
    CreatedAt: datetime
    UpdatedAt: datetime

    @computed_field
    @property
    def IsLowStock(self) -> bool:
        return self.CurrentStock <= self.ReorderLevel

class InventoryItemListResponse(BaseModel):
    Total: int
    Skip: int
    Limit: int
    Items: List[InventoryItemResponse]

class LowStockAlert(BaseModel):
    InventoryItemId: int
    ItemName: str
    Unit: str
    CurrentStock: Qty
    ReorderLevel: Qty

    @computed_field(description="How far stock is below the reorder level")
    @property
    def Shortfall(self) -> Qty:
        return self.ReorderLevel - self.CurrentStock

class RecipeLineIn(BaseModel):
    InventoryItemId: int = Field(..., gt=0, examples=[1])
    QuantityRequired: Qty = Field(..., gt=0, description="Per serving, in the item's unit", examples=[0.25])

class RecipeSet(BaseModel):
    Lines: List[RecipeLineIn] = Field(..., max_length=50, description="Replaces the whole recipe; [] clears it")

    @field_validator("Lines")
    @classmethod
    def unique_items(cls, lines: List[RecipeLineIn]) -> List[RecipeLineIn]:
        ids = [line.InventoryItemId for line in lines]
        if len(ids) != len(set(ids)):
            raise ValueError("Each inventory item can appear only once in a recipe")
        return lines

class RecipeLineResponse(BaseModel):
    InventoryItemId: int
    ItemName: str
    Unit: str
    QuantityRequired: Qty

class RecipeResponse(BaseModel):
    MenuItemId: int
    MenuItemName: str
    Lines: List[RecipeLineResponse]

class StockMovementResponse(BaseModel):
    Id: int
    InventoryItemId: int
    ItemName: str
    Unit: str
    MovementType: str
    QuantityChange: Qty
    StockAfter: Qty
    OrderId: Optional[int] = None
    OrderNumber: Optional[str] = None
    Reason: Optional[str] = None
    ChangedBy: Optional[int] = None
    ChangedByName: Optional[str] = None
    ChangedAt: datetime

_Alert = LowStockAlert

class StockAdjustmentResponse(BaseModel):
    Item: InventoryItemResponse
    Movement: StockMovementResponse
    LowStockAlert: Optional[_Alert] = Field(None, description="Set if the item is now at or below its reorder level")

class StockMovementListResponse(BaseModel):
    Total: int
    Skip: int
    Limit: int
    Items: List[StockMovementResponse]

class StockItemStatus(BaseModel):
    InventoryItemId: int
    ItemName: str
    Unit: str
    CurrentStock: Qty
    ReorderLevel: Qty
    UnitCost: Money
    StockValue: MoneyTotal = Field(..., description="max(CurrentStock, 0) x UnitCost")

class StockStatusResponse(BaseModel):
    TotalItems: int
    LowStockCount: int = Field(..., description="In stock but at or below the reorder level")
    OutOfStockCount: int = Field(..., description="CurrentStock <= 0")
    TotalValuation: MoneyTotal = Field(..., description="Value of all stock on hand at unit cost (PKR)")
    LowStock: List[StockItemStatus]
    OutOfStock: List[StockItemStatus]
