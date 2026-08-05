-- CreateEnum
CREATE TYPE "http_method" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS');

-- CreateEnum
CREATE TYPE "variable_scope" AS ENUM ('WORKSPACE', 'SERVER', 'COLLECTION');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "recovery_hash" TEXT NOT NULL,
    "recovery_epoch" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_secrets" (
    "secret_hash" TEXT NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_secrets_pkey" PRIMARY KEY ("secret_hash")
);

-- CreateTable
CREATE TABLE "mock_servers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endpoints" (
    "id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "collection_id" UUID,
    "method" "http_method" NOT NULL,
    "path_pattern" TEXT NOT NULL,
    "segment_count" INTEGER NOT NULL,
    "specificity" INTEGER NOT NULL,
    "has_wildcard" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "graph" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environment_variables" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" "variable_scope" NOT NULL,
    "scope_id" UUID NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'default',
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environment_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "endpoint_id" UUID,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "trace" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_quota" (
    "visitor_hash" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_quota_pkey" PRIMARY KEY ("visitor_hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_recovery_hash_key" ON "workspaces"("recovery_hash");

-- CreateIndex
CREATE INDEX "workspaces_last_seen_at_idx" ON "workspaces"("last_seen_at");

-- CreateIndex
CREATE INDEX "workspace_secrets_workspace_id_idx" ON "workspace_secrets"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "mock_servers_key_key" ON "mock_servers"("key");

-- CreateIndex
CREATE INDEX "mock_servers_workspace_id_idx" ON "mock_servers"("workspace_id");

-- CreateIndex
CREATE INDEX "collections_server_id_path_idx" ON "collections"("server_id", "path");

-- CreateIndex
CREATE INDEX "collections_parent_id_idx" ON "collections"("parent_id");

-- CreateIndex
CREATE INDEX "endpoints_server_id_is_enabled_segment_count_idx" ON "endpoints"("server_id", "is_enabled", "segment_count");

-- CreateIndex
CREATE INDEX "endpoints_collection_id_idx" ON "endpoints"("collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_server_id_method_path_pattern_key" ON "endpoints"("server_id", "method", "path_pattern");

-- CreateIndex
CREATE INDEX "environment_variables_workspace_id_idx" ON "environment_variables"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "environment_variables_scope_type_scope_id_environment_key_key" ON "environment_variables"("scope_type", "scope_id", "environment", "key");

-- CreateIndex
CREATE INDEX "request_logs_workspace_id_created_at_idx" ON "request_logs"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "request_logs_server_id_created_at_idx" ON "request_logs"("server_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "mock_quota_window_start_idx" ON "mock_quota"("window_start");

-- AddForeignKey
ALTER TABLE "workspace_secrets" ADD CONSTRAINT "workspace_secrets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_servers" ADD CONSTRAINT "mock_servers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "mock_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "mock_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
