import type { MeshStats, ModelOptions } from "../types";

export type GridSize = {
    readonly columns: number;
    readonly rows: number;
};

type ShapeOptions = Pick<ModelOptions, "shape" | "solid">;

/**
 * How many wall quads join the relief to its backing.
 *
 * A plane is walled all the way round, so the count is its perimeter of grid
 * cells. A cylinder has no left or right wall — the picture's two edges are the
 * same place on the model — so only the two rims are closed, and each of those
 * is one column short of the grid because its last vertex is its first.
 */
function wallEdges(grid: GridSize, shape: ModelOptions["shape"]): number {
    if (shape === "inflate") {
        // Its two halves meet along the outline, so there is no rim to wall in.
        return 0;
    }

    if (shape === "cylinder") {
        return 2 * (grid.columns - 1);
    }

    return 2 * (grid.columns - 1) + 2 * (grid.rows - 1);
}

/**
 * The size of the mesh a full grid would produce, without producing it.
 *
 * An **upper bound**, not a promise, and only since the inflated shape arrived:
 * a cut-out drops every cell outside the outline, so a mouse on a white
 * background comes out at a fraction of this. `buildMesh` counts its own cells
 * and reports what it actually built, and that is the number the page shows —
 * this one is for callers that have a grid and no picture.
 */
export function estimateMesh(grid: GridSize, options: ShapeOptions): MeshStats {
    const cells = (grid.columns - 1) * (grid.rows - 1);
    const surfaceVertices = grid.columns * grid.rows;

    if (!options.solid) {
        return { vertices: surfaceVertices, triangles: cells * 2 };
    }

    const edges = wallEdges(grid, options.shape);

    return {
        // Wall corners are not shared with the surfaces they join, so each quad
        // carries its own four vertices. That is what keeps a wall flat-shaded
        // instead of smoothing the fold between the relief and its edge.
        vertices: surfaceVertices * 2 + edges * 4,
        triangles: cells * 4 + edges * 2,
    };
}

/**
 * Roughly how large the download will be, for the line under the format picker.
 *
 * Deliberately ignores the texture and the ZIP's own overhead: the caller knows
 * the texture's byte length and the reader is being told an order of magnitude,
 * not a promise. STL is the odd one because it shares no vertices at all —
 * fifty bytes per triangle, whatever the mesh looked like going in.
 */
export function estimateBytes(stats: MeshStats, format: ModelOptions["format"]): number {
    switch (format) {
        case "stl":
            return 84 + stats.triangles * 50;
        case "glb":
            // 32 floats of attributes and 12 bytes of index per vertex/triangle.
            return 512 + stats.vertices * 32 + stats.triangles * 12;
        case "ply":
            return 512 + stats.vertices * 27 + stats.triangles * 13;
        case "obj":
            // Text, and the digits dominate: three lines per vertex at roughly
            // this width, plus a face line whose indices grow with the mesh.
            return 512 + stats.vertices * 78 + stats.triangles * 26;
    }
}
