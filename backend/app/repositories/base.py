"""
Generic async repository base class.

Design decisions:
- get_owned() embeds user_id into the WHERE clause — never fetch-then-check.
  Returns None for both "not found" and "not owned" to prevent ID enumeration.
- flush() is called after add/update so the ORM's in-memory state reflects
  the DB-assigned values (e.g. server-generated UUIDs, timestamps).
- commit() is NOT called here — the session lifecycle (commit/rollback) is
  managed by the get_db() dependency in database.py.
"""

from typing import Any, Generic, TypeVar, cast
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get(self, id: UUID) -> ModelT | None:
        """Fetch by primary key. No ownership check — for internal use."""
        return await self.session.get(self.model, id)

    async def get_owned(self, id: UUID, user_id: UUID) -> ModelT | None:
        """
        Fetch by primary key with ownership enforcement.
        Returns None for both "not found" and "wrong owner" — callers raise 404.
        """
        return await self._scalar(
            select(self.model).where(
                self.model.id == id,  # type: ignore[attr-defined]
                self.model.user_id == user_id,  # type: ignore[attr-defined]
            )
        )

    async def list_by_user(
        self,
        user_id: UUID,
        *,
        offset: int = 0,
        limit: int = 20,
    ) -> list[ModelT]:
        result = await self.session.scalars(
            select(self.model)
            .where(self.model.user_id == user_id)  # type: ignore[attr-defined]
            .order_by(self.model.created_at.desc())  # type: ignore[attr-defined]
            .offset(offset)
            .limit(limit)
        )
        return list(result.all())

    async def count_by_user(self, user_id: UUID) -> int:
        result = await self.session.scalar(
            select(func.count())
            .select_from(self.model)
            .where(
                self.model.user_id == user_id  # type: ignore[attr-defined]
            )
        )
        return result or 0

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def create(self, **kwargs: Any) -> ModelT:
        obj = self.model(**kwargs)
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def update(self, obj: ModelT, **kwargs: Any) -> ModelT:
        for key, value in kwargs.items():
            setattr(obj, key, value)
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def delete(self, obj: ModelT) -> None:
        await self.session.delete(obj)
        await self.session.flush()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _scalar(self, stmt: Select) -> ModelT | None:  # type: ignore[type-arg]
        return cast("ModelT | None", await self.session.scalar(stmt))

    async def _scalars(self, stmt: Select) -> list[ModelT]:  # type: ignore[type-arg]
        result = await self.session.scalars(stmt)
        return list(result.all())
