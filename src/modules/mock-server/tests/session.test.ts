import { describe, expect, test } from "bun:test";

import { MAX_WORKSPACES_PER_BROWSER, SECRET_LENGTH } from "@/modules/mock-server/domain/constants";
import { createWorkspaceSecret, isWorkspaceSecret } from "@/modules/mock-server/domain/credentials";
import {
    addSecret,
    hasCapacity,
    parseSecretList,
    removeSecret,
    serializeSecretList,
} from "@/modules/mock-server/domain/session";
import type { RandomBytes } from "@/modules/tools/types";

const zeroBytes: RandomBytes = (length) => new Uint8Array(length);

/** A well-formed secret that is distinguishable from its neighbours. */
function secret(marker: string): string {
    return marker.repeat(SECRET_LENGTH).slice(0, SECRET_LENGTH);
}

const A = secret("a");
const B = secret("b");
const C = secret("c");
const D = secret("d");

describe("createWorkspaceSecret", () => {
    test("draws exactly the specified length", () => {
        expect(createWorkspaceSecret(zeroBytes)).toHaveLength(SECRET_LENGTH);
    });

    test("draws something the parser will accept back", () => {
        expect(isWorkspaceSecret(createWorkspaceSecret(zeroBytes))).toBe(true);
    });

    test("never draws the cookie separator", () => {
        expect(createWorkspaceSecret(zeroBytes)).not.toContain(".");
    });
});

describe("isWorkspaceSecret", () => {
    test("rejects a value one character short", () => {
        expect(isWorkspaceSecret(A.slice(1))).toBe(false);
    });

    test("rejects a value one character long", () => {
        expect(isWorkspaceSecret(`${A}a`)).toBe(false);
    });

    test("rejects upper case, which nothing here ever draws", () => {
        expect(isWorkspaceSecret(A.toUpperCase())).toBe(false);
    });

    test("rejects the empty string", () => {
        expect(isWorkspaceSecret("")).toBe(false);
    });
});

describe("parseSecretList", () => {
    test("reads nothing out of an absent cookie", () => {
        expect(parseSecretList(undefined)).toEqual([]);
    });

    test("reads nothing out of an empty cookie", () => {
        expect(parseSecretList("")).toEqual([]);
    });

    test("reads a single secret", () => {
        expect(parseSecretList(A)).toEqual([A]);
    });

    test("reads several in the order they were written", () => {
        expect(parseSecretList(`${A}.${B}.${C}`)).toEqual([A, B, C]);
    });

    /**
     * The rule the whole file exists for: one bad entry costs that entry and
     * nothing else. A cookie is the visitor's only handle on their work when
     * they have not saved a recovery key.
     */
    test("keeps the good entries when one is malformed", () => {
        expect(parseSecretList(`${A}.NOT-A-SECRET.${B}`)).toEqual([A, B]);
    });

    test("survives a cookie that is entirely rubbish", () => {
        expect(parseSecretList("hello.world")).toEqual([]);
    });

    test("survives leading and trailing separators", () => {
        expect(parseSecretList(`.${A}..${B}.`)).toEqual([A, B]);
    });

    test("collapses a secret that appears twice", () => {
        expect(parseSecretList(`${A}.${B}.${A}`)).toEqual([A, B]);
    });

    /** A cookie written before the cap was lowered must not outlive the cap. */
    test("never returns more than the browser may hold", () => {
        const overfull = [A, B, C, D].join(".");

        expect(parseSecretList(overfull)).toHaveLength(MAX_WORKSPACES_PER_BROWSER);
    });

    test("round-trips through serialize", () => {
        expect(parseSecretList(serializeSecretList([A, B]))).toEqual([A, B]);
    });
});

describe("addSecret", () => {
    test("puts the newest workspace first", () => {
        const result = addSecret([A], B);

        expect(result).toEqual({ ok: true, secrets: [B, A] });
    });

    test("adds to an empty list", () => {
        expect(addSecret([], A)).toEqual({ ok: true, secrets: [A] });
    });

    /**
     * Importing a workspace this browser already owns is a success. Anything
     * else would let a full list turn a no-op into an error message.
     */
    test("re-adding one already held changes nothing and still succeeds", () => {
        const held = [A, B, C];

        expect(addSecret(held, B)).toEqual({ ok: true, secrets: held });
    });

    /**
     * Refuses rather than evicting. Eviction would drop somebody's only handle
     * on a workspace at the exact moment their attention is on a different one.
     */
    test("refuses a fourth rather than evicting the oldest", () => {
        expect(addSecret([A, B, C], D)).toEqual({ ok: false, reason: "cookie_full" });
    });
});

describe("removeSecret", () => {
    test("drops the one named and keeps the order of the rest", () => {
        expect(removeSecret([A, B, C], B)).toEqual([A, C]);
    });

    test("is a no-op for one that was never held", () => {
        expect(removeSecret([A, B], D)).toEqual([A, B]);
    });

    test("empties a single-entry list", () => {
        expect(removeSecret([A], A)).toEqual([]);
    });

    test("makes room again", () => {
        expect(hasCapacity(removeSecret([A, B, C], A))).toBe(true);
    });
});

describe("hasCapacity", () => {
    test("an empty browser has room", () => {
        expect(hasCapacity([])).toBe(true);
    });

    test("one below the cap has room", () => {
        expect(hasCapacity([A, B])).toBe(true);
    });

    test("at the cap it does not", () => {
        expect(hasCapacity([A, B, C])).toBe(false);
    });
});
