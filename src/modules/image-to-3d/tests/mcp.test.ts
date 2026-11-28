import { describe, expect, test } from "bun:test";

import { imageTo3dBuildTool } from "@/modules/mcp/tools/image-to-3d";
import { base64ToBytes } from "@/modules/tools/domain/base64";

const MUG_PARTS = [
    {
        name: "mug body",
        shape: "cylinder",
        size: [8, 12, 8],
        position: [0, 6, 0],
        color: "#8b1a1a",
    },
    {
        name: "mug handle",
        shape: "torus",
        axis: "z",
        size: [3, 7, 2.5],
        position: [4, 6, 0],
        color: "#8b1a1a",
    },
];

describe("toolforge_image_to_3d_build", () => {
    test("builds the description a caller wrote into a GLB it can open", async () => {
        const outcome = await imageTo3dBuildTool.run({ name: "red mug", parts: MUG_PARTS });

        expect(outcome.ok).toBe(true);

        if (!outcome.ok) {
            return;
        }

        const data = outcome.data as { base64: string; parts: string[]; heightMm: number };
        const bytes = base64ToBytes(data.base64);

        // `glTF` magic: the file is a GLB, not a refusal wearing base64.
        expect(new TextDecoder().decode(bytes?.subarray(0, 4))).toBe("glTF");
        expect(data.parts).toEqual(["mug body", "mug handle"]);
        expect(data.heightMm).toBe(120);
    });

    test("scales to the height asked for", async () => {
        const outcome = await imageTo3dBuildTool.run({
            parts: MUG_PARTS,
            height: 60,
            format: "stl",
        });

        expect(outcome.ok && (outcome.data as { heightMm: number }).heightMm).toBe(60);
    });

    test("refuses, by name, a description with nothing buildable in it", async () => {
        const outcome = await imageTo3dBuildTool.run({
            parts: [{ name: "x", shape: "teapot", size: [1, 1, 1], position: [0, 0, 0] }],
        });

        expect(outcome.ok).toBe(false);
    });
});
