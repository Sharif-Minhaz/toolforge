import { describe, expect, test } from "bun:test";
import { ColorManagement } from "three";
import type { BufferGeometry, Group, Mesh as ThreeMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import { DEFAULT_OPTIONS, MILLIMETRES_PER_METRE } from "@/modules/image-to-3d/domain/constants";
import { buildModelBytes, objArchiveEntries } from "@/modules/image-to-3d/domain/export";
import { buildModel } from "@/modules/image-to-3d/domain/model";
import type { Mesh, ModelTexture } from "@/modules/image-to-3d/types";

import { rampImage } from "./images";

/**
 * The four writers, read back by something that is not this repository.
 *
 * A `.glb` only this file agrees with is worth nothing: these bytes are opened
 * by Blender, by a slicer, by MeshLab, by three.js in somebody else's page. A
 * wrong chunk length, a stale accessor count, an unflipped texture coordinate —
 * every one of those still produces a file that looks exactly like the format
 * it claims to be, self-consistent and unreadable by any of them.
 *
 * So each format goes back through three.js's own loader, which was written
 * against the specification rather than against this module, and the geometry
 * that comes out is compared with the geometry that went in. `three` is a
 * dependency for the page's preview; using its loaders here costs nothing
 * extra and buys a reader that has no idea what this code intended.
 *
 * One thing the loaders cannot reach here: a GLB's embedded picture is decoded
 * through `createImageBitmap`, which Bun does not have, so `GLTFLoader` reports
 * it could not load the texture and carries on. What the texture path is
 * checked against instead is the file's own JSON chunk and the bytes the image
 * view points at — see the last test in the GLB block.
 */

// Off for the whole file. three converts sRGB to its linear working space on
// the way in, so a colour written as 9 comes back as 1 — correct rendering, and
// useless for asking whether the bytes survived the format. With it off the
// loader hands back what the file said.
ColorManagement.enabled = false;

/** A 1×1 opaque PNG — the smallest thing glTF is allowed to embed. */
const PNG_TEXTURE: ModelTexture = {
    bytes: Uint8Array.from(
        atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        ),
        (character) => character.codePointAt(0) ?? 0,
    ),
    mimeType: "image/png",
};

const OPTIONS = { ...DEFAULT_OPTIONS, resolution: 24, width: 80, depth: 6, baseThickness: 2 };

function subject(): Mesh {
    const result = buildModel(rampImage(96, 64), OPTIONS);

    if (!result.ok) {
        throw new Error(`expected a mesh, got ${result.reason}`);
    }

    return result.mesh;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.slice().buffer as ArrayBuffer;
}

/** The largest gap between our value and theirs, across a whole attribute. */
function worstDifference(ours: ArrayLike<number>, theirs: ArrayLike<number>): number {
    let worst = 0;

    for (let index = 0; index < ours.length; index += 1) {
        worst = Math.max(worst, Math.abs(ours[index] - theirs[index]));
    }

    return worst;
}

function firstGeometry(group: Group): BufferGeometry {
    let found: BufferGeometry | null = null;

    group.traverse((node) => {
        if (found === null && (node as ThreeMesh).isMesh) {
            found = (node as ThreeMesh).geometry as BufferGeometry;
        }
    });

    if (found === null) {
        throw new Error("the loader found no mesh at all");
    }

    return found;
}

describe("STL, through three's STLLoader", () => {
    const mesh = subject();
    const geometry = new STLLoader().parse(
        toArrayBuffer(buildModelBytes({ ...common(mesh), format: "stl" })),
    );

    test("has every triangle, expanded to three unshared vertices each", () => {
        expect(geometry.getAttribute("position").count).toBe(mesh.indices.length);
    });

    test("puts every vertex exactly where the mesh had it, in millimetres", () => {
        const positions = geometry.getAttribute("position").array;
        const expected = new Float32Array(mesh.indices.length * 3);

        for (let corner = 0; corner < mesh.indices.length; corner += 1) {
            const vertex = mesh.indices[corner] * 3;

            expected[corner * 3] = mesh.positions[vertex];
            expected[corner * 3 + 1] = mesh.positions[vertex + 1];
            expected[corner * 3 + 2] = mesh.positions[vertex + 2];
        }

        expect(worstDifference(expected, positions)).toBe(0);
    });

    test("is read as binary, which is what the header's first five bytes decide", () => {
        const bytes = buildModelBytes({ ...common(mesh), format: "stl" });

        expect(new TextDecoder().decode(bytes.subarray(0, 5))).not.toBe("solid");
    });
});

describe("PLY, through three's PLYLoader", () => {
    const mesh = subject();
    const geometry = new PLYLoader().parse(
        toArrayBuffer(buildModelBytes({ ...common(mesh), format: "ply" })),
    );

    test("keeps the index buffer, the vertex count and the triangle count", () => {
        expect(geometry.getAttribute("position").count).toBe(mesh.positions.length / 3);
        expect(geometry.getIndex()?.count).toBe(mesh.indices.length);
    });

    test("round-trips positions and normals to the last float", () => {
        expect(worstDifference(mesh.positions, geometry.getAttribute("position").array)).toBe(0);
        expect(worstDifference(mesh.normals, geometry.getAttribute("normal").array)).toBe(0);
    });

    test("carries the picture as per-vertex colour, with no second file", () => {
        const colors = geometry.getAttribute("color");

        expect(colors.count).toBe(mesh.positions.length / 3);

        expect(worstDifference(mesh.colors, colors.array)).toBe(0);
    });
});

