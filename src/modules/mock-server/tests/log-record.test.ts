import { describe, expect, test } from "bun:test";

import {
    buildLoggedRequest,
    buildLoggedResponse,
    MAX_LOGGED_BODY_BYTES,
    previewBody,
    redactBody,
    redactHeaders,
    REDACTION_MARKER,
    statusTone,
} from "@/modules/mock-server/domain/log-record";

describe("redactHeaders", () => {
    /**
     * The whole reason this file exists: people point mocks at code that is
     * mid-development, so the requests arriving carry real credentials aimed at
     * a different service entirely.
     */
    test("replaces an authorization header", () => {
        expect(redactHeaders({ authorization: "Bearer real-token" }, false)).toEqual({
            authorization: REDACTION_MARKER,
        });
    });

    test("replaces a cookie header", () => {
        expect(redactHeaders({ cookie: "session=abc" }, false).cookie).toBe(REDACTION_MARKER);
    });

    test("replaces an api key header", () => {
        expect(redactHeaders({ "x-api-key": "k" }, false)["x-api-key"]).toBe(REDACTION_MARKER);
    });

    /** HTTP header names are case-insensitive; redaction has to be too. */
    test("matches case-insensitively", () => {
        expect(redactHeaders({ Authorization: "Bearer x" }, false).Authorization).toBe(
            REDACTION_MARKER,
        );
    });

    test("leaves an ordinary header alone", () => {
        expect(redactHeaders({ "content-type": "application/json" }, false)["content-type"]).toBe(
            "application/json",
        );
    });

    /** Marked, not removed: absence and suppression are different facts. */
    test("keeps the header present so the reader knows it was sent", () => {
        expect(Object.keys(redactHeaders({ authorization: "x" }, false))).toEqual([
            "authorization",
        ]);
    });

    test("keeps everything when raw capture is opted into", () => {
        expect(redactHeaders({ authorization: "Bearer real" }, true).authorization).toBe(
            "Bearer real",
        );
    });
});

describe("redactBody", () => {
    test("replaces a password field", () => {
        expect(redactBody({ email: "a@b.c", password: "hunter2" }, false)).toEqual({
            email: "a@b.c",
            password: REDACTION_MARKER,
        });
    });

    test("matches a key loosely and case-insensitively", () => {
        expect(
            redactBody({ apiKey: "k", API_KEY: "k", refreshToken: "t", clientSecret: "s" }, false),
        ).toEqual({
            apiKey: REDACTION_MARKER,
            API_KEY: REDACTION_MARKER,
            refreshToken: REDACTION_MARKER,
            clientSecret: REDACTION_MARKER,
        });
    });

    test("reaches into a nested object", () => {
        expect(redactBody({ user: { name: "Ada", password: "x" } }, false)).toEqual({
            user: { name: "Ada", password: REDACTION_MARKER },
        });
    });

    test("reaches into an array of objects", () => {
        expect(redactBody([{ token: "a" }, { token: "b" }], false)).toEqual([
            { token: REDACTION_MARKER },
            { token: REDACTION_MARKER },
        ]);
    });

    test("leaves a scalar body alone", () => {
        expect(redactBody("plain text", false)).toBe("plain text");
    });

    test("leaves null alone", () => {
        expect(redactBody(null, false)).toBeNull();
    });

    /** A body is arbitrary JSON from somebody else's program. */
    test("stops at the depth cap rather than recursing forever", () => {
        let deep: Record<string, unknown> = { password: "x" };

        for (let index = 0; index < 20; index += 1) {
            deep = { nested: deep };
        }

        expect(() => redactBody(deep as never, false)).not.toThrow();
    });

    test("keeps everything when raw capture is opted into", () => {
        expect(redactBody({ password: "hunter2" }, true)).toEqual({ password: "hunter2" });
    });
});

describe("previewBody", () => {
    test("keeps a short body whole", () => {
        expect(previewBody("hello")).toEqual({ preview: "hello", truncated: false });
    });

    test("keeps a body exactly at the limit", () => {
        const exact = "x".repeat(MAX_LOGGED_BODY_BYTES);

        expect(previewBody(exact).truncated).toBe(false);
    });

    test("cuts one byte past the limit", () => {
        expect(previewBody("x".repeat(MAX_LOGGED_BODY_BYTES + 1)).truncated).toBe(true);
    });

    /** A silently shortened body reads as the whole thing. */
    test("flags that it cut", () => {
        expect(previewBody("x".repeat(100), 10)).toEqual({
            preview: "x".repeat(10),
            truncated: true,
        });
    });

    /** Measured in bytes, so an emoji is four — and a naive slice would break it. */
    test("does not cut a multi-byte character in half", () => {
        const emoji = "🚀".repeat(10);
        const { preview } = previewBody(emoji, 10);

        expect(preview).not.toContain("�");
        expect(preview).toBe("🚀🚀");
    });

    test("handles an empty body", () => {
        expect(previewBody("")).toEqual({ preview: "", truncated: false });
    });
});

describe("buildLoggedRequest", () => {
    test("redacts headers and body together", () => {
        const logged = buildLoggedRequest(
            { authorization: "Bearer t", "content-type": "application/json" },
            { page: "2" },
            JSON.stringify({ email: "a@b.c", password: "hunter2" }),
            false,
        );

        expect(logged.headers.authorization).toBe(REDACTION_MARKER);
        expect(logged.headers["content-type"]).toBe("application/json");
        expect(logged.bodyPreview).toContain(REDACTION_MARKER);
        expect(logged.bodyPreview).toContain("a@b.c");
    });

    test("carries the query through untouched", () => {
        expect(buildLoggedRequest({}, { page: "2" }, "", false).query).toEqual({ page: "2" });
    });

    /** Mangling a form body would help nobody — it has no keys to reason about. */
    test("leaves a non-JSON body as it arrived", () => {
        expect(buildLoggedRequest({}, {}, "a=1&b=2", false).bodyPreview).toBe("a=1&b=2");
    });

    test("survives a body that claims to be JSON and is not", () => {
        expect(buildLoggedRequest({}, {}, "{not json", false).bodyPreview).toBe("{not json");
    });

    test("records an empty body as empty", () => {
        expect(buildLoggedRequest({}, {}, "", false).bodyPreview).toBe("");
    });
});

describe("buildLoggedResponse", () => {
    test("turns the header rows into a map", () => {
        const logged = buildLoggedResponse(
            [
                { name: "content-type", value: "application/json" },
                { name: "set-cookie", value: "a=b" },
            ],
            "{}",
            false,
        );

        expect(logged.headers["content-type"]).toBe("application/json");
        expect(logged.headers["set-cookie"]).toBe(REDACTION_MARKER);
    });

    test("truncates a large response body", () => {
        expect(
            buildLoggedResponse([], "x".repeat(MAX_LOGGED_BODY_BYTES + 1), false).bodyTruncated,
        ).toBe(true);
    });
});

describe("statusTone", () => {
    test("2xx and 3xx read as success", () => {
        expect(statusTone(200)).toBe("success");
        expect(statusTone(302)).toBe("success");
    });

    test("4xx reads as a warning — the caller's problem", () => {
        expect(statusTone(404)).toBe("warning");
        expect(statusTone(401)).toBe("warning");
    });

    test("5xx reads as an error — the mock's problem", () => {
        expect(statusTone(500)).toBe("error");
    });
});
