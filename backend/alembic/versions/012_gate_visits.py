"""Gate visits — directional entry→exit visit counting.

A "gate visit" is one entry→exit pass: the SAME recognized visitor seen on the
configured ENTRY camera and later on the EXIT camera. Kept in a SEPARATE table
from the cooldown-based `visits` table so existing visit analytics are
unaffected. See services/gate_tracker.py.

Revision ID: 012
Revises: 011
Create Date: 2026-06-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "012_gate_visits"
down_revision = "011_cross_camera"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gate_visits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "visitor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("visitors.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entry_camera_id", sa.Text(), nullable=True),
        sa.Column("exit_camera_id", sa.Text(), nullable=True),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_gate_visits_visitor", "gate_visits", ["visitor_id"])
    op.create_index("idx_gate_visits_entered", "gate_visits", [sa.text("entered_at DESC")])
    # Partial index for fast open-pass recovery on startup.
    op.create_index(
        "idx_gate_visits_open",
        "gate_visits",
        ["exited_at"],
        postgresql_where=sa.text("exited_at IS NULL"),
    )
    # Completed-visit count queries.
    op.create_index("idx_gate_visits_completed", "gate_visits", ["completed", "exited_at"])


def downgrade() -> None:
    op.drop_index("idx_gate_visits_completed", table_name="gate_visits")
    op.drop_index("idx_gate_visits_open", table_name="gate_visits")
    op.drop_index("idx_gate_visits_entered", table_name="gate_visits")
    op.drop_index("idx_gate_visits_visitor", table_name="gate_visits")
    op.drop_table("gate_visits")
