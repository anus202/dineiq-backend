from decimal import Decimal
from typing import Annotated

from pydantic import Field, PlainSerializer

Money = Annotated[Decimal, Field(max_digits=10, decimal_places=2), PlainSerializer(float, when_used="json")]

MoneyTotal = Annotated[Decimal, PlainSerializer(float, when_used="json")]

Quantity = Annotated[Decimal, Field(max_digits=12, decimal_places=3), PlainSerializer(float, when_used="json")]

TWO_PLACES = Decimal("0.01")
