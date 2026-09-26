from dataclasses import dataclass
from typing import Optional

from app.core.config import TIER_DISCOUNT_PERCENT, TIER_GOLD_MIN_POINTS, TIER_PLATINUM_MIN_POINTS

# (name, minimum points), highest first.
_TIERS = [("Platinum", TIER_PLATINUM_MIN_POINTS), ("Gold", TIER_GOLD_MIN_POINTS), ("Silver", 0)]


@dataclass(frozen=True)
class Tier:
    name: str
    discount_percent: int
    next_tier: Optional[str]
    points_to_next: Optional[int]


def tier_for(points: int) -> Tier:
    """Tier from the current points balance (Silver < Gold < Platinum)."""
    for index, (name, minimum) in enumerate(_TIERS):
        if points >= minimum:
            higher = _TIERS[index - 1] if index > 0 else None
            return Tier(
                name=name,
                discount_percent=TIER_DISCOUNT_PERCENT[name],
                next_tier=higher[0] if higher else None,
                points_to_next=higher[1] - points if higher else None,
            )
    raise AssertionError("Silver has no minimum, so a tier always matches")


def all_tiers() -> list[tuple[str, int, int]]:
    """(name, minimum points, discount %) for every tier, lowest first."""
    return [(name, minimum, TIER_DISCOUNT_PERCENT[name]) for name, minimum in reversed(_TIERS)]
