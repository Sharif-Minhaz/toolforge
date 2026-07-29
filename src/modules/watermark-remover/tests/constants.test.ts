import { describe, expect, test } from "bun:test";

import {
    ALLOWED_IMAGE_TYPES,
    DEFAULT_BRUSH_SIZE,
    IMAGE_ACCEPT_ATTRIBUTE,
    IMAGE_FILE_LIMITS,
    MASK_FILE_LIMITS,
    MAX_BRUSH_SIZE,
    MAX_IMAGE_BYTES,
    MIN_BRUSH_SIZE,
    MIN_REGION_SIDE,
    MODEL_CANVAS_SIZE,
} from "@/modules/watermark-remover/domain/constants";

describe("upload limits", () => {
    test("the picker hint lists exactly the allowed types, so it and the check agree", () => {
        expect(IMAGE_ACCEPT_ATTRIBUTE.split(",")).toEqual([...ALLOWED_IMAGE_TYPES]);
    });

    test("the shared file check is handed the same pair the tool documents", () => {
        expect(IMAGE_FILE_LIMITS.allowedTypes).toEqual([...ALLOWED_IMAGE_TYPES]);
        expect(IMAGE_FILE_LIMITS.maxBytes).toBe(MAX_IMAGE_BYTES);
    });

    test("turns away an animated format the model could only return as a still", () => {
        expect(ALLOWED_IMAGE_TYPES).not.toContain("image/gif");
    });

    test("accepts only PNG for the mask this tool generates itself", () => {
        expect(MASK_FILE_LIMITS.allowedTypes).toEqual(["image/png"]);
    });
});

describe("model geometry", () => {
    test("the crop is smaller than the canvas it is scaled into, so detail is gained not lost", () => {
        expect(MIN_REGION_SIDE).toBeLessThan(MODEL_CANVAS_SIZE);
    });

    test("keeps the model canvas at the size the worker declares to the model", () => {
        expect(MODEL_CANVAS_SIZE).toBe(512);
    });
});

describe("brush range", () => {
    test("the default sits inside the range the slider offers", () => {
        expect(DEFAULT_BRUSH_SIZE).toBeGreaterThanOrEqual(MIN_BRUSH_SIZE);
        expect(DEFAULT_BRUSH_SIZE).toBeLessThanOrEqual(MAX_BRUSH_SIZE);
    });
});
