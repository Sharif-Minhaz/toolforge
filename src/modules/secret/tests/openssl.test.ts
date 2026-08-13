import { describe, expect, test } from "bun:test";

import { equivalentCommand } from "@/modules/secret/domain/openssl";

/**
 * Every string asserted here was run against OpenSSL 3.0.13 and GNU coreutils
 * 9.4 before it was written down. The wrap boundaries especially: a command
 * that omits the newline strip one byte too early hands somebody a secret with
 * a line break buried in it, and nothing about the output says so.
 */
describe("equivalentCommand", () => {
    test("prints the pipeline the READMEs copy, for the default settings", () => {
        expect(equivalentCommand(32, "base64url", false)).toBe(
            "openssl rand -base64 32 | tr '+/' '-_' | tr -d '='",
        );
    });

    test("drops each stage the settings no longer need", () => {
        expect(equivalentCommand(32, "base64", true)).toBe("openssl rand -base64 32");
        expect(equivalentCommand(32, "base64", false)).toBe("openssl rand -base64 32 | tr -d '='");
        expect(equivalentCommand(32, "base64url", true)).toBe(
            "openssl rand -base64 32 | tr '+/' '-_'",
        );
    });

    test("uses openssl's own hex, which neither pads nor wraps", () => {
        expect(equivalentCommand(32, "hex", false)).toBe("openssl rand -hex 32");
        expect(equivalentCommand(512, "hex", true)).toBe("openssl rand -hex 512");
    });

    test("reaches for coreutils for base32, which openssl cannot write", () => {
        expect(equivalentCommand(20, "base32", true)).toBe("openssl rand 20 | base32");
        expect(equivalentCommand(20, "base32", false)).toBe("openssl rand 20 | base32 | tr -d '='");
    });

    /**
     * `openssl enc -base64` breaks its output every 64 characters, which 48
     * bytes reach exactly and 49 exceed. Verified by running both.
     */
    test("adds the newline strip exactly where openssl starts wrapping", () => {
        expect(equivalentCommand(48, "base64", true)).toBe("openssl rand -base64 48");
        expect(equivalentCommand(49, "base64", true)).toBe("openssl rand -base64 49 | tr -d '\\n'");
    });

    /** GNU `base32` wraps at 76, which 45 bytes clear and 46 do not. */
    test("adds the newline strip exactly where coreutils starts wrapping", () => {
        expect(equivalentCommand(45, "base32", true)).toBe("openssl rand 45 | base32");
        expect(equivalentCommand(46, "base32", true)).toBe(
            "openssl rand 46 | base32 | tr -d '\\n'",
        );
    });

    test("folds the padding and the newline into one tr call", () => {
        expect(equivalentCommand(64, "base64url", false)).toBe(
            "openssl rand -base64 64 | tr '+/' '-_' | tr -d '=\\n'",
        );
        expect(equivalentCommand(64, "base32", false)).toBe(
            "openssl rand 64 | base32 | tr -d '=\\n'",
        );
    });
});
