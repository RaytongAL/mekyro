"""Add lead platform name.

Revision ID: 0004_lead_platform_name
Revises: 0003_workspace_email_outreach
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_lead_platform_name"
down_revision: str | Sequence[str] | None = "0003_workspace_email_outreach"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column(
            "platform_name",
            sa.String(length=100),
            nullable=False,
            server_default="",
        ),
    )


def downgrade() -> None:
    op.drop_column("leads", "platform_name")
