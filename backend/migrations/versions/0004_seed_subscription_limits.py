"""Seed subscription_limits table with free/basic/pro tier defaults.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# Tier rows
# ---------------------------------------------------------------------------
# Column order must match the subscription_limits table DDL:
#   tier, monthly_resume_uploads, monthly_analyses, monthly_rirekisho,
#   monthly_shokumu, monthly_job_translate, monthly_interviews,
#   monthly_token_budget, pdf_export_enabled, full_culture_access

_ROWS = [
    {
        "tier": "free",
        "monthly_resume_uploads": 2,
        "monthly_analyses": 5,
        "monthly_rirekisho": 1,
        "monthly_shokumu": 1,
        "monthly_job_translate": 5,
        "monthly_interviews": 3,
        "monthly_token_budget": 50_000,
        "pdf_export_enabled": False,
        "full_culture_access": False,
    },
    {
        "tier": "basic",
        "monthly_resume_uploads": 10,
        "monthly_analyses": 30,
        "monthly_rirekisho": 5,
        "monthly_shokumu": 5,
        "monthly_job_translate": 30,
        "monthly_interviews": 20,
        "monthly_token_budget": 300_000,
        "pdf_export_enabled": True,
        "full_culture_access": False,
    },
    {
        "tier": "pro",
        "monthly_resume_uploads": 50,
        "monthly_analyses": 200,
        "monthly_rirekisho": 30,
        "monthly_shokumu": 30,
        "monthly_job_translate": 200,
        "monthly_interviews": 100,
        "monthly_token_budget": 2_000_000,
        "pdf_export_enabled": True,
        "full_culture_access": True,
    },
]

_table = sa.table(
    "subscription_limits",
    sa.column("tier", sa.String),
    sa.column("monthly_resume_uploads", sa.Integer),
    sa.column("monthly_analyses", sa.Integer),
    sa.column("monthly_rirekisho", sa.Integer),
    sa.column("monthly_shokumu", sa.Integer),
    sa.column("monthly_job_translate", sa.Integer),
    sa.column("monthly_interviews", sa.Integer),
    sa.column("monthly_token_budget", sa.Integer),
    sa.column("pdf_export_enabled", sa.Boolean),
    sa.column("full_culture_access", sa.Boolean),
)


def upgrade() -> None:
    op.execute("""
        INSERT INTO subscription_limits (
            tier, monthly_resume_uploads, monthly_analyses, monthly_rirekisho,
            monthly_shokumu, monthly_job_translate, monthly_interviews,
            monthly_token_budget, pdf_export_enabled, full_culture_access
        ) VALUES
            ('free',  2,   5,   1,  1,   5,   3,   50000,   false, false),
            ('basic', 10,  30,  5,  5,   30,  20,  300000,  true,  false),
            ('pro',   50,  200, 30, 30,  200, 100, 2000000, true,  true)
        ON CONFLICT (tier) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DELETE FROM subscription_limits WHERE tier IN ('free', 'basic', 'pro')")
