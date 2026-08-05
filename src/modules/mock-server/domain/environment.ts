/**
 * Variables a graph can read, and the rules for resolving them.
 *
 * Three scopes, narrowest wins: a value set on a collection beats the same key
 * on its server, which beats the same key on the workspace. That is the only
 * ordering that makes "override this one thing for these endpoints" possible
 * without duplicating everything else.
 *
 * `environment` is a second axis — "default", "staging" — so one workspace can
 * hold two sets of the same keys and switch between them. The two are
 * independent: overriding happens *within* an environment, never across.
 */

export const VARIABLE_SCOPES = ["WORKSPACE", "SERVER", "COLLECTION"] as const;

export type VariableScope = (typeof VARIABLE_SCOPES)[number];

/** Narrowest last, because a later write wins when they are merged in order. */
const SCOPE_ORDER: Readonly<Record<VariableScope, number>> = {
    WORKSPACE: 0,
    SERVER: 1,
    COLLECTION: 2,
};

export const DEFAULT_ENVIRONMENT = "default";

export const MAX_VARIABLES_PER_WORKSPACE = 200;

export const VARIABLE_KEY_LENGTH = { min: 1, max: 64 } as const;

export const VARIABLE_VALUE_LENGTH = { min: 0, max: 4_096 } as const;

export const ENVIRONMENT_NAME_LENGTH = { min: 1, max: 32 } as const;

/**
 * Shell-style: letters, digits and underscores, not starting with a digit.
 *
 * Narrower than JSON would require, deliberately. These read as `API_BASE` in a
 * dropdown next to real environment variables, and a key with a space or a dot
 * in it would be indistinguishable from a path expression at a glance.
 */
export const VARIABLE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const ENVIRONMENT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export type VariableRow = {
    readonly scopeType: VariableScope;
    readonly scopeId: string;
    readonly environment: string;
    readonly key: string;
    readonly value: string;
    readonly isSecret: boolean;
};

export const VARIABLE_PROBLEMS = [
    "invalid_key",
    "reserved_key",
    "value_too_long",
    "invalid_environment",
    "variable_limit_reached",
] as const;

export type VariableProblem = (typeof VARIABLE_PROBLEMS)[number];

/**
 * Names this service will not let a workspace define.
 *
 * Not a security boundary — a mock's variables never reach `process.env`, and
 * `resolveValue` reads only the map it is handed. It is a legibility one:
 * somebody who defines `DATABASE_URL` in a mock server is confusing it for
 * their deployment's configuration, and the refusal is the fastest way to say
 * that these are not the same thing.
 */
export const RESERVED_VARIABLE_KEYS: ReadonlySet<string> = new Set([
    "DATABASE_URL",
    "DIRECT_URL",
    "NODE_ENV",
    "PATH",
    "TURNSTILE_SECRET",
    "MOCK_IP_SALT",
    "PORT_SCAN_IP_SALT",
]);

export type VariableCheck =
    | { readonly ok: true; readonly key: string }
    | { readonly ok: false; readonly reason: VariableProblem };

export function checkVariableKey(input: string): VariableCheck {
    const key = input.trim();

    if (
        key.length < VARIABLE_KEY_LENGTH.min ||
        key.length > VARIABLE_KEY_LENGTH.max ||
        !VARIABLE_KEY_PATTERN.test(key)
    ) {
        return { ok: false, reason: "invalid_key" };
    }

    if (RESERVED_VARIABLE_KEYS.has(key.toUpperCase())) {
        return { ok: false, reason: "reserved_key" };
    }

    return { ok: true, key };
}

export function checkEnvironmentName(input: string): VariableCheck {
    const name = input.trim().toLowerCase();

    if (
        name.length < ENVIRONMENT_NAME_LENGTH.min ||
        name.length > ENVIRONMENT_NAME_LENGTH.max ||
        !ENVIRONMENT_NAME_PATTERN.test(name)
    ) {
        return { ok: false, reason: "invalid_environment" };
    }

    return { ok: true, key: name };
}

export type ResolveScopes = {
    readonly workspaceId: string;
    readonly serverId: string;
    readonly collectionId: string | null;
};

/**
 * Flattens every variable that applies to one endpoint into the map the
 * executor reads.
 *
 * Filtered by environment first, then by whether the row's scope actually
 * contains this endpoint — a variable on a *different* server must not leak
 * into this one just because both belong to the workspace. Sorted narrowest
 * last so the override falls out of the merge order rather than needing a
 * precedence check per key.
 */
export function resolveEnvironment(
    rows: readonly VariableRow[],
    scopes: ResolveScopes,
    environment: string,
): Record<string, string> {
    const applicable = rows.filter((row) => {
        if (row.environment !== environment) {
            return false;
        }

        switch (row.scopeType) {
            case "WORKSPACE":
                return row.scopeId === scopes.workspaceId;
            case "SERVER":
                return row.scopeId === scopes.serverId;
            default:
                return scopes.collectionId !== null && row.scopeId === scopes.collectionId;
        }
    });

    const out: Record<string, string> = {};

    for (const row of applicable.toSorted(
        (a, b) => SCOPE_ORDER[a.scopeType] - SCOPE_ORDER[b.scopeType],
    )) {
        out[row.key] = row.value;
    }

    return out;
}

/**
 * The same rows, prepared for display.
 *
 * A secret's value is replaced rather than omitted, so the reader can see that
 * one is set without the studio ever sending it back to a browser. The whole
 * point of the flag is that the value leaves the database once, on the way to
 * an execution, and never on the way to a page.
 */
export type DisplayVariable = VariableRow & { readonly masked: boolean };

export const SECRET_MASK = "••••••••";

export function forDisplay(rows: readonly VariableRow[]): readonly DisplayVariable[] {
    return rows.map((row) =>
        row.isSecret ? { ...row, value: SECRET_MASK, masked: true } : { ...row, masked: false },
    );
}

/** Environment names present in a workspace, `default` always among them. */
export function listEnvironments(rows: readonly VariableRow[]): readonly string[] {
    const names = new Set<string>([DEFAULT_ENVIRONMENT]);

    for (const row of rows) {
        names.add(row.environment);
    }

    return [...names].toSorted((a, b) => {
        if (a === DEFAULT_ENVIRONMENT) {
            return -1;
        }

        if (b === DEFAULT_ENVIRONMENT) {
            return 1;
        }

        return a.localeCompare(b);
    });
}
