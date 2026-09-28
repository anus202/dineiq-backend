from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import FRONT_OF_HOUSE
from app.db.session import get_db
from app.models import Signup
from app.schemas.payment_schema import InvoiceResponse, PaymentPreviewResponse, SettleRequest
from app.services import payment_service
from app.services.order_service import InvalidStatusTransition
from app.services.payment_service import InvalidPayment, OrderNotFound, OrderNotPayable

router = APIRouter(
    prefix="/api/v1/payments",
    tags=["Payments & Invoices"],
    dependencies=[Depends(require_roles(FRONT_OF_HOUSE))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Requires ADMIN or CASHIER"}},
)

ERRORS = {
    400: {"description": "Can't pay this way: not enough cash or points, or points without a customer"},
    404: {"description": "Order not found"},
    409: {"description": "Order already settled, completed or cancelled"},
}

def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, OrderNotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, (OrderNotPayable, InvalidStatusTransition)):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

@router.post(
    "/preview",
    response_model=PaymentPreviewResponse,
    summary="Preview a bill (nothing is saved)",
    description="The same discounts, points and change as settle, to show the customer before paying.",
    responses=ERRORS,
)
async def preview(payload: SettleRequest, db: AsyncSession = Depends(get_db)):
    try:
        return await payment_service.preview(db, payload)
    except (OrderNotFound, OrderNotPayable, InvalidPayment) as exc:
        raise _http_error(exc)

@router.post(
    "/settle",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Settle a bill and generate the invoice",
    description=(
        "Applies the order discount, the customer's loyalty-tier discount and any points redemption, takes "
        "Cash / Card / Loyalty Points payment, and in one transaction: completes the order (deducting its "
        "ingredients), frees its table, updates the customer's points and records the invoice. "
        "Returns the receipt data."
    ),
    responses=ERRORS,
)
async def settle(
    payload: SettleRequest,
    db: AsyncSession = Depends(get_db),
    cashier: Signup = Depends(require_roles(FRONT_OF_HOUSE)),
):
    try:
        return await payment_service.settle(db, payload, cashier)
    except (OrderNotFound, OrderNotPayable, InvalidPayment, InvalidStatusTransition) as exc:
        raise _http_error(exc)

@router.get(
    "/invoices/{invoice_number}",
    response_model=InvoiceResponse,
    summary="Reprint an invoice",
    responses={404: {"description": "Invoice not found"}},
)
async def get_invoice(invoice_number: str, db: AsyncSession = Depends(get_db)):
    invoice = await payment_service.get_invoice(db, invoice_number)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Invoice {invoice_number} not found")
    return invoice
