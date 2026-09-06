import type { Heightfield, Mesh, MeshOptions, MeshResult, MeshStats } from "../types";
import { MAX_TRIANGLES } from "./constants";
import { computeNormals, weldNormals } from "./normals";
import { placementFor, type Placement, type Vec3 } from "./placement";
import { buildSilhouette, inflatedHeight } from "./silhouette";

type LoopPoint = { readonly column: number; readonly row: number };

type BoundaryLoop = {
    readonly points: readonly LoopPoint[];
    /** False when the last point is already the first one under another name. */
    readonly closed: boolean;
};

/**
 * Which cells become triangles, which grid points they use, and how high each
 * of those points sits.
 *
 * Computed before anything is allocated, because with a cut-out the answer is a
 * property of the picture rather than of the grid: a mouse on a white
 * background fills maybe a third of its frame, and the other two thirds are
 * cells that must not become geometry. Counting first is also what keeps the
 * triangle count the page shows and the mesh that comes out the same number by
 * construction rather than by agreement.
 */
type Region = {
    /** Height in 0..1 per grid point, after the shape has had its say. */
    readonly heights: Float32Array;
    /** Grid point index → vertex slot on one surface, or −1 when unused. */
    readonly slots: Int32Array;
    /** Row-major `[column, row]` pairs for each included cell. */
    readonly cells: Int32Array;
    readonly usedVertices: number;
    readonly cellCount: number;
};

/**
 * The edge of the relief, walked so the surface is always on the left as seen
 * from outside it.
 *
 * That single sentence is what makes every wall face outward without a per-side
 * winding table: the quad emitted for each step is built in a fixed order, and
 * the direction of travel is what decides which way it ends up pointing. Get
 * the direction wrong on one side and that wall renders inside-out — invisible
 * in a viewer that draws back faces, and a hole to a slicer.
 */
function boundaryLoops(columns: number, rows: number, seamless: boolean): readonly BoundaryLoop[] {
    if (seamless) {
        const top: LoopPoint[] = [];
        const bottom: LoopPoint[] = [];

        // The top rim runs against u and the bottom rim with it. Both rims are
        // annuli whose outward direction is the model's own axis, and reversing
        // one of the two is what turns them away from each other.
        for (let column = columns - 1; column >= 0; column -= 1) {
            top.push({ column, row: 0 });
        }

        for (let column = 0; column < columns; column += 1) {
            bottom.push({ column, row: rows - 1 });
        }

        return [
            { points: top, closed: false },
            { points: bottom, closed: false },
        ];
    }

    const points: LoopPoint[] = [];

    for (let row = 0; row < rows; row += 1) {
        points.push({ column: 0, row });
    }

    for (let column = 1; column < columns; column += 1) {
        points.push({ column, row: rows - 1 });
    }

    for (let row = rows - 2; row >= 0; row -= 1) {
        points.push({ column: columns - 1, row });
    }

    for (let column = columns - 2; column >= 1; column -= 1) {
        points.push({ column, row: 0 });
    }

    return [{ points, closed: true }];
}

/**
 * The heights an inflated body is built from, and the cells that carry it.
 *
 * A cell is kept when **any** of its four corners is inside the outline, not
 * when all four are. That is the rule the closure depends on: the corners just
 * outside are kept at height zero, so the front and back halves put their
 * boundary triangles on exactly the same points wound opposite ways, and the
 * body seals itself along its own outline with no walls at all. Requiring all
 * four would drop that ring and leave the model open along its whole edge.
 */
function inflatedRegion(field: Heightfield, options: MeshOptions): Region {
    const { columns, rows } = field;
    const silhouette = buildSilhouette(field.alpha, { width: columns, height: rows });
    const heights = new Float32Array(columns * rows);

    for (let index = 0; index < heights.length; index += 1) {
        heights[index] = inflatedHeight(
            silhouette.depth[index],
            field.heights[index],
            options.detail,
        );
    }

    return collectCells(columns, rows, heights, (a, b, c, d) => {
        // A cell every corner of which is at zero encloses nothing, and its two
        // halves would land on each other as a zero-volume sliver.
        return heights[a] > 0 || heights[b] > 0 || heights[c] > 0 || heights[d] > 0;
    });
}

/** The whole grid, which is what a plate and a cylinder always use. */
function fullRegion(field: Heightfield, placement: Placement): Region {
    const { columns, rows } = field;
    const heights = new Float32Array(columns * rows);

    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            // A seamless shape's last column is its first column seen a second
            // time, so it is given the first column's height. Letting it keep
            // its own would leave the two ends of the wrap at different radii,
            // which is a crack in the model rather than a mark on it.
            const read = placement.seamless && column === columns - 1 ? 0 : column;

            heights[row * columns + column] = field.heights[row * columns + read];
        }
    }

    return collectCells(columns, rows, heights, () => true);
}

