-- Per-server access token for the public addresses /j, /m and /g.
--
-- Every server that existed before this migration stays OPEN, so nothing that
-- calls it today starts failing. The default is then switched to PRIVATE, so a
-- server created from here on is private unless its owner opens it.

CREATE TYPE "server_access" AS ENUM ('OPEN', 'PRIVATE');

ALTER TABLE "mock_servers"
    ADD COLUMN "access" "server_access" NOT NULL DEFAULT 'OPEN',
    ADD COLUMN "access_token_hash" TEXT;
ALTER TABLE "mock_servers" ALTER COLUMN "access" SET DEFAULT 'PRIVATE';

ALTER TABLE "json_servers"
    ADD COLUMN "access" "server_access" NOT NULL DEFAULT 'OPEN',
    ADD COLUMN "access_token_hash" TEXT;
ALTER TABLE "json_servers" ALTER COLUMN "access" SET DEFAULT 'PRIVATE';

ALTER TABLE "graphql_servers"
    ADD COLUMN "access" "server_access" NOT NULL DEFAULT 'OPEN',
    ADD COLUMN "access_token_hash" TEXT;
ALTER TABLE "graphql_servers" ALTER COLUMN "access" SET DEFAULT 'PRIVATE';
