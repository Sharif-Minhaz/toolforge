import { describe, expect, test } from "bun:test";

import {
    checkEnvironmentName,
    checkVariableKey,
    DEFAULT_ENVIRONMENT,
    forDisplay,
    listEnvironments,
    resolveEnvironment,
    SECRET_MASK,
    VARIABLE_KEY_LENGTH,
    type VariableRow,
} from "@/modules/mock-server/domain/environment";

const SCOPES = { workspaceId: "w1", serverId: "s1", collectionId: "c1" };

function row(overrides: Partial<VariableRow>): VariableRow {
    return {
        scopeType: "WORKSPACE",
        scopeId: "w1",
        environment: DEFAULT_ENVIRONMENT,
        key: "API_BASE",
        value: "workspace",
        isSecret: false,
        ...overrides,
    };
}

describe("checkVariableKey", () => {
    test("accepts a shell-style name", () => {
        expect(checkVariableKey("API_BASE")).toEqual({ ok: true, key: "API_BASE" });
    });

    test("accepts a leading underscore", () => {
        expect(checkVariableKey("_private").ok).toBe(true);
    });

    test("trims surrounding whitespace", () => {
        expect(checkVariableKey("  API_BASE  ")).toEqual({ ok: true, key: "API_BASE" });
    });

    test("refuses a leading digit", () => {
        expect(checkVariableKey("1API")).toEqual({ ok: false, reason: "invalid_key" });
    });

    /** A key with a dot is indistinguishable from a path expression at a glance. */
    test("refuses a dot", () => {
        expect(checkVariableKey("api.base")).toEqual({ ok: false, reason: "invalid_key" });
    });

    test("refuses a space", () => {
        expect(checkVariableKey("API BASE")).toEqual({ ok: false, reason: "invalid_key" });
    });

    test("refuses the empty string", () => {
        expect(checkVariableKey("")).toEqual({ ok: false, reason: "invalid_key" });
    });

    test("refuses a key past the length ceiling", () => {
        expect(checkVariableKey("A".repeat(VARIABLE_KEY_LENGTH.max + 1))).toEqual({
            ok: false,
            reason: "invalid_key",
        });
    });

    /**
     * Not a security boundary — a mock's variables never reach `process.env`.
     * It is a legibility one: defining `DATABASE_URL` here means somebody has
     * confused a mock for their deployment's configuration.
     */
    test("refuses a name that belongs to the deployment", () => {
        expect(checkVariableKey("DATABASE_URL")).toEqual({ ok: false, reason: "reserved_key" });
        expect(checkVariableKey("turnstile_secret")).toEqual({ ok: false, reason: "reserved_key" });
    });
});

describe("checkEnvironmentName", () => {
    test("accepts a simple name", () => {
        expect(checkEnvironmentName("staging")).toEqual({ ok: true, key: "staging" });
    });

    test("lower-cases what was typed", () => {
        expect(checkEnvironmentName("Staging")).toEqual({ ok: true, key: "staging" });
    });

    test("accepts a hyphen inside", () => {
        expect(checkEnvironmentName("pre-prod").ok).toBe(true);
    });

    test("refuses a leading hyphen", () => {
        expect(checkEnvironmentName("-prod")).toEqual({ ok: false, reason: "invalid_environment" });
    });

    test("refuses an underscore", () => {
        expect(checkEnvironmentName("pre_prod").ok).toBe(false);
    });

    test("refuses the empty string", () => {
        expect(checkEnvironmentName("  ").ok).toBe(false);
    });
});

