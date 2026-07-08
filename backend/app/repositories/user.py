from datetime import UTC
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import Profile, User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    # ------------------------------------------------------------------
    # Lookups
    # ------------------------------------------------------------------

    async def get_by_clerk_id(self, clerk_id: str) -> User | None:
        return await self.session.scalar(select(User).where(User.clerk_id == clerk_id))

    async def get_by_email(self, email: str) -> User | None:
        return await self.session.scalar(select(User).where(User.email == email))

    async def get_with_profile(self, user_id: UUID) -> User | None:
        """Eagerly loads the profile in a single query."""
        return await self.session.scalar(
            select(User).where(User.id == user_id).options(selectinload(User.profile))
        )

    async def get_by_clerk_id_with_profile(self, clerk_id: str) -> User | None:
        return await self.session.scalar(
            select(User).where(User.clerk_id == clerk_id).options(selectinload(User.profile))
        )

    # ------------------------------------------------------------------
    # Upsert (called from Clerk webhook)
    # ------------------------------------------------------------------

    async def upsert_from_clerk(
        self,
        clerk_id: str,
        email: str,
        full_name: str | None,
        email_verified: bool,
    ) -> tuple[User, bool]:
        """
        Returns (user, created). Uses SELECT then INSERT/UPDATE pattern
        rather than ON CONFLICT because we need the user object regardless.
        """
        user = await self.get_by_clerk_id(clerk_id)
        if user is None:
            user = await self.create(
                clerk_id=clerk_id,
                email=email,
                full_name=full_name,
                email_verified=email_verified,
            )
            return user, True

        updated = await self.update(
            user,
            email=email,
            full_name=full_name,
            email_verified=email_verified,
        )
        return updated, False


class ProfileRepository(BaseRepository[Profile]):
    model = Profile

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_user_id(self, user_id: UUID) -> Profile | None:
        return await self.session.scalar(select(Profile).where(Profile.user_id == user_id))

    async def get_or_create(self, user_id: UUID) -> tuple[Profile, bool]:
        profile = await self.get_by_user_id(user_id)
        if profile is not None:
            return profile, False
        profile = await self.create(user_id=user_id)
        return profile, True

    async def advance_onboarding_step(self, user_id: UUID, step: int) -> Profile | None:
        """
        Advance onboarding_step to the given value only if it is greater
        than the current step (never go backwards).
        """
        profile = await self.get_by_user_id(user_id)
        if profile is None:
            return None
        if step > profile.onboarding_step:
            return await self.update(profile, onboarding_step=step)
        return profile

    async def record_consent(self, user_id: UUID) -> Profile:
        """
        Stamp consent_given_at with the current UTC time.
        Idempotent — calling again when already set is a no-op.
        Creates the profile row if it doesn't exist yet (new users hit
        /auth/consent before any PUT /auth/me call).
        """
        from datetime import datetime

        profile, _ = await self.get_or_create(user_id)
        if profile.consent_given_at is not None:
            return profile  # already consented
        return await self.update(profile, consent_given_at=datetime.now(tz=UTC))
