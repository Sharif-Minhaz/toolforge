import { describe, expect, test } from "bun:test";

import { resolveHttpEndpoint } from "@/modules/tools/domain/endpoint";

describe("resolveHttpEndpoint with a default path", () => {
    const options = { defaultPath: "detect" };

    test("appends the route to a bare worker origin", () => {
        expect(resolveHttpEndpoint("https://ai-image-detector.example.workers.dev", options)).toBe(
            "https://ai-image-detector.example.workers.dev/detect",
        );
    });

    test("appends the route to an origin written with a trailing slash", () => {
        expect(resolveHttpEndpoint("https://ai-image-detector.example.workers.dev/", options)).toBe(
            "https://ai-image-detector.example.workers.dev/detect",
        );
    });

    test("leaves a value that already names the route alone", () => {
        expect(
            resolveHttpEndpoint("https://ai-image-detector.example.workers.dev/detect", options),
        ).toBe("https://ai-image-detector.example.workers.dev/detect");
    });

    test("leaves a worker mounted under a different path alone", () => {
        expect(resolveHttpEndpoint("https://example.com/ai/detect", options)).toBe(
            "https://example.com/ai/detect",
        );
    });

    test("ignores surrounding whitespace from a pasted variable", () => {
        expect(resolveHttpEndpoint("  https://example.com/detect  ", options)).toBe(
            "https://example.com/detect",
        );
    });

    test("keeps a port and a query string", () => {
        expect(resolveHttpEndpoint("http://localhost:8787?debug=1", options)).toBe(
            "http://localhost:8787/detect?debug=1",
        );
    });
});

describe("resolveHttpEndpoint without a default path", () => {
    test("leaves a worker that answers on the root at the root", () => {
        expect(resolveHttpEndpoint("https://watermark-remover.example.workers.dev")).toBe(
            "https://watermark-remover.example.workers.dev/",
        );
    });

    test("keeps a path the variable already names", () => {
        expect(resolveHttpEndpoint("https://example.com/remove")).toBe(
            "https://example.com/remove",
        );
    });

    test("keeps a port and a query string", () => {
        expect(resolveHttpEndpoint("http://localhost:8787?debug=1")).toBe(
            "http://localhost:8787/?debug=1",
        );
    });
});

describe("resolveHttpEndpoint rejections", () => {
    const rejected = [
        "",
        "   ",
        "not a url",
        "ai-image-detector.example.workers.dev",
        "file:///etc/passwd",
        "javascript:alert(1)",
    ];

    for (const configured of rejected) {
        test(`reads ${JSON.stringify(configured)} as unconfigured rather than as an endpoint`, () => {
            expect(resolveHttpEndpoint(configured)).toBeNull();
            expect(resolveHttpEndpoint(configured, { defaultPath: "detect" })).toBeNull();
        });
    }
});