describe("resolveEnvironment", () => {
    test("returns nothing for an empty set", () => {
        expect(resolveEnvironment([], SCOPES, DEFAULT_ENVIRONMENT)).toEqual({});
    });

    test("reads a workspace variable", () => {
        expect(resolveEnvironment([row({})], SCOPES, DEFAULT_ENVIRONMENT)).toEqual({
            API_BASE: "workspace",
        });
    });

    /** Narrowest wins, or "override this one thing" is impossible. */
    test("a server value beats the workspace's", () => {
        const rows = [row({}), row({ scopeType: "SERVER", scopeId: "s1", value: "server" })];

        expect(resolveEnvironment(rows, SCOPES, DEFAULT_ENVIRONMENT).API_BASE).toBe("server");
    });

    test("a collection value beats the server's", () => {
        const rows = [
            row({}),
            row({ scopeType: "SERVER", scopeId: "s1", value: "server" }),
            row({ scopeType: "COLLECTION", scopeId: "c1", value: "collection" }),
        ];

        expect(resolveEnvironment(rows, SCOPES, DEFAULT_ENVIRONMENT).API_BASE).toBe("collection");
    });

    test("the ordering does not depend on the row order", () => {
        const rows = [
            row({ scopeType: "COLLECTION", scopeId: "c1", value: "collection" }),
            row({ scopeType: "SERVER", scopeId: "s1", value: "server" }),
            row({}),
        ];

        expect(resolveEnvironment(rows, SCOPES, DEFAULT_ENVIRONMENT).API_BASE).toBe("collection");
    });

    /** The leak this filter exists to prevent. */
    test("a variable on a different server does not apply", () => {
        const rows = [row({ scopeType: "SERVER", scopeId: "other", value: "elsewhere" })];

        expect(resolveEnvironment(rows, SCOPES, DEFAULT_ENVIRONMENT)).toEqual({});
    });

    test("a collection variable does not apply to an endpoint outside it", () => {
        const rows = [row({ scopeType: "COLLECTION", scopeId: "c1", value: "x" })];

        expect(
            resolveEnvironment(rows, { ...SCOPES, collectionId: null }, DEFAULT_ENVIRONMENT),
        ).toEqual({});
    });

    /** Overriding happens within an environment, never across. */
    test("a variable from another environment does not apply", () => {
        const rows = [row({ environment: "staging", value: "staging" })];

        expect(resolveEnvironment(rows, SCOPES, DEFAULT_ENVIRONMENT)).toEqual({});
    });

    test("switching environment switches the whole set", () => {
        const rows = [row({ value: "prod" }), row({ environment: "staging", value: "staging" })];

        expect(resolveEnvironment(rows, SCOPES, "staging").API_BASE).toBe("staging");
    });

    test("keeps keys that do not collide", () => {
        const rows = [row({ key: "A", value: "1" }), row({ key: "B", value: "2" })];

        expect(resolveEnvironment(rows, SCOPES, DEFAULT_ENVIRONMENT)).toEqual({ A: "1", B: "2" });
    });

    /** A secret's value is exactly what execution needs; masking is a UI concern. */
    test("resolves a secret's real value for execution", () => {
        const rows = [row({ isSecret: true, value: "s3cret" })];

        expect(resolveEnvironment(rows, SCOPES, DEFAULT_ENVIRONMENT).API_BASE).toBe("s3cret");
    });
});

describe("forDisplay", () => {
    /** The value leaves the database on the way to an execution, never to a page. */
    test("masks a secret's value", () => {
        const [shown] = forDisplay([row({ isSecret: true, value: "s3cret" })]);

        expect(shown.value).toBe(SECRET_MASK);
        expect(shown.masked).toBe(true);
    });

    test("shows an ordinary value", () => {
        const [shown] = forDisplay([row({ value: "https://api.example.com" })]);

        expect(shown.value).toBe("https://api.example.com");
        expect(shown.masked).toBe(false);
    });

    /** Masked, not omitted: the reader has to see that one is set. */
    test("keeps a secret's key visible", () => {
        expect(forDisplay([row({ isSecret: true })])[0].key).toBe("API_BASE");
    });
});

describe("listEnvironments", () => {
    test("always offers the default", () => {
        expect(listEnvironments([])).toEqual([DEFAULT_ENVIRONMENT]);
    });

    test("lists the default first, then the rest alphabetically", () => {
        const rows = [row({ environment: "staging" }), row({ environment: "canary" })];

        expect(listEnvironments(rows)).toEqual([DEFAULT_ENVIRONMENT, "canary", "staging"]);
    });

    test("does not repeat a name", () => {
        const rows = [row({ environment: "staging" }), row({ environment: "staging", key: "B" })];

        expect(listEnvironments(rows)).toEqual([DEFAULT_ENVIRONMENT, "staging"]);
    });
});
