import os
from pathlib import Path

from dotenv import load_dotenv

# backend/.env, wherever the server is started from (monorepo root, backend/, an IDE).
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# SQL Server
DB_SERVER = os.getenv("DB_SERVER", ".")
DB_NAME = os.getenv("DB_NAME", "DineIQ")
DB_USER = os.getenv("DB_USER", "sa")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_DRIVER = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "20"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "10"))

# Business time zone, as minutes from UTC (Pakistan Standard Time = +300, no DST).
# Orders are stored in UTC; analytics group hours and days in local time.
BUSINESS_UTC_OFFSET_MINUTES = int(os.getenv("BUSINESS_UTC_OFFSET_MINUTES", "300"))

# Browser origins allowed to call the API (the React dev server by default).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# Receipts
RESTAURANT_NAME = os.getenv("RESTAURANT_NAME", "DineIQ Restaurant")

# Loyalty: points earned per 100 PKR paid by cash/card, and the PKR value of one point
# when redeemed. Tiers are by current points balance; each tier gives a bill discount.
LOYALTY_POINTS_PER_100 = int(os.getenv("LOYALTY_POINTS_PER_100", "1"))
LOYALTY_POINT_VALUE_PKR = int(os.getenv("LOYALTY_POINT_VALUE_PKR", "1"))
TIER_GOLD_MIN_POINTS = int(os.getenv("TIER_GOLD_MIN_POINTS", "200"))
TIER_PLATINUM_MIN_POINTS = int(os.getenv("TIER_PLATINUM_MIN_POINTS", "400"))
TIER_DISCOUNT_PERCENT = {
    "Silver": int(os.getenv("TIER_SILVER_DISCOUNT_PERCENT", "0")),
    "Gold": int(os.getenv("TIER_GOLD_DISCOUNT_PERCENT", "5")),
    "Platinum": int(os.getenv("TIER_PLATINUM_DISCOUNT_PERCENT", "10")),
}

# JWT
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

if not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is not set. Add it to your .env file.")
