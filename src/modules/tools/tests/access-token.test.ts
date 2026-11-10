import { describe, expect, test } from "bun:test";

import {
    ACCESS_TOKEN_PREFIX,
    checkAccess,
    createAccessToken,
    type AccessGate,
} from "@/modules/tools/domain/access-token";
import { hashCredential } from "@/modules/tools/domain/browser-secret";
import type { RandomBytes } from "@/modules/tools/types";

const zeroBytes: RandomBytes = (length) => new Uint8Array(length);
const token = createAccessToken(zeroBytes);

async function privateGate(): Promise<AccessGate> {
    return { access: "PRIVATE", accessTokenHash: await hashCredential(token) };
}

describe("createAccessToken", () => {
    test("is prefixed and long enough to be unguessable", () => {
        expect(token.startsWith(ACCESS_TOKEN_PREFIX)).toBe(true);
        expect(token.length).toBe(ACCESS_TOKEN_PREFIX.length + 32);
    });
});

describe("checkAccess", () => {
    test("an open server lets anyone in", async () => {
        const gate: AccessGate = { access: "OPEN", accessTokenHash: null };

        expect(await checkAccess(gate, { kind: "token", value: null })).toBeNull();
    });

    test("a private server refuses a request with no token", async () => {
        const gate = await privateGate();

        expect(await checkAccess(gate, { kind: "token", value: null })).toBe("token_required");
        expect(await checkAccess(gate, { kind: "token", value: "   " })).toBe("token_required");
    });

    test("a private server accepts its own token, padded or not", async () => {
        const gate = await privateGate();

        expect(await checkAccess(gate, { kind: "token", value: token })).toBeNull();
        expect(await checkAccess(gate, { kind: "token", value: ` ${token} ` })).toBeNull();
    });

    test("a private server refuses a wrong, malformed or rotated-away token", async () => {
        const gate = await privateGate();
        const other = createAccessToken((length) => new Uint8Array(length).fill(7));

        expect(await checkAccess(gate, { kind: "token", value: other })).toBe("token_invalid");
        expect(await checkAccess(gate, { kind: "token", value: "tf_short" })).toBe("token_invalid");
        expect(await checkAccess(gate, { kind: "token", value: token.slice(3) })).toBe(
            "token_invalid",
        );
    });

    test("fails closed when a private server has no token on file", async () => {
        const gate: AccessGate = { access: "PRIVATE", accessTokenHash: null };

        expect(await checkAccess(gate, { kind: "token", value: token })).toBe("token_invalid");
    });

    test("the studio's owner credential passes a private server", async () => {
        const gate: AccessGate = { access: "PRIVATE", accessTokenHash: null };

        expect(await checkAccess(gate, { kind: "owner" })).toBeNull();
    });
});
