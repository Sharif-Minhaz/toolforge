import { describe, expect, test } from "bun:test";

import { loadImage, type LoadableImage } from "@/modules/tools/domain/image-element";

type FakeImage = LoadableImage & { readonly naturalWidth: number };

/**
 * Stands in for `new Image()`. Assigning `src` is where a real browser decides
 * between `load` and `error`, so that is where this one decides too.
 */
function fakeImage(decodes: boolean, naturalWidth = 800): FakeImage {
    const image: FakeImage = {
        naturalWidth,
        onload: null,
        onerror: null,
        set src(_value: string) {
            if (decodes) {
                image.onload?.();

                return;
            }

            image.onerror?.();
        },
        get src() {
            return "";
        },
    };

    return image;
}

describe("loadImage", () => {
    test("resolves the element itself, so a caller can draw it without loading twice", async () => {
        const loaded = await loadImage("blob:x", () => fakeImage(true, 640));

        expect(loaded?.naturalWidth).toBe(640);
    });

    test("resolves null for a source the browser cannot decode", async () => {
        expect(await loadImage("blob:x", () => fakeImage(false))).toBeNull();
    });

    test("never rejects, so one unreadable file cannot take the caller down with it", async () => {
        await expect(loadImage("blob:x", () => fakeImage(false))).resolves.toBeNull();
    });
});
