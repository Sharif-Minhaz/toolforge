import { describe, expect, test } from "bun:test";

import { deviceConstraint, listInputDevices } from "../domain/media-devices";

describe("listInputDevices", () => {
    const infos = [
        { deviceId: "mic-1", kind: "audioinput", label: "Built-in Microphone" },
        { deviceId: "cam-1", kind: "videoinput", label: "FaceTime HD Camera" },
        { deviceId: "cam-2", kind: "videoinput", label: "  " },
        { deviceId: "out-1", kind: "audiooutput", label: "Speakers" },
    ];

    test("keeps one kind, numbered among its own", () => {
        expect(listInputDevices(infos, "video")).toEqual([
            { id: "cam-1", label: "FaceTime HD Camera", position: 1 },
            { id: "cam-2", label: null, position: 2 },
        ]);
        expect(listInputDevices(infos, "audio")).toEqual([
            { id: "mic-1", label: "Built-in Microphone", position: 1 },
        ]);
    });

    test("drops the placeholder a browser lists before access is allowed", () => {
        const before = [
            { deviceId: "", kind: "videoinput", label: "" },
            { deviceId: "", kind: "audioinput", label: "" },
        ];

        expect(listInputDevices(before, "video")).toEqual([]);
    });
});

describe("deviceConstraint", () => {
    test("pins a chosen device exactly", () => {
        expect(deviceConstraint("cam-2")).toEqual({ deviceId: { exact: "cam-2" } });
    });

    test("leaves the default to the system", () => {
        expect(deviceConstraint(null)).toEqual({});
    });
});