describe("OBJ, through three's OBJLoader", () => {
    const mesh = subject();
    const entries = objArchiveEntries({ ...common(mesh), format: "obj" });
    const text = new TextDecoder().decode(entries[0].bytes);
    const geometry = firstGeometry(new OBJLoader().parse(text));

    test("names the material file the archive actually contains", () => {
        const names = entries.map((entry) => entry.name);

        expect(text).toContain(`mtllib ${names[1]}`);
        expect(names).toEqual(["model.obj", "model.mtl", "texture.png"]);

        const mtl = new TextDecoder().decode(entries[1].bytes);

        expect(mtl).toContain(`map_Kd ${names[2]}`);
    });

    test("comes back with the same geometry, one vertex per face corner", () => {
        expect(geometry.getAttribute("position").count).toBe(mesh.indices.length);

        const positions = geometry.getAttribute("position").array;

        for (let corner = 0; corner < mesh.indices.length; corner += 1) {
            const vertex = mesh.indices[corner] * 3;

            for (let axis = 0; axis < 3; axis += 1) {
                expect(positions[corner * 3 + axis]).toBeCloseTo(mesh.positions[vertex + axis], 4);
            }
        }
    });

    test("flips v back to where a canvas would have put it", () => {
        const uvs = geometry.getAttribute("uv").array;

        for (let corner = 0; corner < mesh.indices.length; corner += 1) {
            const vertex = mesh.indices[corner] * 2;

            expect(uvs[corner * 2]).toBeCloseTo(mesh.uvs[vertex], 5);
            // OBJ counts v up from the bottom of the picture and this module
            // counts it down from the top, so what comes back is 1 − ours.
            expect(uvs[corner * 2 + 1]).toBeCloseTo(1 - mesh.uvs[vertex + 1], 5);
        }
    });
});

describe("GLB, through three's GLTFLoader", () => {
    const mesh = subject();

    async function load(texture: ModelTexture | null) {
        const bytes = buildModelBytes({ ...common(mesh), texture, format: "glb" });
        const loader = new GLTFLoader();

        return new Promise<Group>((resolve, reject) => {
            loader.parse(toArrayBuffer(bytes), "", (gltf) => resolve(gltf.scene), reject);
        });
    }

    test("parses, and arrives in metres rather than millimetres", async () => {
        const geometry = firstGeometry(await load(null));
        const positions = geometry.getAttribute("position").array;
        const expected = Float32Array.from(mesh.positions, (mm) => mm / MILLIMETRES_PER_METRE);

        expect(geometry.getAttribute("position").count).toBe(mesh.positions.length / 3);
        expect(geometry.getIndex()?.count).toBe(mesh.indices.length);
        expect(worstDifference(expected, positions)).toBeLessThan(1e-9);
    });

    test("keeps normals and texture coordinates intact", async () => {
        const geometry = firstGeometry(await load(null));

        expect(worstDifference(mesh.normals, geometry.getAttribute("normal").array)).toBe(0);
        expect(worstDifference(mesh.uvs, geometry.getAttribute("uv").array)).toBe(0);
    });

    test("falls back to per-vertex colour when there is no picture to embed", async () => {
        const geometry = firstGeometry(await load(null));

        expect(geometry.getAttribute("color")).toBeDefined();
        expect(geometry.getAttribute("color").count).toBe(mesh.positions.length / 3);
    });

    test("drops COLOR_0 when there is a texture, rather than shipping both", async () => {
        const geometry = firstGeometry(await load(PNG_TEXTURE));

        // glTF multiplies the two, so a model carrying a picture *and* the same
        // picture as vertex colour comes out darkened by itself.
        expect(geometry.getAttribute("color")).toBeUndefined();
    });

    test("embeds the picture byte for byte, where the JSON chunk says it is", () => {
        const bytes = buildModelBytes({ ...common(mesh), texture: PNG_TEXTURE, format: "glb" });
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        expect(view.getUint32(0, true)).toBe(0x46546c67);
        expect(view.getUint32(4, true)).toBe(2);
        expect(view.getUint32(8, true)).toBe(bytes.byteLength);

        const jsonLength = view.getUint32(12, true);
        const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));

        expect(gltf.images).toEqual([{ bufferView: 4, mimeType: "image/png" }]);
        expect(gltf.materials[0].pbrMetallicRoughness.baseColorTexture).toEqual({ index: 0 });

        const binStart = 20 + jsonLength + 8;
        const image = gltf.bufferViews[4];
        const embedded = bytes.subarray(
            binStart + image.byteOffset,
            binStart + image.byteOffset + image.byteLength,
        );

        expect([...embedded]).toEqual([...PNG_TEXTURE.bytes]);
    });

    test("aligns every chunk and every buffer view to four bytes", () => {
        const bytes = buildModelBytes({ ...common(mesh), texture: PNG_TEXTURE, format: "glb" });
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const jsonLength = view.getUint32(12, true);
        const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));

        expect(jsonLength % 4).toBe(0);
        expect(view.getUint32(20 + jsonLength, true) % 4).toBe(0);

        for (const bufferView of gltf.bufferViews) {
            expect(bufferView.byteOffset % 4).toBe(0);
        }
    });
});

/** The parts of an export input that are the same whatever the format. */
function common(mesh: Mesh) {
    return {
        mesh,
        texture: PNG_TEXTURE,
        stem: "reference",
        generatedAt: new Date("2026-09-06T00:00:00Z"),
    };
}
