"""Remove body embedding columns and indexes.

Revision ID: 013_remove_body_embeddings
Revises: 012_gate_visits
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


revision = "013_remove_body_embeddings"
down_revision = "012_gate_visits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_visitors_body_hnsw")
    op.drop_column("detection_events", "body_similarity")
    op.drop_column("visitor_faces", "body_embedding")
    op.drop_column("visitors", "body_embedding")


def downgrade() -> None:
    op.add_column("visitors", sa.Column("body_embedding", Vector(512), nullable=True))
    op.add_column("visitor_faces", sa.Column("body_embedding", Vector(512), nullable=True))
    op.add_column(
        "detection_events",
        sa.Column("body_similarity", sa.Float(), nullable=True),
    )
    op.create_index(
        "idx_visitors_body_hnsw",
        "visitors",
        ["body_embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"body_embedding": "vector_cosine_ops"},
    )
