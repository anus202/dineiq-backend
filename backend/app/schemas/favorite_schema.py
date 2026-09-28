from pydantic import BaseModel

class FavoriteListResponse(BaseModel):
    MenuItemIds: list[int]

class FavoriteToggleResponse(BaseModel):
    MenuItemId: int
    IsFavorite: bool
