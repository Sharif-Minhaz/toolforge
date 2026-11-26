import { describe, expect, test } from "bun:test";

import {
    checkMediaEnvironment,
    classifyMediaError,
    type MediaFailure,
} from "../domain/media-failure";

describe("checkMediaEnvironment", () => {
    test("names an insecure page before a missing API, which it causes", () => {
        expect(checkMediaEnvironment({ isSecureContext: false, hasGetUserMedia: false })).toBe(
            "insecure_context",
        );
    });

    test("names a secure page without capture support", () => {
        expect(checkMediaEnvironment({ isSecureContext: true, hasGetUserMedia: false })).toBe(
            "unsupported",
        );
    });

    test("lets a secure page with the API ask", () => {
        expect(checkMediaEnvironment({ isSecureContext: true, hasGetUserMedia: true })).toBeNull();
    });
});

describe("classifyMediaError", () => {
    test.each<[string, MediaFailure]>([
        ["NotAllowedError", "denied"],
        ["SecurityError", "denied"],
        ["NotFoundError", "no_device"],
        ["NotReadableError", "in_use"],
        ["OverconstrainedError", "overconstrained"],
        ["PermissionDeniedError", "denied"],
        ["DevicesNotFoundError", "no_device"],
        ["TrackStartError", "in_use"],
        ["ConstraintNotSatisfiedError", "overconstrained"],
    ])("reads a DOMException named %s as %s", (name, failure) => {
        expect(classifyMediaError(new DOMException("", name))).toBe(failure);
    });

    test("reads Chrome's OverconstrainedError, which is not a DOMException", () => {
        expect(classifyMediaError({ name: "OverconstrainedError", constraint: "deviceId" })).toBe(
            "overconstrained",
        );
    });

    test.each([
        ["an AbortError", new DOMException("", "AbortError")],
        ["a TypeError", new TypeError("x")],
        ["a string", "NotAllowedError"],
        ["null", null],
        ["a name that is not a string", { name: 7 }],
        ["a prototype key", { name: "toString" }],
    ])("keeps %s as its own failure rather than guessing", (_, caught) => {
        expect(classifyMediaError(caught)).toBe("failed");
    });
});
