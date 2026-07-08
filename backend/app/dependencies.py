from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.enums import UserRole

# ---------------------------------------------------------------------------
# Type aliases for injection
# ---------------------------------------------------------------------------

DbSession = Annotated[AsyncSession, Depends(get_db)]


# ---------------------------------------------------------------------------
# Auth dependency — extracts verified user from request state.
# ClerkJWTMiddleware (app/middleware/clerk_auth.py) runs first and populates
# request.state.user_id/clerk_id/email/role. This dependency just reads it.
# ---------------------------------------------------------------------------


class CurrentUser:
    """Lightweight holder for the authenticated user's identity."""

    __slots__ = ("user_id", "clerk_id", "email", "role")

    def __init__(self, user_id: UUID, clerk_id: str, email: str, role: UserRole) -> None:
        self.user_id = user_id
        self.clerk_id = clerk_id
        self.email = email
        self.role = role

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.admin


async def get_current_user(request: Request) -> CurrentUser:
    """
    Extracts the authenticated user from request state.
    Raises 401 if middleware did not populate state (should never happen in
    production since middleware blocks unauthenticated requests first).
    """
    user_id: UUID | None = getattr(request.state, "user_id", None)
    clerk_id: str | None = getattr(request.state, "clerk_id", None)
    email: str | None = getattr(request.state, "email", None)
    role: UserRole | None = getattr(request.state, "role", None)

    if user_id is None or clerk_id is None or email is None or role is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return CurrentUser(user_id=user_id, clerk_id=clerk_id, email=email, role=role)


async def get_admin_user(current_user: "CurrentUser" = Depends(get_current_user)) -> "CurrentUser":
    """Raises 403 if the authenticated user is not an admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


AuthUser = Annotated[CurrentUser, Depends(get_current_user)]
AdminUser = Annotated[CurrentUser, Depends(get_admin_user)]


# ---------------------------------------------------------------------------
# Pagination dependency
# ---------------------------------------------------------------------------


class Pagination:
    DEFAULT_LIMIT = 20
    MAX_LIMIT = 100

    def __init__(self, offset: int = 0, limit: int = DEFAULT_LIMIT) -> None:
        if offset < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="offset must be >= 0",
            )
        if limit < 1 or limit > self.MAX_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"limit must be between 1 and {self.MAX_LIMIT}",
            )
        self.offset = offset
        self.limit = limit


PaginationDep = Annotated[Pagination, Depends(Pagination)]
