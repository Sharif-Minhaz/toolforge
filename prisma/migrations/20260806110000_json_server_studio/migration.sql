-- The JSON Server Studio: a hosted `json-server` per row, with the same
-- account-free ownership the Mock Server Studio uses.

CREATE TABLE "json_servers" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recovery_hash" TEXT NOT NULL,
    "recovery_epoch" INTEGER NOT NULL DEFAULT 1,
    "db" JSONB NOT NULL,
    "seed_db" JSONB NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "json_servers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "json_servers_key_key" ON "json_servers"("key");
CREATE UNIQUE INDEX "json_servers_recovery_hash_key" ON "json_servers"("recovery_hash");
CREATE INDEX "json_servers_last_seen_at_idx" ON "json_servers"("last_seen_at");

CREATE TABLE "json_server_secrets" (
    "secret_hash" TEXT NOT NULL,
    "server_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "json_server_secrets_pkey" PRIMARY KEY ("secret_hash")
);

CREATE INDEX "json_server_secrets_server_id_idx" ON "json_server_secrets"("server_id");

ALTER TABLE "json_server_secrets"
    ADD CONSTRAINT "json_server_secrets_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "json_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "json_server_logs" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "json_server_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "json_server_logs_server_id_created_at_idx" ON "json_server_logs"("server_id", "created_at" DESC);

ALTER TABLE "json_server_logs"
    ADD CONSTRAINT "json_server_logs_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "json_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
