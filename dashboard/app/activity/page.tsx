"use client";

import { useState } from "react";
import useSWR from "swr";

import { fetcher } from "@/lib/api";
import type { ActivityResponse } from "@/lib/types";
import { ActivityFeed } from "@/components/activity-feed";
import { Button, Card, ErrorState, Spinner } from "@/components/ui";

const PAGE_SIZE = 30;
type Filter = "all" | "new" | "returning" | "ambiguous";

export default function ActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  });
  if (filter !== "all") params.set("event_type", filter);

  const { data, error, isLoading } = useSWR<ActivityResponse>(
    `activity?${params.toString()}`,
    fetcher,
    { refreshInterval: autoRefresh ? 5000 : 0, keepPreviousData: true },
  );

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Activity Timeline</h1>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {(["all", "new", "returning", "ambiguous"] as Filter[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "primary" : "ghost"}
                onClick={() => {
                  setPage(0);
                  setFilter(f);
                }}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>
      </Card>

      <Card>
        {error ? (
          <ErrorState message="Could not load activity." />
        ) : isLoading && !data ? (
          <Spinner />
        ) : (
          <>
            <ActivityFeed events={data?.events ?? []} />
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>
                {total} events · Page {page + 1} of {pages}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <Button
                  variant="ghost"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
