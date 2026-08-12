import { describe, expect, test } from "bun:test";

import {
    MAX_REMOTE_IMAGE_BYTES,
    REMOTE_IMAGE_PROBLEMS,
    remoteImageFilename,
    remoteImageType,
} from "@/modules/tools/domain/remote-image";
import { DECODABLE_IMAGE_TYPES } from "@/modules/tools/types";

describe("remoteImageType", () => {
    test("accepts every type this site can decode", () => {
        for (const type of DECODABLE_IMAGE_TYPES) {
            expect(remoteImageType(type)).toBe(type);
        }
    });

    test("strips parameters and casing", () => {
        expect(remoteImageType("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
        expect(remoteImageType("  image/png  ")).toBe("image/png");
    });

    test("refuses an image format nothing here decodes", () => {
        expect(remoteImageType("image/tiff")).toBeNull();
        expect(remoteImageType("image/svg+xml")).toBeNull();
    });

    test("refuses the HTML error page served with a 200", () => {
        expect(remoteImageType("text/html; charset=utf-8")).toBeNull();
    });

    test("refuses a missing header rather than guessing", () => {
        expect(remoteImageType(undefined)).toBeNull();
        expect(remoteImageType("")).toBeNull();
    });
});

describe("remoteImageFilename", () => {
    test("keeps the last path segment", () => {
        expect(
            remoteImageFilename(new URL("https://cdn.example.com/photos/cat.jpg"), "image/jpeg"),
        ).toBe("cat.jpg");
    });

    test("takes the extension from the bytes, not from the path", () => {
        // A CDN that re-encodes on the fly serves `photo.jpg` as PNG, and
        // saving those bytes as `.jpg` hands the reader a file their own
        // system opens with the wrong decoder.
        expect(remoteImageFilename(new URL("https://cdn.example.com/photo.jpg"), "image/png")).toBe(
            "photo.png",
        );
    });

    test("decodes a percent-escaped name", () => {
        expect(
            remoteImageFilename(new URL("https://example.com/my%20cat%20photo.png"), "image/png"),
        ).toBe("my-cat-photo.png");
    });

    test("survives a malformed percent escape", () => {
        expect(remoteImageFilename(new URL("https://example.com/100%.png"), "image/png")).toBe(
            "100%.png",
        );
    });

    test("falls back to the host when there is no path", () => {
        // Hyphenated, because the stemmer would otherwise read `.com` as an
        // extension and hand back `images.example.webp`.
        expect(remoteImageFilename(new URL("https://images.example.com/"), "image/webp")).toBe(
            "images-example-com.webp",
        );
        expect(remoteImageFilename(new URL("https://images.example.com"), "image/webp")).toBe(
            "images-example-com.webp",
        );
    });

    test("ignores the query string", () => {
        expect(
            remoteImageFilename(new URL("https://example.com/cat.png?w=800&fit=crop"), "image/png"),
        ).toBe("cat.png");
    });

    test("cannot produce a path separator or a hidden file", () => {
        const name = remoteImageFilename(
            new URL("https://example.com/%2e%2e%2f%2e%2e%2fetc%2fpasswd"),
            "image/png",
        );

        expect(name).not.toContain("/");
        expect(name.startsWith(".")).toBe(false);
    });

    test("leaves the name off when the type is one nothing writes", () => {
        expect(remoteImageFilename(new URL("https://example.com/cat"), "text/html")).toBe("cat");
    });
});

describe("limits", () => {
    test("the URL import is capped below a local pick", () => {
        // The bytes cross the network twice, so the convenience is allowed less
        // room than the tool's main road.
        expect(MAX_REMOTE_IMAGE_BYTES).toBeLessThan(25 * 1024 * 1024);
    });

    test("every problem name is unique", () => {
        expect(new Set(REMOTE_IMAGE_PROBLEMS).size).toBe(REMOTE_IMAGE_PROBLEMS.length);
    });
});
