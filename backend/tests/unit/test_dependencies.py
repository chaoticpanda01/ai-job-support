"""
Unit tests for FastAPI dependencies (get_current_user, get_admin_user).
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.dependencies import get_admin_user, get_current_user
from app.models.enums import UserRole
from tests.conftest import make_user


def _make_request(**state_attrs: object) -> Request:
    scope = {"type": "http", "method": "GET", "path": "/", "headers": []}
    request = Request(scope)
    for key, value in state_attrs.items():
        setattr(request.state, key, value)
    return request


@pytest.mark.asyncio
async def test_get_current_user_returns_current_user() -> None:
    uid = uuid.uuid4()
    request = _make_request(
        user_id=uid,
        clerk_id="clerk_abc",
        email="test@example.com",
        role=UserRole.user,
    )
    user = await get_current_user(request)
    assert user.user_id == uid
    assert user.clerk_id == "clerk_abc"
    assert user.role == UserRole.user
    assert not user.is_admin


@pytest.mark.asyncio
async def test_get_current_user_raises_401_when_state_missing() -> None:
    request = _make_request()  # no state set
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(request)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_is_admin_property_true_for_admin_role() -> None:
    uid = uuid.uuid4()
    request = _make_request(
        user_id=uid,
        clerk_id="clerk_admin",
        email="admin@example.com",
        role=UserRole.admin,
    )
    user = await get_current_user(request)
    assert user.is_admin


@pytest.mark.asyncio
async def test_get_admin_user_passes_for_admin() -> None:
    uid = uuid.uuid4()
    request = _make_request(
        user_id=uid,
        clerk_id="clerk_admin",
        email="admin@example.com",
        role=UserRole.admin,
    )
    current = await get_current_user(request)
    admin = await get_admin_user(current)
    assert admin.is_admin


@pytest.mark.asyncio
async def test_get_admin_user_raises_403_for_regular_user() -> None:
    uid = uuid.uuid4()
    request = _make_request(
        user_id=uid,
        clerk_id="clerk_user",
        email="user@example.com",
        role=UserRole.user,
    )
    current = await get_current_user(request)
    with pytest.raises(HTTPException) as exc_info:
        await get_admin_user(current)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin access required"
