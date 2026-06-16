"""
Analytics query builders. Staff and soft-deleted visitors are excluded.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings


def _range(since: Optional[datetime], until: Optional[datetime]) -> tuple[datetime, datetime]:
    until = until or datetime.now(timezone.utc)
    since = since or (until - timedelta(days=settings.ANALYTICS_DEFAULT_DAYS))
    return since, until


async def summary(db: AsyncSession, since: Optional[datetime], until: Optional[datetime]) -> dict:
    since, until = _range(since, until)
    params = {"since": since, "until": until}

    row = (await db.execute(text("""
        WITH period_visits AS (
            SELECT v.visitor_id, v.duration_minutes, vis.first_seen_at
            FROM visits v
            JOIN visitors vis ON vis.id = v.visitor_id
            WHERE v.entered_at >= :since AND v.entered_at < :until
              AND vis.is_staff = FALSE AND vis.is_active = TRUE
        )
        SELECT
            COUNT(*) AS total_visits,
            COUNT(DISTINCT visitor_id) AS unique_visitors,
            COUNT(DISTINCT visitor_id) FILTER (WHERE first_seen_at >= :since) AS new_visitors,
            COALESCE(AVG(duration_minutes) FILTER (WHERE duration_minutes IS NOT NULL), 0) AS avg_duration
        FROM period_visits
    """), params)).one()

    unique = row.unique_visitors or 0
    new = row.new_visitors or 0
    returning = max(0, unique - new)

    by_day = (await db.execute(text("""
        SELECT date_trunc('day', v.entered_at) AS day, COUNT(*) AS visits
        FROM visits v
        JOIN visitors vis ON vis.id = v.visitor_id
        WHERE v.entered_at >= :since AND v.entered_at < :until
          AND vis.is_staff = FALSE AND vis.is_active = TRUE
        GROUP BY day ORDER BY day
    """), params)).all()

    return {
        "total_unique_visitors": unique,
        "total_visits": row.total_visits or 0,
        "new_visitors": new,
        "returning_visitors": returning,
        "average_duration_minutes": round(float(row.avg_duration or 0), 1),
        "return_rate": round(returning / unique, 4) if unique else 0.0,
        "visits_by_day": [
            {"day": r.day.date().isoformat(), "visits": r.visits} for r in by_day
        ],
    }


async def frequency(db: AsyncSession) -> dict:
    rows = (await db.execute(text("""
        SELECT visit_count, COUNT(*) AS n
        FROM visitors
        WHERE is_staff = FALSE AND is_active = TRUE AND visit_count > 0
        GROUP BY visit_count
    """))).all()

    dist = {"1": 0, "2": 0, "3": 0, "4+": 0}
    for r in rows:
        vc = r.visit_count
        key = str(vc) if vc <= 3 else "4+"
        dist[key] += r.n
    return {"distribution": dist}


async def hourly(db: AsyncSession, since: Optional[datetime], until: Optional[datetime]) -> dict:
    since, until = _range(since, until)
    rows = (await db.execute(text("""
        SELECT CAST(EXTRACT(HOUR FROM v.entered_at) AS INTEGER) AS hour,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE NOT EXISTS (
                   SELECT 1 FROM visits v2
                   WHERE v2.visitor_id = v.visitor_id AND v2.entered_at < v.entered_at
               )) AS new_count
        FROM visits v
        JOIN visitors vis ON vis.id = v.visitor_id
        WHERE v.entered_at >= :since AND v.entered_at < :until
          AND vis.is_staff = FALSE AND vis.is_active = TRUE
        GROUP BY hour ORDER BY hour
    """), {"since": since, "until": until})).all()

    by_hour = {r.hour: (r.total, r.new_count) for r in rows}
    return {
        "hourly": [
            {
                "hour": h,
                "new": by_hour.get(h, (0, 0))[1],
                "returning": by_hour.get(h, (0, 0))[0] - by_hour.get(h, (0, 0))[1],
            }
            for h in range(24)
        ]
    }


async def top_visitors(db: AsyncSession, limit: int = 10) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT vis.id, vis.name, vis.visit_count, vis.first_seen_at, vis.last_seen_at,
               AVG(v.duration_minutes) AS avg_dur
        FROM visitors vis
        LEFT JOIN visits v ON v.visitor_id = vis.id
        WHERE vis.is_staff = FALSE AND vis.is_active = TRUE AND vis.visit_count > 0
        GROUP BY vis.id
        ORDER BY vis.visit_count DESC, vis.last_seen_at DESC
        LIMIT :limit
    """), {"limit": max(1, limit)})).all()

    return [
        {
            "visitor_id": r.id,
            "name": r.name,
            "visit_count": r.visit_count,
            "first_visit": r.first_seen_at,
            "last_visit": r.last_seen_at,
            "avg_duration_minutes": round(float(r.avg_dur), 1) if r.avg_dur is not None else None,
        }
        for r in rows
    ]
