import "server-only";

import { findFakerProvider } from "../domain/faker-registry";
import type { JsonValue } from "../types/graph";

/**
 * The only place `@faker-js/faker` is imported.
 *
 * Server-only, and loaded lazily inside the function that needs it. The package
 * is roughly three megabytes: a static import at module scope would pull it into
 * anything that transitively reaches this file, and `domain/` — which the client
 * bundle does reach — deliberately knows nothing about it. `domain/values.ts`
 * takes the provider as a parameter on `ExecutionContext` instead, which is the
 * same injection the clock and the random source use.
 *
 * The module handle is cached after the first load so a response with forty fake
 * fields pays for the import once, not forty times.
 */

type FakerModule = typeof import("@faker-js/faker");

let cached: FakerModule | null = null;

export async function loadFaker(): Promise<FakerModule> {
    cached ??= await import("@faker-js/faker");

    return cached;
}

/**
 * Builds the provider that gets injected into an execution context.
 *
 * Seeded per request from the same generator everything else draws on, so a
 * response containing fake data still satisfies the reproducibility invariant:
 * same graph, same request, same seed, identical bytes.
 *
 * Faker's own `seed()` takes a number, so one is drawn from the seeded source
 * rather than from the clock. That is what ties the two generators together —
 * without it, the array counts would repeat and the names would not.
 */
export function createFakerProvider(
    faker: FakerModule,
    random: () => number,
): (id: string) => JsonValue {
    const instance = faker.faker;
    instance.seed(Math.floor(random() * 2_147_483_647));

    return (id) => {
        const provider = findFakerProvider(id);

        if (provider === undefined) {
            return null;
        }

        const [groupName, fnName] = provider.source.split(".");
        // Named `group`, not `module`: Next's bundler forbids assigning to a
        // variable called `module` because it shadows the CommonJS one.
        const group = (instance as unknown as Record<string, Record<string, unknown>>)[groupName];
        const fn = group?.[fnName];

        if (typeof fn !== "function") {
            // A provider whose source moved in a Faker upgrade degrades to null
            // rather than throwing. The registry is the contract; a mismatch is
            // a bug to fix, not a reason to fail somebody's request.
            return null;
        }

        const value: unknown = (fn as () => unknown).call(group);

        return normalize(value);
    };
}

/**
 * Faker returns `Date` objects from its date module and numbers elsewhere. A
 * response body is JSON, so a date becomes an ISO-8601 string — the one
 * spelling that is unambiguous across every consumer.
 */
function normalize(value: unknown): JsonValue {
    if (value instanceof Date) {
        return value.toISOString();
    }

    if (value === null || typeof value === "string" || typeof value === "number") {
        return value;
    }

    if (typeof value === "boolean") {
        return value;
    }

    return value === undefined ? null : String(value);
}