function collectCells(
    columns: number,
    rows: number,
    heights: Float32Array,
    keep: (a: number, b: number, c: number, d: number) => boolean,
): Region {
    const used = new Uint8Array(columns * rows);
    const cells = new Int32Array((columns - 1) * (rows - 1) * 2);

    let cellCount = 0;

    for (let row = 0; row < rows - 1; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
            const a = row * columns + column;
            const b = a + 1;
            const d = a + columns;
            const c = d + 1;

            if (!keep(a, b, c, d)) {
                continue;
            }

            used[a] = 1;
            used[b] = 1;
            used[c] = 1;
            used[d] = 1;

            cells[cellCount * 2] = column;
            cells[cellCount * 2 + 1] = row;
            cellCount += 1;
        }
    }

    // Numbered in a second pass, in grid order, and that is not a tidiness
    // preference: the builder emits a surface's vertices by walking the grid
    // row by row, so a slot handed out in the order cells happened to claim it
    // names a different vertex than the one that was written. It looked like a
    // watertight mesh, passed a normal count, and had its triangles wired to
    // the wrong corners.
    const slots = new Int32Array(columns * rows).fill(-1);
    let usedVertices = 0;

    for (let index = 0; index < used.length; index += 1) {
        if (used[index] === 1) {
            slots[index] = usedVertices;
            usedVertices += 1;
        }
    }

    return { heights, slots, cells, usedVertices, cellCount };
}

/**
 * The heightfield as a triangle mesh.
 *
 * Three surfaces at most, and only the first is unconditional: the front, the
 * surface behind it, and — for the two shapes whose halves do not already touch
 * — the walls that join their edges. With `solid` off the model is that first
 * surface alone: a sheet with no thickness, which is what a renderer wants and
 * what a printer cannot use.
 */
