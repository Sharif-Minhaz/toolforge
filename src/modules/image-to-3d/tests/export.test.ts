import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";

import { DEFAULT_OPTIONS } from "@/modules/image-to-3d/domain/constants";
import { buildModelBytes, buildModelDownload } from "@/modules/image-to-3d/domain/export";
import { buildModel } from "@/modules/image-to-3d/domain/model";
import { encodePly } from "@/modules/image-to-3d/domain/ply";
import { estimateBytes } from "@/modules/image-to-3d/domain/stats";
import type { Mesh, ModelTexture } from "@/modules/image-to-3d/types";
import { MODEL_FORMATS } from "@/modules/image-to-3d/types";

import { rampImage } from "./images";

const TEXTURE: ModelTexture = { bytes: Uint8Array.from([1, 2, 3, 4, 5]), mimeType: "image/jpeg" };

function subject(): { mesh: Mesh; triangles: number } {
    const result = buildModel(rampImage(96, 64), { ...DEFAULT_OPTIONS, resolution: 24 });

    if (!result.ok) {
        throw new Error(result.reason);
    }

    return { mesh: result.mesh, triangles: result.stats.triangles };
}

const { mesh, triangles } = subject();

function input(format: (typeof MODEL_FORMATS)[number], texture: ModelTexture | null = TEXTURE) {
    return { mesh, format, texture, stem: "sunset", generatedAt: new Date("2026-09-06T10:15:00Z") };
}

describe("buildModelDownload", () => {
    test("names the file after the picture, with the extension the format needs", () => {
        expect(buildModelDownload(input("glb")).filename).toBe("sunset.glb");
        expect(buildModelDownload(input("stl")).filename).toBe("sunset.stl");
        expect(buildModelDownload(input("ply")).filename).toBe("sunset.ply");
        // Three files that only mean anything together travel as one.
        expect(buildModelDownload(input("obj")).filename).toBe("sunset.zip");
    });

    test("declares a type a browser will not rename the file over", () => {
        expect(buildModelDownload(input("glb")).blob.type).toBe("model/gltf-binary");
        expect(buildModelDownload(input("obj")).blob.type).toBe("application/zip");
    });

    test("produces bytes for every format, with and without a picture", () => {
        for (const format of MODEL_FORMATS) {
            for (const texture of [TEXTURE, null]) {
                expect(buildModelBytes(input(format, texture)).byteLength).toBeGreaterThan(0);
            }
        }
    });
});

describe("the OBJ archive", () => {
    test("holds the three files, and the JPEG keeps its own extension", () => {
        const zip = unzipSync(buildModelBytes(input("obj")));

        expect(Object.keys(zip).toSorted()).toEqual(["model.mtl", "model.obj", "texture.jpg"]);
        expect([...zip["texture.jpg"]]).toEqual([...TEXTURE.bytes]);
    });

    test("ships the mesh alone rather than a material pointing at nothing", () => {
        const zip = unzipSync(buildModelBytes(input("obj", null)));

        expect(Object.keys(zip)).toEqual(["model.obj"]);
    });
});

describe("estimateBytes", () => {
    test("lands within a factor of two of every format it describes", () => {
        // The line under the format picker is an order of magnitude, not a
        // promise — but a reader told 2 MB who receives 40 would be right to
        // call that a lie rather than an estimate.
        for (const format of MODEL_FORMATS) {
            const actual = buildModelBytes(input(format, null)).byteLength;
            const guess = estimateBytes({ vertices: mesh.positions.length / 3, triangles }, format);

            expect(guess).toBeGreaterThan(actual / 2);
            expect(guess).toBeLessThan(actual * 2);
        }
    });
});

describe("binary STL", () => {
    test("is exactly 84 bytes plus fifty per triangle, which is how it is read", () => {
        expect(buildModelBytes(input("stl")).byteLength).toBe(84 + triangles * 50);
    });

    test("says how many triangles follow, in the one place a reader looks", () => {
        const bytes = buildModelBytes(input("stl"));
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        expect(view.getUint32(80, true)).toBe(triangles);
    });
});

describe("binary PLY", () => {
    test("keeps its header on one side of the bytes and never inside them", () => {
        const bytes = buildModelBytes(input("ply"));
        const text = new TextDecoder().decode(bytes.subarray(0, 400));
        const header = text.slice(0, text.indexOf("end_header\n") + "end_header\n".length);

        expect(header.startsWith("ply\nformat binary_little_endian 1.0\n")).toBe(true);
        expect(header).toContain(`element vertex ${mesh.positions.length / 3}`);
        expect(header).toContain(`element face ${triangles}`);
    });

    test("refuses to let a comment end the header early", () => {
        // A newline inside provenance would close the header, and everything
        // after it would be read as vertex data by a parser that is behaving
        // exactly as the format says it should.
        const bytes = encodePly(mesh, "Tool\nForge\r\nrelief");
        const text = new TextDecoder().decode(bytes.subarray(0, 300));
        const header = text.slice(0, text.indexOf("end_header"));

        expect(header).toContain("comment Tool Forge relief");
        expect(header.split("\n").filter((line) => line.startsWith("comment")).length).toBe(1);
    });
});
