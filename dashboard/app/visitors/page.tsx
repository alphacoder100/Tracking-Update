"use client";

import { useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";

import { fetcher } from "@/lib/api";
import type { VisitorListResponse } from "@/lib/types";
import { VisitorTable } from "@/components/visitor-table";
import { Button, Card, ErrorState, Spinner } from "@/components/ui";

const PAGE_SIZE = 20;

export default function VisitorsPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [minVisits, setMinVisits] = useState("");
  const [sortBy, setSortBy] = useState("last_seen");
  const [page, setPage] = useState(0);

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    sort_by: sortBy,
  });
  if (search) params.set("search", search);
  if (minVisits) params.set("min_visits", minVisits);

  const { data, error, isLoading } = useSWR<VisitorListResponse>(
    `visitors?${params.toString()}`,
    fetcher,
    { keepPreviousData: true },
  );

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Visitor Directory</h1>
        <span className="text-sm text-text-secondary">{total} visitors</span>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={applySearch} className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-secondary" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name or ID…"
                className="w-full rounded-control border border-card/60 bg-bg py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <Button type="submit" variant="ghost">
              Search
            </Button>
          </form>

          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Min visits
            <input
              type="number"
              min={0}
              value={minVisits}
              onChange={(e) => {
                setPage(0);
                setMinVisits(e.target.value);
              }}
              className="w-24 rounded-control border border-card/60 bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Sort by
            <select
              value={sortBy}
              onChange={(e) => {
                setPage(0);
                setSortBy(e.target.value);
              }}
              className="rounded-control border border-card/60 bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
            >
              <option value="last_seen">Most Recent</option>
              <option value="visit_count">Most Visits</option>
              <option value="first_seen">First Seen</option>
            </select>
          </label>
        </div>
      </Card>

      <Card>
        {error ? (
          <ErrorState message="Could not load visitors. Is the backend running?" />
        ) : isLoading && !data ? (
          <Spinner />
        ) : (
          <>
            <VisitorTable visitors={data?.visitors ?? []} />
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>
                Page {page + 1} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
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
