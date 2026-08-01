-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "qr_links" (
    "slug" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "edit_token_hash" TEXT NOT NULL,
    "scans" INTEGER NOT NULL DEFAULT 0,
    "last_scan_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_links_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "qr_links_edit_token_hash_key" ON "qr_links"("edit_token_hash");

