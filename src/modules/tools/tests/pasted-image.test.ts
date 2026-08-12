import { describe, expect, test } from "bun:test";

import {
    findPastedImage,
    pastedImageFilename,
    pickClipboardImageType,
} from "@/modules/tools/domain/pasted-image";

describe("findPastedImage", () => {
    test("finds the only picture on the clipboard", () => {
        expect(findPastedImage([{ kind: "file", type: "image/png" }])).toBe(0);
    });

    test("skips the text representations a copy from a web page brings along", () => {
        // Copying an image out of a page puts several things on the clipboard
        // at once, and the file is rarely first.
        expect(
            findPastedImage([
                { kind: "string", type: "text/plain" },
                { kind: "string", type: "text/html" },
                { kind: "file", type: "image/png" },
            ]),
        ).toBe(2);
    });

    test("ignores a string item that merely claims an image type", () => {
        expect(findPastedImage([{ kind: "string", type: "image/png" }])).toBe(-1);
    });

    test("refuses a format nothing here decodes", () => {
        expect(findPastedImage([{ kind: "file", type: "image/tiff" }])).toBe(-1);
        expect(findPastedImage([{ kind: "file", type: "image/svg+xml" }])).toBe(-1);
    });

    test("ignores a pasted non-image file", () => {
        expect(findPastedImage([{ kind: "file", type: "application/pdf" }])).toBe(-1);
    });

    test("normalises casing and parameters", () => {
        expect(findPastedImage([{ kind: "file", type: "IMAGE/JPEG; charset=binary" }])).toBe(0);
    });

    test("returns -1 for an empty clipboard", () => {
        expect(findPastedImage([])).toBe(-1);
    });
});

describe("pickClipboardImageType", () => {
    test("prefers PNG when Windows offers PNG and BMP together", () => {
        expect(pickClipboardImageType(["image/bmp", "image/png"])).toBe("image/png");
    });

    test("takes what is on offer when there is one", () => {
        expect(pickClipboardImageType(["text/plain", "image/jpeg"])).toBe("image/jpeg");
    });

    test("refuses a clipboard holding nothing decodable", () => {
        expect(pickClipboardImageType(["text/plain", "text/html"])).toBeNull();
        expect(pickClipboardImageType([])).toBeNull();
    });
});

describe("pastedImageFilename", () => {
    test("names the first paste without a number", () => {
        expect(pastedImageFilename("image/png")).toBe("pasted-image.png");
    });

    test("numbers every paste after the first", () => {
        expect(pastedImageFilename("image/png", 2)).toBe("pasted-image-2.png");
        expect(pastedImageFilename("image/jpeg", 11)).toBe("pasted-image-11.jpg");
    });

    test("leaves off an extension it cannot know", () => {
        expect(pastedImageFilename("application/pdf")).toBe("pasted-image");
    });
});
