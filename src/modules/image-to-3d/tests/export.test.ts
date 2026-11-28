import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";

import { buildObjectMesh } from "@/modules/image-to-3d/domain/assemble";
import { buildModelBytes, buildModelDownload } from "@/modules/image-to-3d/domain/export";
import { filePartNames } from "@/modules/image-to-3d/domain/filenames";
import { encodePly } from "@/modules/image-to-3d/domain/ply";
import { estimateBytes } from "@/modules/image-to-3d/domain/stats";
import { MODEL_FORMATS, type ModelFormat } from "@/modules/image-to-3d/types";

import { MUG } from "./specs";

const built = buildObjectMesh(MUG, "medium");

if (built === null) {
    throw new Error("the fixture built nothing");
}

const { mesh, stats } = built;

function input(format: ModelFormat) {
    return {
        mesh,
        format,
        name: MUG.name,
        stem: "mug",
        generatedAt: new Date("2026-11-28T10:15:00Z"),
    };
}

describe("buildModelDownload", () => {
    test("names the file after the picture, with the extension the format needs", () => {
        expect(buildModelDownload(input("glb")).filename).toBe("mug.glb");
        expect(buildModelDownload(input("stl")).filename).toBe("mug.stl");
        expect(buildModelDownload(input("ply")).filename).toBe("mug.ply");
        // Two files that only mean anything together travel as one.
        expect(buildModelDownload(input("obj")).filename).toBe("mug.zip");
    });

    test("declares a type a browser will not rename the file over", () => {
        expect(buildModelDownload(input("glb")).blob.type).toBe("model/gltf-binary");
        expect(buildModelDownload(input("obj")).blob.type).toBe("application/zip");
    });
});

describe("the OBJ archive", () => {
    test("holds the model and the material library it names", () => {
        const zip = unzipSync(buildModelBytes(input("obj")));

        expect(Object.keys(zip).toSorted()).toEqual(["model.mtl", "model.obj"]);
    });
});

describe("filePartNames", () => {
    test("gives every part a name no reader will have to rename", () => {
        const group = mesh.groups[0];
        const names = filePartNames([
            { ...group, name: "leg" },
            { ...group, name: "leg" },
            { ...group, name: "leg", mirrored: true },
            { ...group, name: "leg", mirrored: true },
        ]);

        expect(names).toEqual(["leg", "leg 2", "leg mirrored", "leg mirrored 2"]);
    });
});

describe("estimateBytes", () => {
    test("lands within a factor of two of every format it describes", () => {
        // The line under the format picker is an order of magnitude, not a
        // promise — but a reader told 2 MB who receives 40 would be right to
        // call that a lie rather than an estimate.
        for (const format of MODEL_FORMATS) {
            const actual = buildModelBytes(input(format)).byteLength;
            const guess = estimateBytes(stats, format);

            expect(guess).toBeGreaterThan(actual / 2);
            expect(guess).toBeLessThan(actual * 2);
        }
    });
});

describe("binary STL", () => {
    test("is exactly 84 bytes plus fifty per triangle, which is how it is read", () => {
        expect(buildModelBytes(input("stl")).byteLength).toBe(84 + stats.triangles * 50);
    });

    test("says how many triangles follow, in the one place a reader looks", () => {
        const bytes = buildModelBytes(input("stl"));
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        expect(view.getUint32(80, true)).toBe(stats.triangles);
    });
});

describe("binary PLY", () => {
    test("keeps its header on one side of the bytes and never inside them", () => {
        const bytes = buildModelBytes(input("ply"));
        const text = new TextDecoder().decode(bytes.subarray(0, 400));
        const header = text.slice(0, text.indexOf("end_header\n") + "end_header\n".length);

        expect(header.startsWith("ply\nformat binary_little_endian 1.0\n")).toBe(true);
        expect(header).toContain(`element vertex ${stats.vertices}`);
        expect(header).toContain(`element face ${stats.triangles}`);
    });

    test("refuses to let a comment end the header early", () => {
        // A newline inside provenance would close the header, and everything
        // after it would be read as vertex data by a parser that is behaving
        // exactly as the format says it should.
        const bytes = encodePly(mesh, "Tool\nForge\r\nmodel");
        const text = new TextDecoder().decode(bytes.subarray(0, 300));
        const header = text.slice(0, text.indexOf("end_header"));

        expect(header).toContain("comment Tool Forge model");
        expect(header.split("\n").filter((line) => line.startsWith("comment")).length).toBe(1);
    });
});
