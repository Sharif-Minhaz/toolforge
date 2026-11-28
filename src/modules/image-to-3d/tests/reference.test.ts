import { describe, expect, test } from "bun:test";
import { ColorManagement, PropertyBinding } from "three";
import type { BufferGeometry, Group, MeshStandardMaterial, Mesh as ThreeMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import { buildObjectMesh } from "@/modules/image-to-3d/domain/assemble";
import { MILLIMETRES_PER_METRE } from "@/modules/image-to-3d/domain/constants";
import { buildModelBytes, objArchiveEntries } from "@/modules/image-to-3d/domain/export";
import { srgbToLinear } from "@/modules/image-to-3d/domain/glb";
import { filePartNames } from "@/modules/image-to-3d/domain/filenames";
import { objToken } from "@/modules/image-to-3d/domain/obj";
import type { Mesh, ModelFormat } from "@/modules/image-to-3d/types";

import { MUG } from "./specs";

/**
 * The four writers, read back by something that is not this repository.
 *
 * A `.glb` only this file agrees with is worth nothing: these bytes are opened
 * by Blender, by a slicer, by MeshLab, by three.js in somebody else's page. A
 * wrong chunk length, a stale accessor count, an index not rebased to its own
 * node — every one of those still produces a file that looks exactly like the
 * format it claims to be, self-consistent and unreadable by any of them.
 *
 * So each format goes back through three.js's own loader, which was written
 * against the specification rather than against this module, and the geometry
 * that comes out is compared with the geometry that went in.
 */

// Off for the whole file. three converts sRGB to its linear working space on
// the way in, so a colour written as 9 comes back as 1 — correct rendering, and
// useless for asking whether the bytes survived the format. With it off the
// loader hands back what the file said.
ColorManagement.enabled = false;

const built = buildObjectMesh(MUG, "low");

if (built === null) {
    throw new Error("the fixture built nothing");
}

const mesh: Mesh = built.mesh;

function bytesFor(format: ModelFormat): Uint8Array {
    return buildModelBytes({
        mesh,
        format,
        name: MUG.name,
        stem: "reference",
        generatedAt: new Date("2026-11-28T00:00:00Z"),
    });
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

function meshesIn(group: Group): ThreeMesh[] {
    const found: ThreeMesh[] = [];

    group.traverse((node) => {
        if ((node as ThreeMesh).isMesh) {
            found.push(node as ThreeMesh);
        }
    });

    return found;
}

/** The mesh's own triangles, expanded to one position per corner, in millimetres. */
function cornerPositions(firstIndex = 0, indexCount = mesh.indices.length): Float32Array {
    const expected = new Float32Array(indexCount * 3);

    for (let corner = 0; corner < indexCount; corner += 1) {
        const vertex = mesh.indices[firstIndex + corner] * 3;

        expected[corner * 3] = mesh.positions[vertex];
        expected[corner * 3 + 1] = mesh.positions[vertex + 1];
        expected[corner * 3 + 2] = mesh.positions[vertex + 2];
    }

    return expected;
}

describe("STL, through three's STLLoader", () => {
    const geometry = new STLLoader().parse(toArrayBuffer(bytesFor("stl")));

    test("has every triangle, expanded to three unshared vertices each", () => {
        expect(geometry.getAttribute("position").count).toBe(mesh.indices.length);
    });

    test("puts every vertex exactly where the mesh had it, in millimetres", () => {
        expect(worstDifference(cornerPositions(), geometry.getAttribute("position").array)).toBe(0);
    });

    test("is read as binary, which is what the header's first five bytes decide", () => {
        expect(new TextDecoder().decode(bytesFor("stl").subarray(0, 5))).not.toBe("solid");
    });
});

describe("PLY, through three's PLYLoader", () => {
    const geometry = new PLYLoader().parse(toArrayBuffer(bytesFor("ply")));

    test("keeps the index buffer, the vertex count and the triangle count", () => {
        expect(geometry.getAttribute("position").count).toBe(mesh.positions.length / 3);
        expect(geometry.getIndex()?.count).toBe(mesh.indices.length);
    });

    test("round-trips positions and normals to the last float", () => {
        expect(worstDifference(mesh.positions, geometry.getAttribute("position").array)).toBe(0);
        expect(worstDifference(mesh.normals, geometry.getAttribute("normal").array)).toBe(0);
    });

    test("carries each part's colour on its vertices, with no second file", () => {
        const colors = geometry.getAttribute("color");

        expect(colors.count).toBe(mesh.positions.length / 3);
        expect(worstDifference(mesh.colors, colors.array)).toBe(0);
    });
});

describe("OBJ and MTL, through three's OBJLoader and MTLLoader", () => {
    const entries = objArchiveEntries(mesh);
    const objText = new TextDecoder().decode(entries[0].bytes);
    const mtlText = new TextDecoder().decode(entries[1].bytes);
    const materials = new MTLLoader().parse(mtlText, "");

    materials.preload();

    const scene = new OBJLoader().setMaterials(materials).parse(objText);
    const parts = meshesIn(scene);

    test("names the material file the archive actually contains", () => {
        expect(objText).toContain(`mtllib ${entries[1].name}`);
    });

    test("comes back as one named object per part, in order", () => {
        expect(parts.map((part) => part.name)).toEqual(
            mesh.groups.map((group, index) => objToken(group, index)),
        );
    });

    test("puts every part's corners where the mesh had them", () => {
        mesh.groups.forEach((group, index) => {
            const positions = (parts[index].geometry as BufferGeometry).getAttribute("position");

            expect(
                worstDifference(
                    cornerPositions(group.firstIndex, group.indexCount),
                    positions.array,
                ),
            ).toBeLessThan(1e-4);
        });
    });

    test("gives each part its own colour through the material library", () => {
        mesh.groups.forEach((group, index) => {
            const material = parts[index].material as MeshStandardMaterial;

            expect(material.color.r).toBeCloseTo(group.color[0] / 255, 3);
            expect(material.color.g).toBeCloseTo(group.color[1] / 255, 3);
            expect(material.color.b).toBeCloseTo(group.color[2] / 255, 3);
        });
    });
});

describe("GLB, through three's GLTFLoader", () => {
    async function load(): Promise<Group> {
        const loader = new GLTFLoader();

        return new Promise<Group>((resolve, reject) => {
            loader.parse(toArrayBuffer(bytesFor("glb")), "", (gltf) => resolve(gltf.scene), reject);
        });
    }

    test("parses into one named node per part under the object's own name", async () => {
        const scene = await load();
        // three rewrites node names it could not bind an animation to — spaces
        // become underscores — so the comparison goes through the same rule.
        const named = (name: string) => PropertyBinding.sanitizeNodeName(name);

        expect(meshesIn(scene).map((part) => part.name)).toEqual(
            filePartNames(mesh.groups).map(named),
        );
        expect(scene.getObjectByName(named(MUG.name))).toBeDefined();
    });

    test("arrives in metres, each part's indices rebased to its own vertices", async () => {
        const parts = meshesIn(await load());

        mesh.groups.forEach((group, index) => {
            const geometry = parts[index].geometry as BufferGeometry;
            const positions = geometry.getAttribute("position").array;
            const order = geometry.getIndex()?.array ?? [];
            const corners = new Float32Array(order.length * 3);

            for (let corner = 0; corner < order.length; corner += 1) {
                for (let axis = 0; axis < 3; axis += 1) {
                    corners[corner * 3 + axis] = positions[order[corner] * 3 + axis];
                }
            }

            const expected = cornerPositions(group.firstIndex, group.indexCount).map(
                (mm) => mm / MILLIMETRES_PER_METRE,
            );

            expect(worstDifference(expected, corners)).toBeLessThan(1e-9);
        });
    });

    test("keeps the normals to the last float", async () => {
        const parts = meshesIn(await load());

        mesh.groups.forEach((group, index) => {
            const normals = (parts[index].geometry as BufferGeometry).getAttribute("normal").array;

            expect(
                worstDifference(
                    mesh.normals.subarray(
                        group.firstVertex * 3,
                        (group.firstVertex + group.vertexCount) * 3,
                    ),
                    normals,
                ),
            ).toBe(0);
        });
    });

    test("writes each part's colour as a linear base colour, which is what glTF means", async () => {
        const parts = meshesIn(await load());

        mesh.groups.forEach((group, index) => {
            const material = parts[index].material as MeshStandardMaterial;

            expect(material.color.r).toBeCloseTo(srgbToLinear(group.color[0]), 5);
            expect(material.color.g).toBeCloseTo(srgbToLinear(group.color[1]), 5);
            expect(material.color.b).toBeCloseTo(srgbToLinear(group.color[2]), 5);
        });
    });

    test("aligns every chunk and every buffer view to four bytes", () => {
        const bytes = bytesFor("glb");
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const jsonLength = view.getUint32(12, true);
        const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));

        expect(view.getUint32(0, true)).toBe(0x46546c67);
        expect(view.getUint32(8, true)).toBe(bytes.byteLength);
        expect(jsonLength % 4).toBe(0);
        expect(view.getUint32(20 + jsonLength, true) % 4).toBe(0);

        for (const bufferView of gltf.bufferViews) {
            expect(bufferView.byteOffset % 4).toBe(0);
        }
    });
});
