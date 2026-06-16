"""restaurant visitor tracking schema

Revision ID: 001_restaurant_schema
Revises:
Create Date: 2026-06-16

Baseline schema for the restaurant visitor tracker. Drops any legacy
student-verification tables, then creates visitors / visitor_faces / visits /
detection_events with pgvector HNSW indexes.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector


revision = "001_restaurant_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Remove legacy SPVS tables if this DB was used by the base project.
    for tbl in (
        "pickup_events",
        "student_guardian_auth",
        "student_face_embeddings",
        "students",
        "guardians",
    ):
        op.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE")

    # ── visitors ─────────────────────────────────────────────
    op.create_table(
        "visitors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("face_embedding", Vector(512), nullable=True),
        sa.Column("body_embedding", Vector(512), nullable=True),
        sa.Column("visit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("best_face_det_score", sa.Float(), server_default="0"),
        sa.Column("total_faces_recorded", sa.Integer(), server_default="0"),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("thumbnail_path", sa.Text(), nullable=True),
        sa.Column("is_staff", sa.Boolean(), server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
    )
    op.create_index(
        "idx_visitors_face_hnsw", "visitors", ["face_embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"face_embedding": "vector_cosine_ops"},
    )
    op.create_index(
        "idx_visitors_body_hnsw", "visitors", ["body_embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"body_embedding": "vector_cosine_ops"},
    )
    op.create_index("idx_visitors_last_seen", "visitors", [sa.text("last_seen_at DESC")])
    op.create_index("idx_visitors_visit_count", "visitors", [sa.text("visit_count DESC")])

    # ── visitor_faces ────────────────────────────────────────
    op.create_table(
        "visitor_faces",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "visitor_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("embedding", Vector(512), nullable=False),
        sa.Column("det_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("body_embedding", Vector(512), nullable=True),
        sa.Column("source_frame_path", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_visitor_faces_visitor_id", "visitor_faces", ["visitor_id"])
    op.create_index(
        "idx_visitor_faces_hnsw", "visitor_faces", ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    # ── visits ───────────────────────────────────────────────
    op.create_table(
        "visits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "visitor_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("detection_count", sa.Integer(), server_default="0"),
        sa.Column("best_face_confidence", sa.Float(), nullable=True),
        sa.Column("avg_face_confidence", sa.Float(), nullable=True),
        sa.Column("camera_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_visits_visitor", "visits", ["visitor_id"])
    op.create_index("idx_visits_entered", "visits", [sa.text("entered_at DESC")])
    op.create_index(
        "idx_visits_visitor_entered", "visits",
        ["visitor_id", sa.text("entered_at DESC")],
    )
    op.create_index(
        "idx_visits_active", "visits", ["left_at"],
        postgresql_where=sa.text("left_at IS NULL"),
    )

    # ── detection_events ─────────────────────────────────────
    op.create_table(
        "detection_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "visitor_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("visitors.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "visit_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("visits.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("face_similarity", sa.Float(), nullable=True),
        sa.Column("body_similarity", sa.Float(), nullable=True),
        sa.Column("is_new_visitor", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_ambiguous", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("match_source", sa.String(length=16), nullable=True),
        sa.Column("camera_id", sa.Text(), nullable=True),
        sa.Column("frame_path", sa.Text(), nullable=True),
        sa.Column("bbox", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_de_visitor", "detection_events",
        ["visitor_id", sa.text("detected_at DESC")],
    )
    op.create_index("idx_de_datetime", "detection_events", [sa.text("detected_at DESC")])


def downgrade() -> None:
    op.drop_table("detection_events")
    op.drop_table("visits")
    op.drop_table("visitor_faces")
    op.drop_table("visitors")
