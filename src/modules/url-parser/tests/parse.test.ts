import { describe, expect, test } from "bun:test";

import { MAX_URL_INPUT_LENGTH } from "@/modules/url-parser/domain/constants";
import { parseUrl } from "@/modules/url-parser/domain/parse";
import type { UrlParseFailureReason } from "@/modules/url-parser/types";

const FULL_URL = "https://team:secret@api.example.com:8443/v2/search?q=url+parser&page=2#results";

function expectFailure(input: string, reason: UrlParseFailureReason) {
    const result = parseUrl(input);

    expect(result.ok).toBe(false);

    if (!result.ok) {
        expect(result.reason).toBe(reason);
    }
}

describe("parseUrl", () => {
    test("splits every part of a URL that carries them all", () => {
        const result = parseUrl(FULL_URL);

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.parts).toEqual({
            protocol: "https:",
            username: "team",
            password: "secret",
            hostname: "api.example.com",
            port: "8443",
            path: "/v2/search",
            query: "?q=url+parser&page=2",
            fragment: "#results",
            origin: "https://api.example.com:8443",
        });
    });

    test("reports an empty string for every part a URL does not carry", () => {
        const result = parseUrl("https://example.com/");

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.parts.username).toBe("");
        expect(result.parts.password).toBe("");
        expect(result.parts.port).toBe("");
        expect(result.parts.query).toBe("");
        expect(result.parts.fragment).toBe("");
        expect(result.params).toEqual([]);
    });

    test("leaves a scheme with no origin empty rather than showing the string null", () => {
        const result = parseUrl("mailto:someone@example.com");

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.parts.protocol).toBe("mailto:");
        expect(result.parts.path).toBe("someone@example.com");
        expect(result.parts.origin).toBe("");
    });

    test("keeps an IPv6 host in its brackets, with the port beside it", () => {
        const result = parseUrl("http://[::1]:8080/status");

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.parts.hostname).toBe("[::1]");
        expect(result.parts.port).toBe("8080");
    });

    test("decodes query values and keeps repeated keys in order", () => {
        const result = parseUrl("https://example.com/?tag=a&q=caf%C3%A9%20bar&tag=b");

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        expect(result.params).toEqual([
            { key: "tag", value: "a" },
            { key: "q", value: "café bar" },
            { key: "tag", value: "b" },
        ]);
    });

    test("flags the normalisation the platform parser applies", () => {
        const result = parseUrl("HTTPS://Example.COM:443/Path");

        expect(result.ok).toBe(true);

        if (!result.ok) {
            return;
        }

        // Scheme and host lowercased, the default port dropped, the path left
        // alone — a URL is case-sensitive from the path onwards.
        expect(result.href).toBe("https://example.com/Path");
        expect(result.normalized).toBe(true);
    });

    test("does not flag normalisation when the text was already canonical", () => {
        const result = parseUrl(FULL_URL);

        expect(result.ok).toBe(true);
        expect(result.ok && result.normalized).toBe(false);
    });

    test("ignores surrounding whitespace from a copy and paste", () => {
        const result = parseUrl("  https://example.com/a  ");

        expect(result.ok).toBe(true);
        expect(result.ok && result.href).toBe("https://example.com/a");
        expect(result.ok && result.normalized).toBe(false);
    });

    test("treats a blank input as empty rather than invalid", () => {
        expectFailure("", "empty");
        expectFailure("   \n  ", "empty");
    });

    test("refuses input past the length ceiling", () => {
        const long = `https://example.com/${"a".repeat(MAX_URL_INPUT_LENGTH)}`;

        expectFailure(long, "too_long");
        expect(parseUrl(`https://example.com/${"a".repeat(MAX_URL_INPUT_LENGTH - 21)}`).ok).toBe(
            true,
        );
    });

    test("names a leading slash a path, not a scheme that went missing", () => {
        // `https:///docs` parses, with `docs` as the host — so guessing a
        // scheme here would answer a question nobody asked.
        expectFailure("/docs/getting-started", "relative_path");
    });

    test("offers an https:// repair when only the scheme is missing", () => {
        const result = parseUrl("example.com/?cat=meow");

        expect(result.ok).toBe(false);

        if (result.ok) {
            return;
        }

        expect(result.reason).toBe("missing_scheme");
        expect(result.suggestion).toBe("https://example.com/?cat=meow");
    });

    test("never suggests a scheme for text that already has one", () => {
        // `https://https//` would otherwise be offered as the repair for a
        // half-typed URL, which is worse than saying it cannot be read.
        expectFailure("https://", "invalid_url");
        expectFailure("https://exa mple.com", "invalid_url");
        expectFailure("https://example.com:99999/", "invalid_url");
    });

    test("reports text that is not a URL under any reading as invalid", () => {
        expectFailure("not a url", "invalid_url");
        expectFailure("%", "invalid_url");
    });
});
