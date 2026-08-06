-- The GraphQL Server Studio: a hosted GraphQL API per row, over the same
-- `db.json` shape the JSON Server Studio stores and with the same account-free
-- ownership. Separate tables rather than a flag on `json_servers`, so `key` can
-- collide harmlessly across prefixes — `/j/payments` and `/g/payments` are two
-- different servers — and so each studio's log row can be the shape it needs.

CREATE TABLE "graphql_servers" (
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

    CONSTRAINT "graphql_servers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "graphql_servers_key_key" ON "graphql_servers"("key");
CREATE UNIQUE INDEX "graphql_servers_recovery_hash_key" ON "graphql_servers"("recovery_hash");
CREATE INDEX "graphql_servers_last_seen_at_idx" ON "graphql_servers"("last_seen_at");

CREATE TABLE "graphql_server_secrets" (
    "secret_hash" TEXT NOT NULL,
    "server_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graphql_server_secrets_pkey" PRIMARY KEY ("secret_hash")
);

CREATE INDEX "graphql_server_secrets_server_id_idx" ON "graphql_server_secrets"("server_id");

ALTER TABLE "graphql_server_secrets"
    ADD CONSTRAINT "graphql_server_secrets_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "graphql_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The operation name, the operation type, the status, the duration and the node
-- cost. Deliberately **not** the query text: a GraphQL request body is the whole
-- document, and a document is largely the visitor's own field names against
-- their own data, already stored once in `db`.
CREATE TABLE "graphql_server_logs" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "operation_name" TEXT,
    "operation_type" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graphql_server_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "graphql_server_logs_server_id_created_at_idx" ON "graphql_server_logs"("server_id", "created_at" DESC);

ALTER TABLE "graphql_server_logs"
    ADD CONSTRAINT "graphql_server_logs_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "graphql_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
