import math
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit
from app.core.config import LOYALTY_POINT_VALUE_PKR, LOYALTY_POINTS_PER_100, RESTAURANT_NAME
from app.db.sequences import INVOICE_NUMBERS
from app.models import Customer, Order, OrderDetail, Payment, Signup
from app.models.base import utc_now
from app.schemas.common import TWO_PLACES
from app.schemas.order_schema import OrderStatusEnum, PaymentMethodEnum
from app.schemas.payment_schema import (
    BillBreakdown,
    InvoiceLine,
    InvoiceResponse,
    PaymentPreviewResponse,
    SettleRequest,
)
from app.services import order_service
from app.services.loyalty_service import tier_for

ZERO = Decimal("0.00")

class PaymentError(Exception):
    pass

class OrderNotFound(PaymentError):
    def __init__(self, order_id: int):
        super().__init__(f"Order {order_id} not found")

class OrderNotPayable(PaymentError):
    pass

class InvalidPayment(PaymentError):
    pass

@dataclass
class _Bill:
    breakdown: BillBreakdown
    method: PaymentMethodEnum
    customer: Optional[Customer]

def _money(value) -> Decimal:
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

async def _load_order(db: AsyncSession, order_id: int) -> Order:
    order = await db.scalar(
        select(Order)
        .options(
            selectinload(Order.Customer),
            selectinload(Order.Table),
            selectinload(Order.Payment),
            selectinload(Order.items).selectinload(OrderDetail.MenuItem),
        )
        .where(Order.Id == order_id, Order.IsDeleted == False)
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise OrderNotFound(order_id)
    return order

def _compute_bill(order: Order, payload: SettleRequest) -> _Bill:
    if order.Payment is not None:
        raise OrderNotPayable(f"Order {order.OrderNumber} is already settled (invoice {order.Payment.InvoiceNumber})")
    if order.Status != OrderStatusEnum.PENDING.value:
        raise OrderNotPayable(f"Order {order.OrderNumber} is {order.Status}; only Pending orders can be settled")

    customer = order.Customer if order.Customer is not None and not order.Customer.IsDeleted else None
    uses_points = payload.PaymentMethod == PaymentMethodEnum.LOYALTY_POINTS or payload.RedeemPoints > 0
    if uses_points and customer is None:
        raise InvalidPayment("Loyalty points need a registered customer on the order")

    subtotal = _money(order.TotalAmount)
    order_discount = _money(order.Discount)
    base = subtotal - order_discount
    tier = tier_for(customer.LoyaltyPoints) if customer else None
    tier_percent = tier.discount_percent if tier else 0
    tier_discount = _money(base * tier_percent / 100)
    due = base - tier_discount

    balance = customer.LoyaltyPoints if customer else 0
    points_for_full_bill = math.ceil(due / LOYALTY_POINT_VALUE_PKR) if due > 0 else 0
    if payload.PaymentMethod == PaymentMethodEnum.LOYALTY_POINTS:
        points_used = points_for_full_bill
    else:
        points_used = min(payload.RedeemPoints, points_for_full_bill)
    if points_used > balance:
        raise InvalidPayment(f"Customer has {balance} points; this needs {points_used}")
    redemption = min(_money(points_used * LOYALTY_POINT_VALUE_PKR), due)
    payable = due - redemption

    if payload.PaymentMethod == PaymentMethodEnum.CASH:
        if payload.AmountTendered is None:
            raise InvalidPayment("AmountTendered is required for Cash")
        if payload.AmountTendered < payable:
            raise InvalidPayment(f"AmountTendered {payload.AmountTendered} is less than the {payable} payable")
        tendered = _money(payload.AmountTendered)
    else:
        tendered = payable
    earned = int(payable // 100) * LOYALTY_POINTS_PER_100 if customer else 0

    return _Bill(
        breakdown=BillBreakdown(
            SubTotal=subtotal,
            OrderDiscount=order_discount,
            TierName=tier.name if tier else None,
            TierDiscountPercentage=tier_percent,
            TierDiscount=tier_discount,
            AmountDue=due,
            PointsRedeemed=points_used,
            PointsRedemptionAmount=redemption,
            AmountPayable=payable,
            AmountTendered=tendered,
            ChangeDue=tendered - payable,
            PointsEarned=earned,
            PointsBalanceBefore=balance if customer else None,
            PointsBalanceAfter=balance - points_used + earned if customer else None,
        ),
        method=payload.PaymentMethod,
        customer=customer,
    )

async def preview(db: AsyncSession, payload: SettleRequest) -> PaymentPreviewResponse:
    order = await _load_order(db, payload.OrderId)
    bill = _compute_bill(order, payload)
    return PaymentPreviewResponse(
        OrderId=order.Id, OrderNumber=order.OrderNumber, PaymentMethod=bill.method.value, Bill=bill.breakdown
    )

async def settle(db: AsyncSession, payload: SettleRequest, cashier: Signup) -> InvoiceResponse:

    cashier_id = cashier.Id
    year = utc_now().year

    await INVOICE_NUMBERS.ensure(db, year)

    async def once() -> InvoiceResponse:
        order = await _load_order(db, payload.OrderId)
        bill = _compute_bill(order, payload)
        b = bill.breakdown

        alerts = await order_service.apply_status_change(
            db,
            order.Id,
            OrderStatusEnum.COMPLETED,
            cashier_id,
            Discount=b.OrderDiscount + b.TierDiscount,
            NetAmount=b.AmountDue,
            PaymentMethod=bill.method.value,
        )

        if bill.customer is not None and (b.PointsRedeemed or b.PointsEarned):

            new_balance = await db.scalar(
                update(Customer)
                .where(Customer.Id == bill.customer.Id, Customer.LoyaltyPoints >= b.PointsRedeemed)
                .values(LoyaltyPoints=Customer.LoyaltyPoints - b.PointsRedeemed + b.PointsEarned, UpdatedBy=cashier_id)
                .returning(Customer.LoyaltyPoints)
                .execution_options(synchronize_session=False)
            )
            if new_balance is None:
                await db.rollback()
                raise InvalidPayment("The customer's points balance changed; preview the bill again")
            b.PointsBalanceAfter = new_balance
            await audit.record(
                db, "POINTS_CHANGE", "Customer", bill.customer.Id,
                {"LoyaltyPoints": new_balance + b.PointsRedeemed - b.PointsEarned},
                {"LoyaltyPoints": new_balance, "Redeemed": b.PointsRedeemed, "Earned": b.PointsEarned, "OrderId": order.Id},
                cashier_id,
            )

        payment = Payment(
            InvoiceNumber=await INVOICE_NUMBERS.next(db, year),
            OrderId=order.Id,
            CustomerId=bill.customer.Id if bill.customer else None,
            PaymentMethod=bill.method.value,
            SubTotal=b.SubTotal,
            OrderDiscount=b.OrderDiscount,
            TierName=b.TierName,
            TierDiscountPercentage=b.TierDiscountPercentage,
            TierDiscount=b.TierDiscount,
            AmountDue=b.AmountDue,
            PointsRedeemed=b.PointsRedeemed,
            PointsRedemptionAmount=b.PointsRedemptionAmount,
            AmountPayable=b.AmountPayable,
            AmountTendered=b.AmountTendered,
            ChangeDue=b.ChangeDue,
            PointsEarned=b.PointsEarned,
            CreatedBy=cashier_id,
            UpdatedBy=cashier_id,
        )
        db.add(payment)
        await db.commit()

        invoice = await get_invoice(db, payment.InvoiceNumber)
        invoice.Bill.PointsBalanceBefore = b.PointsBalanceBefore
        invoice.Bill.PointsBalanceAfter = b.PointsBalanceAfter
        invoice.LowStockAlerts = alerts or []
        return invoice

    return await order_service.run_with_deadlock_retry(db, once)

async def get_invoice(db: AsyncSession, invoice_number: str) -> Optional[InvoiceResponse]:
    row = (
        await db.execute(
            select(Payment, Signup.FullName)
            .options(
                selectinload(Payment.Customer),
                selectinload(Payment.Order).selectinload(Order.Table),
                selectinload(Payment.Order).selectinload(Order.items).selectinload(OrderDetail.MenuItem),
            )
            .outerjoin(Signup, Signup.Id == Payment.CreatedBy)
            .where(Payment.InvoiceNumber == invoice_number)
            .execution_options(populate_existing=True)
        )
    ).first()
    if row is None:
        return None
    payment, cashier_name = row
    order = payment.Order
    return InvoiceResponse(
        InvoiceNumber=payment.InvoiceNumber,
        RestaurantName=RESTAURANT_NAME,
        PaidAt=payment.PaidAt,
        OrderId=order.Id,
        OrderNumber=order.OrderNumber,
        OrderType=order.OrderType,
        TableNumber=order.Table.TableNumber if order.Table else None,
        GuestCount=order.GuestCount,
        CustomerName=payment.Customer.Name if payment.Customer else None,
        CustomerPhone=payment.Customer.Phone if payment.Customer else None,
        CashierName=cashier_name,
        PaymentMethod=payment.PaymentMethod,
        Lines=[
            InvoiceLine(MenuItemName=d.MenuItem.Name, Quantity=d.Quantity, UnitPrice=d.UnitPrice, TotalPrice=d.TotalPrice)
            for d in order.items
        ],
        Bill=BillBreakdown(
            SubTotal=payment.SubTotal,
            OrderDiscount=payment.OrderDiscount,
            TierName=payment.TierName,
            TierDiscountPercentage=payment.TierDiscountPercentage,
            TierDiscount=payment.TierDiscount,
            AmountDue=payment.AmountDue,
            PointsRedeemed=payment.PointsRedeemed,
            PointsRedemptionAmount=payment.PointsRedemptionAmount,
            AmountPayable=payment.AmountPayable,
            AmountTendered=payment.AmountTendered,
            ChangeDue=payment.ChangeDue,
            PointsEarned=payment.PointsEarned,
        ),
    )
