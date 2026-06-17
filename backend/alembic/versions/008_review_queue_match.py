"""Add matched-visitor + similarity to review_queue.

Lets the review UI show *which* known visitor a flagged detection resembled
(e.g. a probable duplicate) and how strong the similarity was.

Revision ID: 008
Revises: 007
Create Date: 2026-06-17
"""

from alembic import op
import sqlalchemy as sa


revision = "008_review_queue_match"
down_revision = "007_auto_tuning_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "review_queue",
        sa.Column(
            "matched_visitor_id",
            sa.UUID(),
            sa.ForeignKey("visitors.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "review_queue",
        sa.Column("similarity", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("review_queue", "similarity")
    op.drop_column("review_queue", "matched_visitor_id")