export function buildMesh(field: Heightfield, options: MeshOptions, aspect: number): MeshResult {
    const columns = field.columns;
    const rows = field.rows;

    if (columns < 2 || rows < 2) {
        return { ok: false, reason: "empty_image" };
    }

    const placement = placementFor({ ...options, aspect });
    const region =
        options.shape === "inflate" ? inflatedRegion(field, options) : fullRegion(field, placement);

    if (region.cellCount === 0) {
        // Reachable only from a cut-out that found nothing: a fully transparent
        // picture, or a subject the model could not see.
        return { ok: false, reason: "empty_image" };
    }

    const walled = placement.walled && options.solid;
    const wallEdges = walled ? countWallEdges(columns, rows, placement.seamless) : 0;

    const stats: MeshStats = {
        vertices:
            region.usedVertices * (options.solid ? 2 : 1) +
            // Wall corners are not shared with the surfaces they join, so each
            // quad carries its own four vertices. That is what keeps a wall
            // flat-shaded instead of smoothing the fold at the edge.
            wallEdges * 4,
        triangles: region.cellCount * (options.solid ? 4 : 2) + wallEdges * 2,
    };

    if (stats.triangles > MAX_TRIANGLES) {
        return { ok: false, reason: "too_many_triangles", triangles: stats.triangles };
    }

    const positions = new Float32Array(stats.vertices * 3);
    const uvs = new Float32Array(stats.vertices * 2);
    const colors = new Uint8Array(stats.vertices * 3);
    const indices = new Uint32Array(stats.triangles * 3);
    const seams: [number, number][] = [];

    let vertexCursor = 0;
    let indexCursor = 0;

    const uAt = (column: number) => column / (columns - 1);
    const vAt = (row: number) => row / (rows - 1);

    function addVertex(point: Vec3, u: number, v: number, sample: number): number {
        const vertex = vertexCursor;
        vertexCursor += 1;

        positions[vertex * 3] = point[0];
        positions[vertex * 3 + 1] = point[1];
        positions[vertex * 3 + 2] = point[2];

        uvs[vertex * 2] = u;
        uvs[vertex * 2 + 1] = v;

        colors[vertex * 3] = field.colors[sample * 3];
        colors[vertex * 3 + 1] = field.colors[sample * 3 + 1];
        colors[vertex * 3 + 2] = field.colors[sample * 3 + 2];

        return vertex;
    }

    function addTriangle(a: number, b: number, c: number) {
        indices[indexCursor] = a;
        indices[indexCursor + 1] = b;
        indices[indexCursor + 2] = c;
        indexCursor += 3;
    }

    /** Emits one surface's vertices in grid order and returns where it started. */
    function addSurface(place: (u: number, v: number, height: number) => Vec3): number {
        const first = vertexCursor;

        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const sample = row * columns + column;

                if (region.slots[sample] === -1) {
                    continue;
                }

                addVertex(
                    place(uAt(column), vAt(row), region.heights[sample]),
                    uAt(column),
                    vAt(row),
                    sample,
                );
            }
        }

        return first;
    }

    /**
     * A cell's two triangles.
     *
     * Rows run down the picture and therefore down −Y, so a front-facing quad is
     * wound top-left → bottom-left → bottom-right.
     *
     * The diagonal is chosen rather than fixed, and on an inflated body that is
     * a correctness rule rather than a quality one. Every point on the outline
     * is at exactly zero height — that is what lets the front and back halves
     * meet — so a cell with a single corner inside has three corners at zero,
     * and a fixed diagonal puts all three of them in the same triangle. Front
     * and back then emit that triangle at identical points, which is a
     * zero-area fin: invisible, weightless, and an edge shared by four faces
     * to anything that checks whether a mesh is manifold.
     *
     * Splitting along whichever diagonal carries more height puts a raised
     * corner in **both** triangles, whatever the outline is doing. Front and
     * back read the same heights and so make the same choice, which is what
     * keeps their boundary edges cancelling. On a plate, where nothing is
     * exactly zero, it is the ordinary quality heuristic — split along the ridge
     * rather than across it — and a flat field ties and splits as it always did.
     */
    function addCells(base: number, front: boolean) {
        for (let cell = 0; cell < region.cellCount; cell += 1) {
            const column = region.cells[cell * 2];
            const row = region.cells[cell * 2 + 1];
            const corner = row * columns + column;

            const a = base + region.slots[corner];
            const b = base + region.slots[corner + 1];
            const d = base + region.slots[corner + columns];
            const c = base + region.slots[corner + columns + 1];

            const acrossAC = region.heights[corner] + region.heights[corner + columns + 1];
            const acrossBD = region.heights[corner + 1] + region.heights[corner + columns];

            if (acrossBD > acrossAC) {
                if (front) {
                    addTriangle(a, d, b);
                    addTriangle(b, d, c);
                } else {
                    addTriangle(a, b, d);
                    addTriangle(b, c, d);
                }

                continue;
            }

            if (front) {
                addTriangle(a, d, c);
                addTriangle(a, c, b);
            } else {
                addTriangle(a, c, d);
                addTriangle(a, b, c);
            }
        }
    }

    const frontBase = addSurface((u, v, height) => placement.outer(u, v, height));

    addCells(frontBase, true);

    if (options.solid) {
        const backBase = addSurface((u, v, height) => placement.inner(u, v, height));

        addCells(backBase, false);

        if (walled) {
            addWalls();
        }

        if (placement.seamless) {
            for (let row = 0; row < rows; row += 1) {
                seams.push([
                    backBase + region.slots[row * columns],
                    backBase + region.slots[row * columns + columns - 1],
                ]);
            }
        }
    }

    function addWalls() {
        for (const loop of boundaryLoops(columns, rows, placement.seamless)) {
            const steps = loop.closed ? loop.points.length : loop.points.length - 1;

            for (let step = 0; step < steps; step += 1) {
                const from = loop.points[step];
                const to = loop.points[(step + 1) % loop.points.length];

                const fromSample = from.row * columns + from.column;
                const toSample = to.row * columns + to.column;
                const fromU = uAt(from.column);
                const fromV = vAt(from.row);
                const toU = uAt(to.column);
                const toV = vAt(to.row);

                const fromTop = addVertex(
                    placement.outer(fromU, fromV, region.heights[fromSample]),
                    fromU,
                    fromV,
                    fromSample,
                );
                const fromBack = addVertex(
                    placement.inner(fromU, fromV, region.heights[fromSample]),
                    fromU,
                    fromV,
                    fromSample,
                );
                const toBack = addVertex(
                    placement.inner(toU, toV, region.heights[toSample]),
                    toU,
                    toV,
                    toSample,
                );
                const toTop = addVertex(
                    placement.outer(toU, toV, region.heights[toSample]),
                    toU,
                    toV,
                    toSample,
                );

                addTriangle(fromTop, fromBack, toBack);
                addTriangle(fromTop, toBack, toTop);
            }
        }
    }

    if (placement.seamless) {
        for (let row = 0; row < rows; row += 1) {
            seams.push([
                frontBase + region.slots[row * columns],
                frontBase + region.slots[row * columns + columns - 1],
            ]);
        }
    }

    const normals = computeNormals(positions, indices);

    weldNormals(normals, seams);

    const mesh: Mesh = { positions, normals, uvs, colors, indices };

    return { ok: true, mesh, stats };
}

/**
 * How many wall quads join the front to the back.
 *
 * A plate is walled all the way round, so the count is its perimeter of grid
 * cells. A cylinder has no left or right wall — the picture's two edges are the
 * same place on the model — so only the two rims are closed, and each of those
 * is one column short of the grid because its last vertex is its first.
 */
function countWallEdges(columns: number, rows: number, seamless: boolean): number {
    if (seamless) {
        return 2 * (columns - 1);
    }

    return 2 * (columns - 1) + 2 * (rows - 1);
}
