from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import EVERYONE, MENU_MANAGERS
from app.db.session import get_db
from app.models import Signup
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate
from app.services import category_service

# Every route here requires a valid token and one of the EVERYONE roles.
router = APIRouter(
    prefix="/api/v1/categories",
    tags=["Categories"],
    dependencies=[Depends(require_roles(EVERYONE))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Your role can't use this endpoint"}},
)

NOT_FOUND = {404: {"description": "Category not found"}}


def _not_found(category_id: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Category {category_id} not found")


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED, summary="Create category")
async def create_category(
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles(MENU_MANAGERS)),
):
    return await category_service.create(db, payload, current_user.Id)


@router.get("", response_model=list[CategoryResponse], summary="Get all categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    return await category_service.get_all(db)


@router.get("/{id}", response_model=CategoryResponse, summary="Get category by ID", responses=NOT_FOUND)
async def get_category(id: int, db: AsyncSession = Depends(get_db)):
    category = await category_service.get_by_id(db, id)
    if category is None:
        raise _not_found(id)
    return category


@router.put("/{id}", response_model=CategoryResponse, summary="Update category", responses=NOT_FOUND)
async def update_category(
    id: int,
    payload: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles(MENU_MANAGERS)),
):
    category = await category_service.update(db, id, payload, current_user.Id)
    if category is None:
        raise _not_found(id)
    return category


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete category", responses=NOT_FOUND)
async def delete_category(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles(MENU_MANAGERS)),
):
    if not await category_service.delete(db, id, current_user.Id):
        raise _not_found(id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
