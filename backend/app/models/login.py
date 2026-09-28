from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields, utc_now

if TYPE_CHECKING:
    from app.models.signup import Signup

class Login(CommonFields):
    __tablename__ = "tbl_Login"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    SignupId: Mapped[int] = mapped_column(ForeignKey("tbl_Signup.Id"), nullable=False, index=True)
    Email: Mapped[str] = mapped_column(String(150), nullable=False)
    LoginTime: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utc_now, server_default=func.getutcdate()
    )
    LogoutTime: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    IpAddress: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    IsSuccess: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("1"))

    User: Mapped["Signup"] = relationship(back_populates="Logins")
