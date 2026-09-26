from decimal import Decimal
from typing import Annotated

from pydantic import Field, PlainSerializer

# Money: exact Decimal internally (DECIMAL(10,2) in SQL Server), plain JSON number in responses.
Money = Annotated[Decimal, Field(max_digits=10, decimal_places=2), PlainSerializer(float, when_used="json")]

# Aggregated money (sums, averages, percentages): no column limit applies, so no max_digits.
# Totals over the full dataset exceed DECIMAL(10,2)'s 99,999,999.99.
MoneyTotal = Annotated[Decimal, PlainSerializer(float, when_used="json")]

# Stock / recipe quantity: DECIMAL(12,3) in SQL Server, e.g. 0.250 kg.
Quantity = Annotated[Decimal, Field(max_digits=12, decimal_places=3), PlainSerializer(float, when_used="json")]

TWO_PLACES = Decimal("0.01")
