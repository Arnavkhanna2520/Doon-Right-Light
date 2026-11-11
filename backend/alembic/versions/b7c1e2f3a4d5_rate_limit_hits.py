"""rate limit hits stored in the database

Revision ID: b7c1e2f3a4d5
Revises: aed5b1526b0f
Create Date: 2026-11-12
"""
from alembic import op
import sqlalchemy as sa

revision = "b7c1e2f3a4d5"
down_revision = "aed5b1526b0f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_hits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_rate_limit_hits_key_hash", "rate_limit_hits", ["key_hash"])
    op.create_index("ix_rate_limit_hits_created_at", "rate_limit_hits", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_rate_limit_hits_created_at", table_name="rate_limit_hits")
    op.drop_index("ix_rate_limit_hits_key_hash", table_name="rate_limit_hits")
    op.drop_table("rate_limit_hits")
