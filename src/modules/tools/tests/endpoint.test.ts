import { describe, expect, test } from "bun:test";

import { resolveHttpEndpoint } from "@/modules/tools/domain/endpoint";

describe("resolveHttpEndpoint", () => {
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

    test("ignores surrounding whitespace from a pasted variable", () => {
        expect(resolveHttpEndpoint("  https://example.com/remove  ")).toBe(
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
        "watermark-remover.example.workers.dev",
        "file:///etc/passwd",
        "javascript:alert(1)",
    ];

    for (const configured of rejected) {
        test(`reads ${JSON.stringify(configured)} as unconfigured rather than as an endpoint`, () => {
            expect(resolveHttpEndpoint(configured)).toBeNull();
        });
    }
});
