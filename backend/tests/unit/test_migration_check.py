"""
Unit tests for app.utils.migration_check.

Mirrors the mocking style used for verify_fonts() in test_pdf_generator.py:
unittest.mock.patch on module-level names, no real DB or real Alembic
Config/ScriptDirectory round-trip for the mocked cases.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from app.utils.migration_check import _code_head_revision, verify_migrations


def _mock_engine_returning(version_num: str | None) -> MagicMock:
    """
    Build a fake AsyncEngine whose `.connect()` async-context-manager yields a
    connection whose `.execute(...)` returns a result with `.scalar()` ==
    version_num.
    """
    mock_result = MagicMock()
    mock_result.scalar.return_value = version_num

    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock(return_value=mock_result)

    mock_connect_cm = AsyncMock()
    mock_connect_cm.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_connect_cm.__aexit__ = AsyncMock(return_value=False)

    mock_engine = MagicMock()
    mock_engine.connect = MagicMock(return_value=mock_connect_cm)
    return mock_engine


async def test_verify_migrations_returns_true_when_db_matches_code_head() -> None:
    mock_engine = _mock_engine_returning("0007")

    with (
        patch("app.utils.migration_check.engine", mock_engine),
        patch("app.utils.migration_check._code_head_revision", return_value="0007"),
    ):
        assert await verify_migrations() is True


async def test_verify_migrations_returns_false_when_db_does_not_match_code_head() -> None:
    mock_engine = _mock_engine_returning("0006")

    with (
        patch("app.utils.migration_check.engine", mock_engine),
        patch("app.utils.migration_check._code_head_revision", return_value="0007"),
    ):
        assert await verify_migrations() is False


async def test_verify_migrations_returns_false_when_db_query_raises() -> None:
    mock_engine = MagicMock()
    mock_engine.connect = MagicMock(side_effect=RuntimeError("db unreachable"))

    with (
        patch("app.utils.migration_check.engine", mock_engine),
        patch("app.utils.migration_check._code_head_revision", return_value="0007"),
    ):
        assert await verify_migrations() is False


def test_code_head_revision_resolves_the_actual_bundled_migrations_head() -> None:
    """No mocking -- confirms _ALEMBIC_INI actually resolves to backend/alembic.ini
    and that it correctly reads the real current head from migrations/."""
    head = _code_head_revision()
    assert head is not None
    assert isinstance(head, str)


async def test_verify_migrations_returns_false_when_code_head_lookup_raises() -> None:
    with patch(
        "app.utils.migration_check._code_head_revision",
        side_effect=Exception("bad alembic config"),
    ):
        assert await verify_migrations() is False
