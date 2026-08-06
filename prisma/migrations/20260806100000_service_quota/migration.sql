-- Renamed when the JSON Server Studio became the second caller of the same
-- fixed-window counter. Every key in it is a digest of a namespaced string, so
-- two limits sharing the table cannot land on one row — see `ServiceQuota` in
-- schema.prisma and `tools/repository/rate-counter.ts`.
--
-- A rename rather than a new table plus a copy: the rows are one-minute and
-- one-hour counters keyed by digest, so migrating them keeps every open window
-- intact instead of handing every active caller a fresh allowance.
ALTER TABLE "mock_quota" RENAME TO "service_quota";
ALTER INDEX "mock_quota_pkey" RENAME TO "service_quota_pkey";
ALTER INDEX "mock_quota_window_start_idx" RENAME TO "service_quota_window_start_idx";
