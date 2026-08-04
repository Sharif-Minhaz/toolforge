-- The Port Scanner runs its scan from this server, so the scanned host sees
-- this site's address rather than the visitor's. This table is what stops the
-- tool being a free anonymous scanning service: a per-visitor count in a
-- rolling window, held somewhere that survives a cold start.
--
-- `visitor_hash` is a salted SHA-256 of the caller's address, never the address.
-- A dump of this table says how often somebody scanned and nothing about who.

-- CreateTable
CREATE TABLE "port_scan_quota" (
    "visitor_hash" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "port_scan_quota_pkey" PRIMARY KEY ("visitor_hash")
);

-- CreateIndex: expired rows are swept by window, so the sweep reads this
-- rather than the whole table.
CREATE INDEX "port_scan_quota_window_start_idx" ON "port_scan_quota"("window_start");
