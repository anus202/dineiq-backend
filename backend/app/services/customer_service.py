import re
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Order
from app.schemas.customer_schema import CustomerCreate, CustomerStats, CustomerUpdate, normalize_phone
from app.schemas.order_schema import OrderStatusEnum

RECENT_ORDERS_LIMIT = 50

_PHONE_LIKE = re.compile(r"^\+?\d+$")

class PhoneAlreadyRegistered(Exception):
    def __init__(self, phone: str):
        super().__init__(f"A customer with phone {phone} already exists")

def _active():
    return Customer.IsDeleted == False

async def _phone_taken(db: AsyncSession, phone: str, exclude_id: Optional[int] = None) -> bool:
    query = select(Customer.Id).where(Customer.Phone == phone)
    if exclude_id is not None:
        query = query.where(Customer.Id != exclude_id)
    return await db.scalar(query) is not None

async def create_customer(db: AsyncSession, payload: CustomerCreate, user_id: int) -> Customer:
    if await _phone_taken(db, payload.Phone):
        raise PhoneAlreadyRegistered(payload.Phone)

    customer = Customer(**payload.model_dump(), CreatedBy=user_id, UpdatedBy=user_id)
    db.add(customer)
    try:
        await db.commit()
    except IntegrityError:

        await db.rollback()
        raise PhoneAlreadyRegistered(payload.Phone)
    return customer

async def update_customer(
    db: AsyncSession, customer_id: int, payload: CustomerUpdate, user_id: int
) -> Optional[Customer]:
    customer = await db.scalar(select(Customer).where(Customer.Id == customer_id, _active()))
    if customer is None:
        return None

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return customer
    if "Phone" in changes and await _phone_taken(db, changes["Phone"], exclude_id=customer_id):
        raise PhoneAlreadyRegistered(changes["Phone"])

    for field, value in changes.items():
        setattr(customer, field, value)
    customer.UpdatedBy = user_id
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise PhoneAlreadyRegistered(changes["Phone"])
    await db.refresh(customer)
    return customer

async def get_customers(
    db: AsyncSession, skip: int = 0, limit: int = 20, search: Optional[str] = None
) -> tuple[int, list[Customer]]:
    filters = [_active()]
    if search and search.strip():
        term = search.strip()
        phone_term = normalize_phone(term)
        if _PHONE_LIKE.match(phone_term):
            filters.append(Customer.Phone.contains(phone_term, autoescape=True))
        else:
            filters.append(Customer.Name.contains(term, autoescape=True))

    total = await db.scalar(select(func.count()).select_from(Customer).where(*filters))
    customers = await db.scalars(
        select(Customer)
        .where(*filters)
        .order_by(Customer.CreatedAt.desc(), Customer.Id.desc())
        .offset(skip)
        .limit(limit)
    )
    return total or 0, list(customers)

async def get_customer_by_id(db: AsyncSession, customer_id: int) -> Optional[Customer]:
    return await db.scalar(select(Customer).where(Customer.Id == customer_id, _active()))

async def get_customer_history(db: AsyncSession, customer_id: int) -> tuple[CustomerStats, list[Order]]:
    counted = [
        Order.CustomerId == customer_id,
        Order.IsDeleted == False,
        Order.Status == OrderStatusEnum.COMPLETED.value,
    ]
    row = (
        await db.execute(
            select(
                func.count(Order.Id),
                func.coalesce(func.sum(Order.NetAmount), 0),
                func.coalesce(func.sum(Order.GuestCount), 0),
                func.max(Order.OrderDate),
            ).where(*counted)
        )
    ).one()
    stats = CustomerStats(
        TotalOrders=row[0], TotalSpent=Decimal(row[1]), TotalGuests=row[2], LastOrderDate=row[3]
    )

    recent = await db.scalars(
        select(Order)
        .where(Order.CustomerId == customer_id, Order.IsDeleted == False)
        .order_by(Order.OrderDate.desc(), Order.Id.desc())
        .limit(RECENT_ORDERS_LIMIT)
    )
    return stats, list(recent)
