import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
    classifyDepthError,
    DEPTH_INPUT_EDGE,
    DEPTH_MODEL_BYTES,
    DEPTH_MODEL_URL,
    DEPTH_PATCH,
    DEPTH_RUNTIME_BASE,
    DEPTH_RUNTIME_VERSION,
    depthInputSize,
    normalizeDepth,
    packDepthInput,
} from "@/modules/image-to-3d/domain/depth";
import { buildHeightfield, heightsFromDepth } from "@/modules/image-to-3d/domain/heightfield";

import { makeImage, solidImage } from "./images";

/**
 * The pure half of the depth estimator. The runtime half needs WebAssembly the
 * runtime fetches for itself and is the one part of this module `bun test`
 * cannot reach — which is why the constants that tie it to the installed
 * package are checked here instead.
 */

describe("the runtime pin", () => {
    test("names the version that is actually installed", () => {
        // The runtime's WebAssembly is fetched from a CDN by version. The
        // JavaScript that talks to it is bundled from node_modules. If the two
        // disagree they disagree about an ABI, at runtime, on the reader's
        // machine — so this is the test that fails at upgrade time instead.
        const installed = JSON.parse(
            readFileSync("node_modules/onnxruntime-web/package.json", "utf8"),
        );

        expect(DEPTH_RUNTIME_VERSION).toBe(installed.version);
        expect(DEPTH_RUNTIME_BASE).toContain(`onnxruntime-web@${installed.version}/`);
    });

    test("points at a quantised small model of a plausible size", () => {
        expect(DEPTH_MODEL_URL).toContain("depth-anything-v2-small");
        expect(DEPTH_MODEL_URL.endsWith(".onnx")).toBe(true);
        expect(DEPTH_MODEL_BYTES).toBeGreaterThan(20_000_000);
        expect(DEPTH_MODEL_BYTES).toBeLessThan(40_000_000);
    });
});

describe("depthInputSize", () => {
    test("puts the longest edge at the model's size, in patches", () => {
        const size = depthInputSize({ width: 1600, height: 900 });

        expect(size.width).toBe(DEPTH_INPUT_EDGE);
        expect(size.width % DEPTH_PATCH).toBe(0);
        expect(size.height % DEPTH_PATCH).toBe(0);
        // 900 × 518 / 1600 ≈ 291, and the nearest multiple of 14 is 294.
        expect(size.height).toBe(294);
    });

    test("keeps a portrait a portrait", () => {
        const size = depthInputSize({ width: 900, height: 1600 });

        expect(size.height).toBe(DEPTH_INPUT_EDGE);
        expect(size.width).toBeLessThan(size.height);
    });

    test("never asks for a tensor thinner than one patch", () => {
        expect(depthInputSize({ width: 4000, height: 1 }).height).toBe(DEPTH_PATCH);
        expect(depthInputSize({ width: 0, height: 0 }).width).toBe(DEPTH_PATCH);
    });
});

describe("packDepthInput", () => {
    test("is planar, and standardised by the ImageNet numbers", () => {
        const image = makeImage(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 255, 0]));
        const tensor = packDepthInput(image);

        // Red plane, then green, then blue — two values each.
        expect(tensor.length).toBe(6);
        expect(tensor[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
        expect(tensor[1]).toBeCloseTo((0 - 0.485) / 0.229, 5);
        expect(tensor[4]).toBeCloseTo((0 - 0.406) / 0.225, 5);
        expect(tensor[5]).toBeCloseTo((1 - 0.406) / 0.225, 5);
    });

    test("ignores alpha, which the model has never seen", () => {
        const opaque = packDepthInput(solidImage(3, 3, [10, 20, 30, 255]));
        const clear = packDepthInput(solidImage(3, 3, [10, 20, 30, 0]));

        expect([...clear]).toEqual([...opaque]);
    });
});

describe("normalizeDepth", () => {
    test("pins the nearest point at one and the farthest at zero", () => {
        const map = normalizeDepth([3.1, 7.4, 11.4, 5.0], { width: 2, height: 2 });

        expect(map.values[2]).toBe(1);
        expect(map.values[0]).toBe(0);
        expect(map.values[1]).toBeCloseTo((7.4 - 3.1) / (11.4 - 3.1), 5);
    });

    test("turns a flat output into zeros rather than dividing by nothing", () => {
        const map = normalizeDepth([2, 2, 2, 2], { width: 2, height: 2 });

        expect([...map.values]).toEqual([0, 0, 0, 0]);
    });

    test("reads a typed array the runtime hands back, not only a plain one", () => {
        const map = normalizeDepth(Float32Array.from([0, 1]), { width: 2, height: 1 });

        expect([...map.values]).toEqual([0, 1]);
    });
});

describe("classifyDepthError", () => {
    test("tells a download that never arrived from a runtime that refused", () => {
        expect(classifyDepthError("TypeError: Failed to fetch")).toBe("depth_unavailable");
        expect(classifyDepthError("could not download the depth model (503)")).toBe(
            "depth_unavailable",
        );
        expect(classifyDepthError("no available backend found")).toBe("depth_failed");
    });
});

describe("heightsFromDepth", () => {
    const depth = {
        width: 4,
        height: 2,
        values: Float32Array.from([0, 0.25, 0.5, 1, 0, 0.25, 0.5, 1]),
    };

    test("lands the map on the grid with the picture's own edge-centred windows", () => {
        // Same windows as the pixels use, which are centred on the samples and
        // half as wide at the ends — so this is a box average that keeps the
        // ramp's order and its ends, not a copy.
        const heights = heightsFromDepth(depth, { width: 4, height: 2 }, false);

        for (let column = 1; column < 4; column += 1) {
            expect(heights[column]).toBeGreaterThan(heights[column - 1]);
        }

        expect(heights[0]).toBeLessThan(0.2);
        expect(heights[3]).toBeGreaterThan(0.7);
    });

    test("inverts to the exact complement", () => {
        const plain = heightsFromDepth(depth, { width: 4, height: 2 }, false);
        const inverted = heightsFromDepth(depth, { width: 4, height: 2 }, true);

        for (let index = 0; index < plain.length; index += 1) {
            expect(plain[index] + inverted[index]).toBeCloseTo(1, 6);
        }
    });
});

describe("buildHeightfield with a depth map", () => {
    const image = makeImage(64, 32, (x) => {
        // Bright on the left, dark on the right — the opposite of the depth.
        const value = Math.round(255 * (1 - x / 63));

        return [value, value, value, 255];
    });
    const depth = {
        width: 64,
        height: 32,
        values: Float32Array.from({ length: 64 * 32 }, (_, index) => (index % 64) / 63),
    };

    test("reads the depth map, not the brightness, when asked for depth", () => {
        const field = buildHeightfield(
            image,
            { resolution: 32, source: "depth", invert: false, smoothing: 0 },
            depth,
        );

        // Rising left to right, as the depth does — brightness falls that way.
        expect(field.heights[field.columns - 1]).toBeGreaterThan(field.heights[0]);
    });

    test("falls back to brightness when depth was asked for and is not there", () => {
        const withDepth = buildHeightfield(image, {
            resolution: 32,
            source: "luminance",
            invert: false,
            smoothing: 0,
        });
        const without = buildHeightfield(
            image,
            { resolution: 32, source: "depth", invert: false, smoothing: 0 },
            null,
        );

        expect([...without.heights]).toEqual([...withDepth.heights]);
    });
});
