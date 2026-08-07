"""add inventory movement actor

Revision ID: 0002_inventory_actor
Revises: 0001_initial
Create Date: 2026-07-29

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_inventory_actor"
down_revision: str | Sequence[str] | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("inventory_movements", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("created_by", sa.String(length=100), nullable=False, server_default="")
        )


def downgrade() -> None:
    with op.batch_alter_table("inventory_movements", schema=None) as batch_op:
        batch_op.drop_column("created_by")
