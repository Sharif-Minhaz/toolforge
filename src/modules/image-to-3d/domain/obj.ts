import type { Mesh, MeshGroup } from "../types";
import { filePartLabel } from "./filenames";

/** Enough places for a micrometre on a two-metre model, and no more. */
function decimal(value: number): string {
    return String(Number(value.toFixed(6)));
}

/**
 * A part's name as an OBJ token.
 *
 * `o` and `usemtl` have no quoting rule at all — a space ends the name, and
 * the rest of the line is silently dropped or read as a second name. The
 * model's names are plain English with spaces, so they are slugged, and
 * numbered so two parts both called "leg" stay two objects — which is why this
 * needs only `filePartLabel`, not `filePartNames`.
 */
export function objToken(group: MeshGroup, index: number): string {
    const slug = filePartLabel(group)
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();

    return `${String(index + 1).padStart(2, "0")}_${slug.length > 0 ? slug : "part"}`;
}

/**
 * Wavefront OBJ, in millimetres.
 *
 * Text, one-indexed, and the oldest thing here that every program still opens.
 * Each part is its own `o` with its own `usemtl`, so Blender, Maya and every
 * slicer that reads OBJ show named, coloured pieces. Colour lives in the
 * material library beside it, which is why the download is a ZIP.
 *
 * Normals ride along as `vn` and every face names its own with `f a//a`, and
 * `s 1` keeps importers from re-deriving flat normals over a sphere.
 */
export function encodeObj(mesh: Mesh, options: { mtlName: string; comment: string }): string {
    const vertices = mesh.positions.length / 3;
    const lines: string[] = [`# ${options.comment}`, `mtllib ${options.mtlName}`];

    for (let vertex = 0; vertex < vertices; vertex += 1) {
        lines.push(
            `v ${decimal(mesh.positions[vertex * 3])} ${decimal(mesh.positions[vertex * 3 + 1])} ${decimal(mesh.positions[vertex * 3 + 2])}`,
        );
    }

    for (let vertex = 0; vertex < vertices; vertex += 1) {
        lines.push(
            `vn ${decimal(mesh.normals[vertex * 3])} ${decimal(mesh.normals[vertex * 3 + 1])} ${decimal(mesh.normals[vertex * 3 + 2])}`,
        );
    }

    mesh.groups.forEach((group, groupIndex) => {
        const token = objToken(group, groupIndex);

        lines.push(`o ${token}`, `usemtl ${token}`, "s 1");

        for (let face = 0; face < group.indexCount; face += 3) {
            const first = group.firstIndex + face;
            const [a, b, c] = [first, first + 1, first + 2].map((index) => mesh.indices[index] + 1);

            lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
        }
    });

    lines.push("");

    return lines.join("\n");
}

/**
 * One material per part, carrying its colour as `Kd`.
 *
 * MTL's colours are written as 0–1 and read as sRGB by every importer that
 * matters — Blender converts them itself — so they go out as picked, not
 * linearised the way glTF's must be.
 */
export function encodeMtl(mesh: Mesh): string {
    const lines: string[] = [];

    mesh.groups.forEach((group, groupIndex) => {
        const [red, green, blue] = group.color.map((channel) => (channel / 255).toFixed(4));

        lines.push(
            `newmtl ${objToken(group, groupIndex)}`,
            "Ka 0.0000 0.0000 0.0000",
            `Kd ${red} ${green} ${blue}`,
            "Ks 0.1000 0.1000 0.1000",
            "Ns 40",
            "d 1.0",
            "illum 2",
            "",
        );
    });

    return lines.join("\n");
}
