from sqlalchemy import CheckConstraint, Integer, Unicode, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CommonFields

class DiningTable(CommonFields):

    __tablename__ = "tbl_DiningTable"
    __table_args__ = (CheckConstraint("Capacity > 0", name="CK_tbl_DiningTable_Capacity"),)

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    TableNumber: Mapped[str] = mapped_column(Unicode(20), unique=True, nullable=False)
    Capacity: Mapped[int] = mapped_column(Integer, nullable=False)

    Status: Mapped[str] = mapped_column(
        Unicode(20), nullable=False, default="AVAILABLE", server_default=text("'AVAILABLE'"), index=True
    )
