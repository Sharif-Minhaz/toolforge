import { describe, expect, test } from "bun:test";

import { resolveDetectEndpoint } from "@/modules/ai-image-detector/domain/endpoint";

describe("resolveDetectEndpoint", () => {
    test("appends /detect to a bare worker origin", () => {
        expect(resolveDetectEndpoint("https://ai-image-detector.example.workers.dev")).toBe(
            "https://ai-image-detector.example.workers.dev/detect",
        );
    });

    test("appends /detect to an origin written with a trailing slash", () => {
        expect(resolveDetectEndpoint("https://ai-image-detector.example.workers.dev/")).toBe(
            "https://ai-image-detector.example.workers.dev/detect",
        );
    });

    test("leaves a value that already names the route alone", () => {
        expect(resolveDetectEndpoint("https://ai-image-detector.example.workers.dev/detect")).toBe(
            "https://ai-image-detector.example.workers.dev/detect",
        );
    });

    test("leaves a worker mounted under a different path alone", () => {
        expect(resolveDetectEndpoint("https://example.com/ai/detect")).toBe(
            "https://example.com/ai/detect",
        );
    });

    test("ignores surrounding whitespace from a pasted variable", () => {
        expect(resolveDetectEndpoint("  https://example.com/detect  ")).toBe(
            "https://example.com/detect",
        );
    });

    test("keeps a port and a query string", () => {
        expect(resolveDetectEndpoint("http://localhost:8787?debug=1")).toBe(
            "http://localhost:8787/detect?debug=1",
        );
    });

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
            expect(resolveDetectEndpoint(configured)).toBeNull();
        });
    }
});
