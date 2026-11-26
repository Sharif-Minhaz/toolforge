import { describe, expect, test } from "bun:test";

import {
    buildVideoConstraints,
    describeAspect,
    judgeDelivery,
    readCapabilities,
    readVideoSettings,
} from "../domain/video";
import { webcamTesterSearchParamsSchema } from "../validation/search-params";

describe("describeAspect", () => {
    test.each([
        [1280, 720, "16:9", false],
        [640, 480, "4:3", false],
        [1920, 1200, "16:10", false],
        [1280, 1024, "5:4", false],
        [1080, 1080, "1:1", false],
        [720, 1280, "9:16", false],
        [352, 288, "11:9", false],
        [1366, 768, "16:9", true],
        [2560, 1080, "21:9", true],
        [3440, 1440, "21:9", true],
        [1000, 301, "3.32:1", true],
    ])("%i × %i reads %s", (width, height, label, approximate) => {
        expect(describeAspect({ width, height })).toEqual({
            label,
            value: width / height,
            approximate,
        });
    });

    test("refuses a size that is not a frame", () => {
        expect(describeAspect({ width: 0, height: 720 })).toBeNull();
        expect(describeAspect({ width: 1280.5, height: 720 })).toBeNull();
    });
});

describe("readVideoSettings", () => {
    test("reads what the track delivers", () => {
        expect(readVideoSettings({ width: 1280, height: 720, frameRate: 30 })).toEqual({
            size: { width: 1280, height: 720 },
            frameRate: 30,
            aspect: { label: "16:9", value: 1280 / 720, approximate: false },
        });
    });

    test("leaves out what the browser does not report", () => {
        expect(readVideoSettings({ width: 1280 })).toEqual({
            size: null,
            frameRate: null,
            aspect: null,
        });
        expect(readVideoSettings({ width: 640, height: 480, frameRate: 0 }).frameRate).toBeNull();
    });
});

describe("buildVideoConstraints", () => {
    test("asks for a preset as an ideal, never an exact size", () => {
        expect(buildVideoConstraints("full-hd", null)).toEqual({
            width: { ideal: 1920 },
            height: { ideal: 1080 },
        });
    });

    test("asks for more than any webcam has when the largest is wanted", () => {
        expect(buildVideoConstraints("max", "cam-1")).toEqual({
            deviceId: { exact: "cam-1" },
            width: { ideal: 7680 },
            height: { ideal: 4320 },
        });
    });
});

describe("judgeDelivery", () => {
    test("calls the largest mode what it is", () => {
        expect(judgeDelivery("max", { width: 1280, height: 720 })).toBe("largest");
    });

    test("matches the asked size, in either orientation", () => {
        expect(judgeDelivery("hd", { width: 1280, height: 720 })).toBe("matched");
        expect(judgeDelivery("hd", { width: 720, height: 1280 })).toBe("matched");
    });

    test("tells a smaller answer from a different one", () => {
        expect(judgeDelivery("full-hd", { width: 1280, height: 720 })).toBe("smaller");
        expect(judgeDelivery("vga", { width: 640, height: 360 })).toBe("smaller");
        expect(judgeDelivery("vga", { width: 1280, height: 720 })).toBe("different");
    });
});

describe("readCapabilities", () => {
    test("keeps ranges and lists in a fixed order and drops the rest", () => {
        const chrome = {
            aspectRatio: { min: 0.0005, max: 1920 },
            deviceId: "cam-1",
            facingMode: [],
            frameRate: { min: 1, max: 30 },
            height: { min: 1, max: 1080 },
            resizeMode: ["none", "crop-and-scale"],
            width: { min: 1, max: 1920 },
        };

        expect(readCapabilities(chrome)).toEqual([
            { kind: "range", key: "width", min: 1, max: 1920 },
            { kind: "range", key: "height", min: 1, max: 1080 },
            { kind: "range", key: "frameRate", min: 1, max: 30 },
            { kind: "list", key: "resizeMode", values: ["none", "crop-and-scale"] },
        ]);
    });

    test("ignores malformed entries", () => {
        expect(
            readCapabilities({
                width: { min: 10, max: 1 },
                height: { min: "1", max: 1080 },
                zoom: { min: 1, max: Number.POSITIVE_INFINITY },
                facingMode: ["user", 3],
            }),
        ).toEqual([]);
    });
});

describe("webcamTesterSearchParamsSchema", () => {
    test("reads a shared link", () => {
        expect(webcamTesterSearchParamsSchema.parse({ resolution: "hd", mirror: "off" })).toEqual({
            resolution: "hd",
            mirror: "off",
        });
    });

    test("drops each bad field on its own", () => {
        expect(
            webcamTesterSearchParamsSchema.parse({ resolution: "8k", mirror: ["on", "off"] }),
        ).toEqual({ resolution: undefined, mirror: undefined });
    });
});
