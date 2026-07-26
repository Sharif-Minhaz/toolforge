import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 does not load .env itself. Bun would, but `bunx prisma` runs on Node,
// so load explicitly here to keep every invocation working the same way.
// Later files do not override earlier ones, so .env.local wins.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        // CLI-only (migrate / db push / studio). Migrations need the direct,
        // non-pooled connection. App runtime does not read this; it goes through
        // the PrismaPg adapter in src/lib/prisma.ts.
        url: env("DIRECT_URL"),
    },
});
