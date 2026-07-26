import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Prisma 7 requires a driver adapter; connection URLs no longer live in schema.prisma.
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

// Reuse the client across dev hot reloads instead of exhausting the connection pool.
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
