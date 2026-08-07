"""add workspace email outreach setting

Revision ID: 0003_workspace_email_outreach
Revises: 0002_inventory_actor
Create Date: 2026-08-05

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_workspace_email_outreach"
down_revision: str | Sequence[str] | None = "0002_inventory_actor"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column(
            "email_outreach_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "email_outreach_enabled")
