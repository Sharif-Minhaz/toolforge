import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { CUTOUT_MODELS, RUNTIME_WASM_BYTES } from "../domain/constants";
import { classifyRemovalError, firstRunBytes, readProgress } from "../domain/removal";
import { CUTOUT_QUALITIES } from "../types";

/** The shipped bundle, which is the only honest source for the two blocks below. */
const BUNDLE = readFileSync("node_modules/@imgly/background-removal/dist/index.mjs", "utf8");

describe("readProgress", () => {
    test("reports an asset download as a fraction of that asset", () => {
        expect(readProgress("fetch:/models/isnet_fp16", 44_076_354, 88_152_708)).toEqual({
            phase: "download",
            ratio: 0.5,
        });
    });

    test("reports a compute step against the four the library emits", () => {
        expect(readProgress("compute:inference", 1, 4)).toEqual({ phase: "compute", ratio: 0.25 });
        expect(readProgress("compute:encode", 4, 4)).toEqual({ phase: "compute", ratio: 1 });
    });

    test("ignores a key it does not recognise rather than guessing", () => {
        // A future version adding a fifth vocabulary must not make the bar jump.
        expect(readProgress("warmup:session", 1, 2)).toBeNull();
    });

    test("never returns NaN, whatever totals arrive", () => {
        expect(readProgress("fetch:/models/isnet", 5, 0)?.ratio).toBe(0);
        expect(readProgress("fetch:/models/isnet", Number.NaN, 10)?.ratio).toBe(0);
    });

    test("clamps a ratio past the end, so the bar cannot overrun its track", () => {
        expect(readProgress("fetch:/models/isnet", 120, 100)?.ratio).toBe(1);
        expect(readProgress("fetch:/models/isnet", -5, 100)?.ratio).toBe(0);
    });
});

describe("CUTOUT_MODELS", () => {
    test("every quality names a distinct weight set", () => {
        const models = CUTOUT_QUALITIES.map((quality) => CUTOUT_MODELS[quality].model);

        expect(new Set(models).size).toBe(CUTOUT_QUALITIES.length);
    });

    test("each tier is heavier than the one before it", () => {
        // The order the picker renders in is the order the reader reads as
        // "cheaper to slower", so a size that goes backwards would make the
        // labels lie.
        const sizes = CUTOUT_QUALITIES.map((quality) => CUTOUT_MODELS[quality].bytes);

        expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    });

    test("no size is zero or negative — these numbers are shown to the reader", () => {
        for (const quality of CUTOUT_QUALITIES) {
            expect(CUTOUT_MODELS[quality].bytes).toBeGreaterThan(0);
        }
    });

    test("the GPU runtime is the larger of the two builds", () => {
        expect(RUNTIME_WASM_BYTES.gpu).toBeGreaterThan(RUNTIME_WASM_BYTES.cpu);
    });
});

describe("firstRunBytes", () => {
    test("counts the runtime alongside the model, because the reader downloads both", () => {
        expect(firstRunBytes("balanced", RUNTIME_WASM_BYTES.gpu)).toBe(
            CUTOUT_MODELS.balanced.bytes + RUNTIME_WASM_BYTES.gpu,
        );
    });
});

describe("classifyRemovalError", () => {
    test("assets that never arrived are their own state, not a failed model", () => {
        // Two states, not one: this one is answered by trying again on a better
        // connection, and the other is not.
        expect(
            classifyRemovalError(
                "Resource metadata not found. Ensure that the config.publicPath is configured correctly.",
            ),
        ).toBe("model_unavailable");
        expect(classifyRemovalError("TypeError: Failed to fetch")).toBe("model_unavailable");
    });

    test("a session that threw is a failed removal, not an unreachable CDN", () => {
        // The real message, verbatim from the library — and the trap: it ends
        // with "Please check if the publicPath is set correctly", so a substring
        // test for `publicPath` alone reports a model that could not start as a
        // download that did not happen, which is the opposite advice.
        expect(
            classifyRemovalError(
                'Failed to create session: "Error: no available backend found. ERR: [wasm] Error". Please check if the publicPath is set correctly.',
            ),
        ).toBe("removal_failed");
    });

    test("an unrecognised throw from inside the model is a failed removal", () => {
        // What a wrong input shape actually produces: the library destructures
        // `imageTensor.shape` on something that has none.
        expect(
            classifyRemovalError("undefined is not an object (evaluating 'imageTensor.shape')"),
        ).toBe("removal_failed");
    });

    test("an unrecognised error is a failed removal rather than a download problem", () => {
        expect(classifyRemovalError("something else entirely")).toBe("removal_failed");
    });

    /**
     * Verified against something that is not us — `CLAUDE.md` rule 27.
     *
     * The classifier reads IMG.LY's own sentences, so the only thing that keeps
     * it honest is checking that the shipped bundle still contains them. A
     * version bump that reworded either message would otherwise turn every
     * "the CDN is unreachable" into "the model failed", and nothing else in this
     * repository would notice.
     */
    test("the strings it matches on are still the ones the library ships", () => {
        expect(BUNDLE).toContain("Resource metadata not found");
        expect(BUNDLE).toContain("config.publicPath");
        expect(BUNDLE).toContain("Failed to create session");
    });
});

/**
 * What the library will actually accept as an input, read off the shipped
 * bundle rather than off its type declaration.
 *
 * This exists because the declaration is wrong and cost a working feature.
 * `ImageSource` is typed `ImageData | ArrayBuffer | Uint8Array | Blob | URL |
 * string`, but `imageSourceToImageData` has no branch for `ImageData` — it
 * converts a string to a URL, fetches a URL into a blob, wraps a buffer in a
 * blob and decodes a blob, then returns whatever is left with a cast. An
 * `ImageData` therefore arrives at `runInference` as itself, which destructures
 * `.shape` off it and throws on `undefined`.
 *
 * `CLAUDE.md` rule 27, applied to a dependency's contract: the reference
 * implementation is what the bundle does, not what the `.d.ts` claims.
 */
describe("the library's real input contract", () => {
    test("decodes a Blob, which is why the segmentation input is a PNG", () => {
        expect(BUNDLE).toContain("instanceof Blob");
    });

    test("has no branch for ImageData, whatever ImageSource says", () => {
        // If a future version grows one, this fails and the extra PNG encode in
        // `toSegmentationInput` can be dropped. Until then it is load-bearing.
        expect(BUNDLE).not.toContain("instanceof ImageData");
    });

    test("still reads image/png, the format that input is encoded as", () => {
        expect(BUNDLE).toContain("image/png");
    });
});
