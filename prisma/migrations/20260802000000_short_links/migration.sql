-- The QR tool's dynamic codes and the URL Shortener are the same short link
-- behind the slug, so `qr_links` becomes `short_links` rather than being copied.
-- A rename keeps every row, its primary key, and its unique index in place.

-- RenameTable
ALTER TABLE "qr_links" RENAME TO "short_links";

-- RenameConstraint
ALTER TABLE "short_links" RENAME CONSTRAINT "qr_links_pkey" TO "short_links_pkey";

-- RenameIndex
ALTER INDEX "qr_links_edit_token_hash_key" RENAME TO "short_links_edit_token_hash_key";

-- AlterTable: all three are nullable, so existing dynamic QR codes stay exactly
-- as they were — no password, no window, live forever.
ALTER TABLE "short_links" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "short_links" ADD COLUMN "starts_at" TIMESTAMP(3);
ALTER TABLE "short_links" ADD COLUMN "expires_at" TIMESTAMP(3);
