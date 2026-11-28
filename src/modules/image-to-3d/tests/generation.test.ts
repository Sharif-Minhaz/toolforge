import { describe, expect, test } from "bun:test";

import { MAX_UPLOAD_BYTES, UPLOAD_EDGE } from "@/modules/image-to-3d/domain/constants";
import {
    checkUploadImage,
    classifyWorkerFailure,
    uploadSize,
} from "@/modules/image-to-3d/domain/generation";

describe("checkUploadImage", () => {
    test("takes the three types the worker reads, up to the ceiling", () => {
        for (const type of ["image/jpeg", "image/png", "image/webp"]) {
            expect(checkUploadImage({ type, size: 1000 }).ok).toBe(true);
        }

        expect(checkUploadImage({ type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 })).toEqual({
            ok: false,
            reason: "too_large",
        });
        expect(checkUploadImage({ type: "image/gif", size: 1000 })).toEqual({
            ok: false,
            reason: "unsupported_type",
        });
        expect(checkUploadImage({ type: "", size: 0 })).toEqual({
            ok: false,
            reason: "empty_file",
        });
    });
});

describe("uploadSize", () => {
    test("brings the longest edge down to the upload edge and keeps the shape", () => {
        expect(uploadSize(4000, 3000)).toEqual({ width: UPLOAD_EDGE, height: 576 });
        expect(uploadSize(1000, 3000)).toEqual({ width: 256, height: UPLOAD_EDGE });
    });

    test("never enlarges a small picture, and never makes a zero-pixel edge", () => {
        expect(uploadSize(300, 200)).toEqual({ width: 300, height: 200 });
        expect(uploadSize(10_000, 1)).toEqual({ width: UPLOAD_EDGE, height: 1 });
    });
});

describe("classifyWorkerFailure", () => {
    test("names a spent day from the runtime's own words, whatever code came with it", () => {
        // Workers AI's exact sentence, as the watermark worker logged it.
        const detail =
            "AiError: 4006: you have used up your daily free allocation of 10,000 neurons";

        expect(classifyWorkerFailure(502, "MODEL_ERROR", detail)).toBe("allowance_spent");
        expect(classifyWorkerFailure(429, "QUOTA_EXHAUSTED", "")).toBe("allowance_spent");
    });

    test("names a retired model, which no retry can fix", () => {
        expect(
            classifyWorkerFailure(502, "MODEL_ERROR", "AiError 5028: model was deprecated"),
        ).toBe("model_retired");
    });

    test("reads the worker's code before the status", () => {
        expect(classifyWorkerFailure(401, "UNAUTHORIZED", "")).toBe("unauthorized");
        expect(classifyWorkerFailure(413, "IMAGE_TOO_LARGE", "")).toBe("too_large");
        expect(classifyWorkerFailure(400, "INVALID_INPUT", "")).toBe("invalid_request");
    });

    test("falls back on the status for a code it has never heard of", () => {
        expect(classifyWorkerFailure(403, "SOMETHING_NEW", "")).toBe("unauthorized");
        expect(classifyWorkerFailure(400, null, "")).toBe("invalid_request");
        expect(classifyWorkerFailure(503, null, "")).toBe("upstream_unavailable");
    });
});
