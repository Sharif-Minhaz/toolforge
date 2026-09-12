import type { Mesh } from "../types";

export const OBJ_MATERIAL_NAME = "surface";

/** Enough places for a micrometre on a half-metre plate, and no more. */
function decimal(value: number): string {
    return String(Number(value.toFixed(6)));
}

/**
 * Wavefront OBJ, in millimetres.
 *
 * Text, one-indexed, and the oldest thing here that every program still opens.
 * Two details it is easy to get wrong and hard to notice:
 *
 * - `vt` counts from the **bottom** left of the picture while glTF, canvases
 *   and this module's own `uvs` count from the top, so v is flipped on the way
 *   out. Skipping the flip gives a model whose texture is upside down in
 *   Blender and correct in the GLB beside it, which reads as a bug in Blender.
 * - `s 1` turns smoothing groups on. Without it some importers ignore the `vn`
 *   lines and re-derive flat normals, which throws away the shading that makes
 *   a relief look like a relief.
 */
export function encodeObj(mesh: Mesh, options: { mtlName: string; comment: string }): string {
    const vertices = mesh.positions.length / 3;
    const lines: string[] = [`# ${options.comment}`, `mtllib ${options.mtlName}`, "o model"];

    for (let vertex = 0; vertex < vertices; vertex += 1) {
        lines.push(
            `v ${decimal(mesh.positions[vertex * 3])} ${decimal(mesh.positions[vertex * 3 + 1])} ${decimal(mesh.positions[vertex * 3 + 2])}`,
        );
    }

    for (let vertex = 0; vertex < vertices; vertex += 1) {
        lines.push(`vt ${decimal(mesh.uvs[vertex * 2])} ${decimal(1 - mesh.uvs[vertex * 2 + 1])}`);
    }

    for (let vertex = 0; vertex < vertices; vertex += 1) {
        lines.push(
            `vn ${decimal(mesh.normals[vertex * 3])} ${decimal(mesh.normals[vertex * 3 + 1])} ${decimal(mesh.normals[vertex * 3 + 2])}`,
        );
    }

    lines.push(`usemtl ${OBJ_MATERIAL_NAME}`, "s 1");

    for (let face = 0; face < mesh.indices.length; face += 3) {
        const a = mesh.indices[face] + 1;
        const b = mesh.indices[face + 1] + 1;
        const c = mesh.indices[face + 2] + 1;

        lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }

    lines.push("");

    return lines.join("\n");
}

/**
 * The material file, which is the only reason an OBJ needs a folder.
 *
 * `illum 2` asks for a lit material rather than a flat one, and `Ks 0 0 0`
 * takes the specular highlight off: a relief lit with a default shininess
 * reads as wet plastic rather than as the picture it came from.
 */
export function encodeMtl(options: { textureName: string; hasAlpha: boolean }): string {
    return [
        `newmtl ${OBJ_MATERIAL_NAME}`,
        "Ka 1.000 1.000 1.000",
        "Kd 1.000 1.000 1.000",
        "Ks 0.000 0.000 0.000",
        "d 1.0",
        "illum 2",
        `map_Kd ${options.textureName}`,
        // `map_d` is the dissolve map: the same picture's alpha channel, so a
        // cut-out's transparent background is not painted onto the outline
        // ring as whatever the encoder stored underneath it. Only for a PNG —
        // a JPEG has no alpha to read.
        ...(options.hasAlpha ? [`map_d ${options.textureName}`] : []),
        "",
    ].join("\n");
}
