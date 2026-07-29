import { describe, expect, test } from "bun:test";

import {
    ALLOWED_IMAGE_TYPES,
    IMAGE_ACCEPT_ATTRIBUTE,
    IMAGE_FILE_LIMITS,
    MAX_IMAGE_BYTES,
} from "@/modules/ai-image-detector/domain/constants";

describe("detector upload limits", () => {
    test("the picker hint lists exactly the allowed types, so it and the check agree", () => {
        expect(IMAGE_ACCEPT_ATTRIBUTE.split(",")).toEqual([...ALLOWED_IMAGE_TYPES]);
    });

    test("the shared file check is handed the same pair the tool documents", () => {
        expect(IMAGE_FILE_LIMITS.allowedTypes).toEqual([...ALLOWED_IMAGE_TYPES]);
        expect(IMAGE_FILE_LIMITS.maxBytes).toBe(MAX_IMAGE_BYTES);
    });
});
