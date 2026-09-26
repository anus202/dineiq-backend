from sqlalchemy import Integer, Unicode
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CommonFields


class Category(CommonFields):
    __tablename__ = "tbl_Category"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    Name: Mapped[str] = mapped_column(Unicode(100), nullable=False)
