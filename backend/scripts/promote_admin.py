#!/usr/bin/env python3
"""
Promote a user to admin by email.

Bootstraps the first admin account in an environment. Every subsequent
role change can go through the admin panel's Users tab instead — this
script is only needed once per environment.

Run from the backend directory:
    python -m scripts.promote_admin --email you@example.com

Idempotent — re-running for an already-admin user is a safe no-op.
"""

from __future__ import annotations

import argparse
import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from app.database import AsyncSessionFactory
from app.models.enums import UserRole
from app.repositories.user import UserRepository


async def promote(email: str) -> int:
    """Promote the user with the given email to admin. Returns a process exit code."""
    async with AsyncSessionFactory() as session:
        repo = UserRepository(session)
        user = await repo.get_by_email(email)

        if user is None:
            print(f"✗ No user found with email {email!r} — sign up first, then re-run this script.")
            return 1

        if user.role == UserRole.admin:
            print(f"✓ {email} is already an admin — nothing to do.")
            return 0

        await repo.update(user, role=UserRole.admin)
        await session.commit()
        print(f"✓ Promoted {email} to admin.")
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="Email of the user to promote to admin")
    args = parser.parse_args()
    exit_code = asyncio.run(promote(args.email))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
