from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Unicode
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.signup import Signup


class RestaurantBranch(CommonFields):
    """A physical restaurant location (FR 1.6-ii: branch/location management)."""

    __tablename__ = "Restaurants"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    BranchName: Mapped[str] = mapped_column(Unicode(150), nullable=False)
    Address: Mapped[str] = mapped_column(Unicode(255), nullable=False)
    City: Mapped[str] = mapped_column(Unicode(100), nullable=False)
    Phone: Mapped[str] = mapped_column(String(20), nullable=False)
    OperatingHours: Mapped[str] = mapped_column(Unicode(100), nullable=False)
    ManagerId: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tbl_Signup.Id", name="FK_tbl_RestaurantBranch_ManagerId"), nullable=True
    )

    Manager: Mapped[Optional["Signup"]] = relationship(lazy="joined", foreign_keys=[ManagerId])
