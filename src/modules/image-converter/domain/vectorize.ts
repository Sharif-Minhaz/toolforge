import type { PixelSize } from "@/modules/tools/types";
import type { SourcePixels } from "./icon-layout";

/**
 * Turning a grid of pixels into a set of shapes.
 *
 * This is the only target here that does not re-encode a picture — it throws
 * the picture away and keeps a description of what was in it. That trade is
 * worth naming plainly, because it decides who should use it: a logo, a stencil
 * or a flat illustration comes out as a handful of clean outlines that scale to
 * any size, and a photograph comes out as thousands of blobs that are larger
 * than the JPEG and look worse. The article says so; so does the hint under the
 * control.
 *
 * Four steps, each a pure function over plain arrays so `bun test` can reach all
 * of them without a canvas:
 *
 * 1. **Quantise** — median-cut the colours down to the count the reader chose.
 * 2. **Despeckle** — merge regions too small to be shapes into their neighbours.
 *    This is what stops a photograph producing one path per pixel.
 * 3. **Trace** — follow the boundary between pixels of one region and everything
 *    else, which gives exact outlines on the pixel grid rather than a guess.
 * 4. **Simplify** — Ramer–Douglas–Peucker, which turns the staircases the grid
 *    produced back into the straight edges they came from.
 *
 * Coordinates never move: simplification only ever *drops* points, so every
 * number in the output is an integer grid vertex. That keeps the file small
 * without rounding anything, and it is why there is no precision setting.
 */

/** Below this a pixel is a hole rather than part of a shape. */
const ALPHA_THRESHOLD = 128;

/**
 * Five bits per channel — 32 768 buckets. Fine enough to keep colours the eye
 * separates, coarse enough that the histogram is one flat array rather than a
 * hash of a million entries.
 */
const HISTOGRAM_BITS = 5;

const HISTOGRAM_SIZE = 1 << (HISTOGRAM_BITS * 3);

/** How far a point may sit from the line that replaces it, at the lowest quality. */
const MAX_TOLERANCE = 2.5;

/** The largest region the lowest quality will still throw away, in pixels. */
const MAX_SPECKLE_AREA = 64;

/**
 * The smallest region kept at the *highest* quality.
 *
 * Not one pixel, and this is the difference between a usable target and a
 * footgun: with no floor at all, a grainy megapixel at quality 100 traces into
 * 794 000 regions and 25 MB of path data. A block smaller than 2×2 is not a
 * shape anybody drew — it is sensor grain or a resampling fringe — and refusing
 * it costs a flat drawing nothing measurable while taking that worst case to
 * under 4 MB.
 */
const MIN_SPECKLE_AREA = 4;

/**
 * Both thresholds above are quoted against a megapixel and scale down with the
 * grid, because "two pixels" means two different things at two different sizes:
 * noise in a photograph, and a whole feature in a 16×16 icon. The speck area
 * scales with area and the tolerance with length, which is what keeps the two in
 * step as a picture gets smaller.
 */
const REFERENCE_PIXELS = 1_000_000;

/** A loop this small is a rounding artefact rather than a shape. */
const MIN_LOOP_AREA = 0.5;

/**
 * How many times the speck sweep may run before it gives up on converging.
 * Six is well past where every picture measured stopped changing, and the loop
 * exits on its own the moment a pass merges nothing.
 */
const DESPECKLE_PASSES = 6;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type TraceOptions = {
    /** How many flat fills the trace may use. */
    readonly colors: number;
    /** 10–100. Buys detail: smaller specks kept, corners followed more closely. */
    readonly quality: number;
};

export type TracedSvg = {
    readonly markup: string;
    /** How many fills the finished drawing actually uses — one `<path>` each. */
    readonly colors: number;
};

export type TraceColor = {
    readonly r: number;
    readonly g: number;
    readonly b: number;
};

export type TracePoint = {
    readonly x: number;
    readonly y: number;
};

/**
 * How closely the outline follows the pixel staircase.
 *
 * At quality 100 nothing is allowed to move, so a 45° edge stays a flight of
 * one-pixel steps — correct, and much larger. Below that the tolerance grows
 * towards two and a half pixels, which flattens a staircase into the diagonal it
 * was drawn as and is the single biggest lever on file size. Scaled by the
 * grid's *length*, so the same setting bends an outline by the same fraction of
 * the picture whatever size it arrived at.
 */
export function traceTolerance(quality: number, pixelCount = REFERENCE_PIXELS): number {
    const scale = Math.min(1, Math.sqrt(Math.max(0, pixelCount) / REFERENCE_PIXELS));

    return (clampQualityRange(quality) * MAX_TOLERANCE * scale) / 90;
}

/**
 * The smallest region worth keeping.
 *
 * Squared in the quality, because the count of tiny regions in a photograph
 * grows the same way: at the top of the range only sub-2×2 grain goes, and by
 * quality 10 anything under an 8×8 patch is treated as noise. Scaled by the
 * grid's *area*, because that is how much of the picture a speck of a given
 * size actually is.
 */
export function minRegionArea(quality: number, pixelCount = REFERENCE_PIXELS): number {
    const distance = clampQualityRange(quality) / 90;
    const scale = Math.min(1, Math.max(0, pixelCount) / REFERENCE_PIXELS);
    const area = MIN_SPECKLE_AREA + distance * distance * (MAX_SPECKLE_AREA - MIN_SPECKLE_AREA);

    return Math.max(1, Math.round(area * scale));
}

/** How far below the top of the range a quality sits, clamped to 0–90. */
function clampQualityRange(quality: number): number {
    if (!Number.isFinite(quality)) {
        return 0;
    }

    return Math.min(90, Math.max(0, 100 - quality));
}

type HistogramEntry = {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly count: number;
};

/**
 * The colours the drawing will be made of, by median cut.
 *
 * Median cut splits the box of colours present along its widest channel at the
 * point that halves the *pixels*, not the range — so a picture that is mostly
 * one blue spends its palette on the other colours instead of on twelve shades
 * of that blue. Fully transparent pixels take no part: they become holes, and a
 * hole has no colour to spend a palette entry on.
 */
export function buildPalette(pixels: SourcePixels, colors: number): TraceColor[] {
    const counts = new Uint32Array(HISTOGRAM_SIZE);
    const sums = new Float64Array(HISTOGRAM_SIZE * 3);
    const { data } = pixels;

    for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset + 3] < ALPHA_THRESHOLD) {
            continue;
        }

        const key = bucketKey(data[offset], data[offset + 1], data[offset + 2]);

        counts[key] += 1;
        sums[key * 3] += data[offset];
        sums[key * 3 + 1] += data[offset + 1];
        sums[key * 3 + 2] += data[offset + 2];
    }

    const entries: HistogramEntry[] = [];

    for (let key = 0; key < HISTOGRAM_SIZE; key += 1) {
        const count = counts[key];

        if (count > 0) {
            entries.push({
                r: sums[key * 3] / count,
                g: sums[key * 3 + 1] / count,
                b: sums[key * 3 + 2] / count,
                count,
            });
        }
    }

    if (entries.length === 0) {
        return [];
    }

    const wanted = Math.max(1, Math.min(Math.floor(colors), entries.length));
    let boxes: HistogramEntry[][] = [entries];

    while (boxes.length < wanted) {
        const index = widestBox(boxes);

        if (index === -1) {
            break;
        }

        const split = splitBox(boxes[index]);

        if (split === null) {
            break;
        }

        boxes = [...boxes.slice(0, index), ...split, ...boxes.slice(index + 1)];
    }

    return dedupeColors(boxes.map(averageColor));
}

function bucketKey(r: number, g: number, b: number): number {
    const shift = 8 - HISTOGRAM_BITS;

    return ((r >> shift) << (HISTOGRAM_BITS * 2)) | ((g >> shift) << HISTOGRAM_BITS) | (b >> shift);
}

/** The box with the widest single channel, which is the one worth splitting. */
function widestBox(boxes: readonly HistogramEntry[][]): number {
    let best = -1;
    let bestRange = 0;

    for (const [index, box] of boxes.entries()) {
        if (box.length < 2) {
            continue;
        }

        const range = Math.max(...channelRanges(box));

        if (range > bestRange) {
            best = index;
            bestRange = range;
        }
    }

    return best;
}

function channelRanges(box: readonly HistogramEntry[]): [number, number, number] {
    const ranges: [number, number, number] = [0, 0, 0];

    for (const channel of [0, 1, 2] as const) {
        const values = box.map((entry) => channelOf(entry, channel));

        ranges[channel] = Math.max(...values) - Math.min(...values);
    }

    return ranges;
}

function channelOf(entry: HistogramEntry, channel: 0 | 1 | 2): number {
    return channel === 0 ? entry.r : channel === 1 ? entry.g : entry.b;
}

function splitBox(box: readonly HistogramEntry[]): [HistogramEntry[], HistogramEntry[]] | null {
    const ranges = channelRanges(box);
    const widest = ranges.indexOf(Math.max(...ranges)) as 0 | 1 | 2;
    const sorted = [...box].toSorted((a, b) => channelOf(a, widest) - channelOf(b, widest));
    const total = sorted.reduce((sum, entry) => sum + entry.count, 0);

    let carried = 0;

    for (let index = 0; index < sorted.length - 1; index += 1) {
        carried += sorted[index].count;

        if (carried * 2 >= total) {
            return [sorted.slice(0, index + 1), sorted.slice(index + 1)];
        }
    }

    // Every entry but the last sits below half the pixels, which happens when
    // one colour dominates. Peeling it off alone still makes progress.
    return sorted.length < 2 ? null : [sorted.slice(0, sorted.length - 1), sorted.slice(-1)];
}

function averageColor(box: readonly HistogramEntry[]): TraceColor {
    let total = 0;
    let r = 0;
    let g = 0;
    let b = 0;

    for (const entry of box) {
        total += entry.count;
        r += entry.r * entry.count;
        g += entry.g * entry.count;
        b += entry.b * entry.count;
    }

    if (total === 0) {
        return { r: 0, g: 0, b: 0 };
    }

    return {
        r: Math.round(r / total),
        g: Math.round(g / total),
        b: Math.round(b / total),
    };
}

/** Two boxes can average to the same colour; one fill is enough for both. */
function dedupeColors(colors: readonly TraceColor[]): TraceColor[] {
    const seen = new Set<number>();

    return colors.filter((color) => {
        const key = (color.r << 16) | (color.g << 8) | color.b;

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);

        return true;
    });
}

/**
 * Which palette entry each pixel belongs to, or `-1` where it is a hole.
 *
 * The nearest entry is looked up once per five-bit colour bucket and then
 * reused. Two colours in the same bucket differ by at most seven levels in a
 * channel, which is far below the distance between palette entries at any
 * useful palette size — so the cache changes the answer for no pixel a reader
 * could point at, and turns a per-pixel scan of the palette into a table read.
 */
export function mapToPalette(pixels: SourcePixels, palette: readonly TraceColor[]): Int16Array {
    const indices = new Int16Array(pixels.width * pixels.height).fill(-1);

    if (palette.length === 0) {
        return indices;
    }

    const cache = new Int16Array(HISTOGRAM_SIZE).fill(-1);
    const { data } = pixels;

    for (let pixel = 0; pixel < indices.length; pixel += 1) {
        const offset = pixel * 4;

        if (data[offset + 3] < ALPHA_THRESHOLD) {
            continue;
        }

        const key = bucketKey(data[offset], data[offset + 1], data[offset + 2]);
        let nearest = cache[key];

        if (nearest < 0) {
            nearest = nearestColor(data[offset], data[offset + 1], data[offset + 2], palette);
            cache[key] = nearest;
        }

        indices[pixel] = nearest;
    }

    return indices;
}

function nearestColor(r: number, g: number, b: number, palette: readonly TraceColor[]): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [index, color] of palette.entries()) {
        const distance =
            (color.r - r) * (color.r - r) +
            (color.g - g) * (color.g - g) +
            (color.b - b) * (color.b - b);

        if (distance < bestDistance) {
            best = index;
            bestDistance = distance;
        }
    }

    return best;
}

/**
 * Every run of touching pixels that share a palette entry, in one pass.
 *
 * Members are stored the way a sparse matrix is: one flat array of pixel
 * indices, with `starts` saying where each label's run begins. A flood fill
 * writes each pixel exactly once, so the runs come out contiguous for free —
 * and the alternative, an array of arrays, allocates one object per region on a
 * picture that can have tens of thousands of them.
 */
export type PixelComponents = {
    /** The label of each pixel, or `-1` where it is a hole. */
    readonly labels: Int32Array;
    readonly count: number;
    /** `starts[label]` … `starts[label + 1]` bounds that label's members. */
    readonly starts: Uint32Array;
    readonly members: Uint32Array;
    /** The palette entry each label carries. */
    readonly indexOf: Int16Array;
};

export function labelComponents(indices: Int16Array, size: PixelSize): PixelComponents {
    const { width, height } = size;
    const total = width * height;
    const labels = new Int32Array(total).fill(-1);
    const members = new Uint32Array(total);
    const stack = new Int32Array(total);
    const starts: number[] = [];
    const values: number[] = [];

    let cursor = 0;

    for (let seed = 0; seed < total; seed += 1) {
        if (labels[seed] !== -1 || indices[seed] < 0) {
            continue;
        }

        const label = starts.length;
        const value = indices[seed];

        starts.push(cursor);
        values.push(value);

        let top = 0;

        labels[seed] = label;
        stack[top] = seed;
        top += 1;

        while (top > 0) {
            top -= 1;

            const pixel = stack[top];

            members[cursor] = pixel;
            cursor += 1;

            const x = pixel % width;
            const y = (pixel - x) / width;

            for (const neighbour of [
                x > 0 ? pixel - 1 : -1,
                x + 1 < width ? pixel + 1 : -1,
                y > 0 ? pixel - width : -1,
                y + 1 < height ? pixel + width : -1,
            ]) {
                if (neighbour >= 0 && labels[neighbour] === -1 && indices[neighbour] === value) {
                    labels[neighbour] = label;
                    stack[top] = neighbour;
                    top += 1;
                }
            }
        }
    }

    starts.push(cursor);

    return {
        labels,
        count: values.length,
        starts: Uint32Array.from(starts),
        members,
        indexOf: Int16Array.from(values),
    };
}

/**
 * Folds regions smaller than `minArea` into a neighbour big enough to keep them.
 *
 * Without this a photograph traces into one path per stray pixel and the file is
 * larger than the picture it replaced. Regions go smallest first and each merge
 * is written straight back into the map, so a cluster of specks collapses into
 * one survivor rather than into each other.
 *
 * **A speck must not adopt another speck**, and getting that wrong is not a
 * cosmetic matter: an earlier version tallied neighbours by colour, so two
 * touching specks could take each other's value and the one processed first was
 * stranded once the second merged away. Raising the threshold then produced
 * *more* regions than lowering it — 237 000 at a floor of two against 265 000 at
 * a floor of four, on the same picture. Candidates are therefore counted by
 * neighbouring *region*, and only regions that are themselves staying are
 * eligible; the tally falls back to all of them when a speck is surrounded
 * entirely by other specks, which is the one case where a cascade is the only
 * way out.
 *
 * Transparency is always eligible. A speck against nothing should become
 * nothing.
 *
 * One pass is not enough, and the numbers are not close. Merging changes which
 * regions are adjacent to which, so a speck that had no large neighbour on the
 * first pass often has one on the second — repeating until nothing moves took a
 * grainy megapixel from 83 000 regions to 14 500 at the same threshold. It is
 * also free on the pictures this target is actually for: a flat drawing has
 * nothing to merge, the first pass reports as much, and the loop stops there.
 */
export function despeckle(
    indices: Int16Array,
    size: PixelSize,
    minArea: number,
    maxPasses = DESPECKLE_PASSES,
): Int16Array {
    if (minArea <= 1) {
        return indices;
    }

    let current = indices;

    for (let pass = 0; pass < maxPasses; pass += 1) {
        const swept = despeckleOnce(current, size, minArea);

        current = swept.indices;

        if (!swept.merged) {
            break;
        }
    }

    return current;
}

function despeckleOnce(
    indices: Int16Array,
    size: PixelSize,
    minArea: number,
): { readonly indices: Int16Array; readonly merged: boolean } {
    const output = Int16Array.from(indices);
    const components = labelComponents(indices, size);
    const order = Array.from({ length: components.count }, (_, label) => label).toSorted(
        (a, b) => areaOf(components, a) - areaOf(components, b),
    );

    let merged = false;

    for (const label of order) {
        if (areaOf(components, label) >= minArea) {
            break;
        }

        const start = components.starts[label];
        const end = components.starts[label + 1];
        const adopted = dominantNeighbour(output, components, label, size, minArea);

        if (adopted === null || adopted === components.indexOf[label]) {
            continue;
        }

        merged = true;

        for (let position = start; position < end; position += 1) {
            output[components.members[position]] = adopted;
        }
    }

    return { indices: output, merged };
}

/** The value a region currently carries, after any merge it has already taken. */
function valueOfLabel(indices: Int16Array, components: PixelComponents, label: number): number {
    return label === -1 ? -1 : indices[components.members[components.starts[label]]];
}

function areaOf(components: PixelComponents, label: number): number {
    return components.starts[label + 1] - components.starts[label];
}

/**
 * The value a speck should take, counted by neighbouring region rather than by
 * neighbouring colour — see `despeckle` for why the difference matters.
 */
function dominantNeighbour(
    indices: Int16Array,
    components: PixelComponents,
    label: number,
    size: PixelSize,
    minArea: number,
): number | null {
    const { width, height } = size;
    const tally = new Map<number, number>();

    for (
        let position = components.starts[label];
        position < components.starts[label + 1];
        position += 1
    ) {
        const pixel = components.members[position];
        const x = pixel % width;
        const y = (pixel - x) / width;

        for (const neighbour of [
            x > 0 ? pixel - 1 : -1,
            x + 1 < width ? pixel + 1 : -1,
            y > 0 ? pixel - width : -1,
            y + 1 < height ? pixel + width : -1,
        ]) {
            if (neighbour < 0) {
                continue;
            }

            const other = components.labels[neighbour];

            if (other !== label) {
                tally.set(other, (tally.get(other) ?? 0) + 1);
            }
        }
    }

    // Transparency has no region of its own and never merges away, so it is
    // always a safe home for a speck sitting against it.
    const staying = (other: number) => other === -1 || areaOf(components, other) >= minArea;
    const best = widestBorder(tally, staying) ?? widestBorder(tally, null);

    return best === null ? null : valueOfLabel(indices, components, best);
}

/** The neighbouring region this speck touches most, among those allowed. */
function widestBorder(
    tally: ReadonlyMap<number, number>,
    allowed: ((label: number) => boolean) | null,
): number | null {
    let best: number | null = null;
    let bestShare = 0;

    for (const [other, share] of tally) {
        if (allowed !== null && !allowed(other)) {
            continue;
        }

        if (share > bestShare) {
            best = other;
            bestShare = share;
        }
    }

    return best;
}

/**
 * The closed outlines of one region, walked along the boundaries between
 * pixels.
 *
 * Every side of every pixel whose neighbour is outside the region becomes a
 * directed edge, oriented so the region is always on the right. Chaining those
 * edges gives exact outlines — no smoothing, no guessing which way a corner
 * went — and holes fall out of it for free, wound the other way round, which is
 * what makes `fill-rule="evenodd"` on the finished path correct.
 *
 * The one ambiguity is a vertex where two of the region's corners meet
 * diagonally. Taking the sharpest right turn keeps the walk on the outline it
 * arrived on, so the two corners come out as two loops rather than one figure
 * of eight.
 */
export function traceComponent(
    components: PixelComponents,
    label: number,
    size: PixelSize,
): TracePoint[][] {
    const { width, height } = size;
    const stride = width + 1;
    const outgoing = new Map<number, number[]>();

    let edges = 0;

    const addEdge = (from: number, to: number) => {
        const existing = outgoing.get(from);

        if (existing === undefined) {
            outgoing.set(from, [to]);
        } else {
            existing.push(to);
        }

        edges += 1;
    };

    for (
        let position = components.starts[label];
        position < components.starts[label + 1];
        position += 1
    ) {
        const pixel = components.members[position];
        const x = pixel % width;
        const y = (pixel - x) / width;
        const corner = y * stride + x;

        if (y === 0 || components.labels[pixel - width] !== label) {
            addEdge(corner, corner + 1);
        }

        if (x + 1 === width || components.labels[pixel + 1] !== label) {
            addEdge(corner + 1, corner + 1 + stride);
        }

        if (y + 1 === height || components.labels[pixel + width] !== label) {
            addEdge(corner + 1 + stride, corner + stride);
        }

        if (x === 0 || components.labels[pixel - 1] !== label) {
            addEdge(corner + stride, corner);
        }
    }

    const loops: TracePoint[][] = [];
    const starts = [...outgoing.keys()];

    for (const start of starts) {
        while ((outgoing.get(start)?.length ?? 0) > 0) {
            const loop = walkLoop(outgoing, start, stride, edges);

            if (loop !== null) {
                loops.push(loop);
            } else {
                break;
            }
        }
    }

    return loops;
}

function walkLoop(
    outgoing: Map<number, number[]>,
    start: number,
    stride: number,
    limit: number,
): TracePoint[] | null {
    const points: TracePoint[] = [];

    let current = start;
    let heading: number | null = null;

    for (let step = 0; step <= limit; step += 1) {
        const options = outgoing.get(current);

        if (options === undefined || options.length === 0) {
            return null;
        }

        const chosen = chooseEdge(options, current, heading, stride);
        const next = options[chosen];

        options.splice(chosen, 1);
        points.push({ x: current % stride, y: (current - (current % stride)) / stride });

        heading = next - current;
        current = next;

        if (current === start) {
            return points;
        }
    }

    return null;
}

/**
 * Which way to go on, given how we arrived.
 *
 * Right turn first, then straight on, then left — the order that hugs the
 * outline being walked. With the region on the right of every edge, a right
 * turn from a heading of `(dx, dy)` is `(-dy, dx)`; the y axis points down, so
 * that is a clockwise turn on the screen.
 */
function chooseEdge(
    options: readonly number[],
    current: number,
    heading: number | null,
    stride: number,
): number {
    if (heading === null || options.length === 1) {
        return 0;
    }

    const dx = heading === 1 ? 1 : heading === -1 ? -1 : 0;
    const dy = heading === stride ? 1 : heading === -stride ? -1 : 0;
    const turns = [
        step(-dy, dx, stride), // right
        step(dx, dy, stride), // straight on
        step(dy, -dx, stride), // left
    ];

    for (const turn of turns) {
        const index = options.indexOf(current + turn);

        if (index !== -1) {
            return index;
        }
    }

    return 0;
}

function step(dx: number, dy: number, stride: number): number {
    return dy * stride + dx;
}

/**
 * Ramer–Douglas–Peucker over a closed ring.
 *
 * The ring is cut at the two points furthest apart before the open-chain
 * algorithm runs, because RDP anchors its ends and a ring has none — anchoring
 * an arbitrary pair would keep two points that mean nothing and can leave a
 * dent where the cut fell. Points are only ever dropped, never moved, so the
 * output stays on the integer grid.
 */
export function simplifyPolygon(points: readonly TracePoint[], tolerance: number): TracePoint[] {
    if (points.length < 4) {
        return [...points];
    }

    const pivot = farthestFrom(points, 0);
    const first = rotate(points, 0, pivot);
    const second = rotate(points, pivot, 0);

    const head = reducePath(first, tolerance);
    const tail = reducePath(second, tolerance);

    return [...head.slice(0, -1), ...tail.slice(0, -1)];
}

function rotate(points: readonly TracePoint[], from: number, to: number): TracePoint[] {
    const out: TracePoint[] = [];
    const count = points.length;

    for (let step = 0; step <= (to - from + count) % count; step += 1) {
        out.push(points[(from + step) % count]);
    }

    return out;
}

function farthestFrom(points: readonly TracePoint[], anchor: number): number {
    let best = anchor;
    let bestDistance = -1;

    for (const [index, point] of points.entries()) {
        const dx = point.x - points[anchor].x;
        const dy = point.y - points[anchor].y;
        const distance = dx * dx + dy * dy;

        if (distance > bestDistance) {
            best = index;
            bestDistance = distance;
        }
    }

    return best;
}

/** RDP over an open chain, iteratively — a deep recursion on a long outline is real. */
function reducePath(points: readonly TracePoint[], tolerance: number): TracePoint[] {
    if (points.length < 3) {
        return [...points];
    }

    const keep = new Uint8Array(points.length);

    keep[0] = 1;
    keep[points.length - 1] = 1;

    const stack: [number, number][] = [[0, points.length - 1]];

    while (stack.length > 0) {
        const span = stack.pop();

        if (span === undefined) {
            break;
        }

        const [first, last] = span;

        if (last - first < 2) {
            continue;
        }

        let worst = -1;
        let worstDistance = tolerance;

        for (let index = first + 1; index < last; index += 1) {
            const distance = pointLineDistance(points[index], points[first], points[last]);

            if (distance > worstDistance) {
                worst = index;
                worstDistance = distance;
            }
        }

        if (worst === -1) {
            continue;
        }

        keep[worst] = 1;
        stack.push([first, worst], [worst, last]);
    }

    return points.filter((_, index) => keep[index] === 1);
}

function pointLineDistance(point: TracePoint, from: TracePoint, to: TracePoint): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
        return Math.hypot(point.x - from.x, point.y - from.y);
    }

    return (
        Math.abs(dy * point.x - dx * point.y + to.x * from.y - to.y * from.x) / Math.hypot(dx, dy)
    );
}

/** Shoelace. Positive for an outline, negative for a hole — the winding says which. */
export function polygonArea(points: readonly TracePoint[]): number {
    let sum = 0;

    for (const [index, point] of points.entries()) {
        const next = points[(index + 1) % points.length];

        sum += point.x * next.y - next.x * point.y;
    }

    return sum / 2;
}

export function toPathData(loops: readonly (readonly TracePoint[])[]): string {
    return loops
        .map(
            (loop) =>
                `M${loop[0].x} ${loop[0].y}${loop
                    .slice(1)
                    .map((point) => `L${point.x} ${point.y}`)
                    .join("")}Z`,
        )
        .join("");
}

export function toHexColor(color: TraceColor): string {
    const channel = (value: number) =>
        Math.min(255, Math.max(0, Math.round(value)))
            .toString(16)
            .padStart(2, "0");

    return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/**
 * The whole pipeline: pixels in, one SVG document out.
 *
 * All the loops of one colour go into a single `<path>` with
 * `fill-rule="evenodd"`, which is both smaller and the only rule that is
 * correct here — a shape may sit inside another shape's hole, and even-odd is
 * what fills that case the way the picture looked.
 *
 * Fills are painted largest first. Nothing overlaps, so the order does not
 * change the result; it does mean a reader opening the file finds the
 * background at the top of it rather than buried.
 */
export function tracePixelsToSvg(pixels: SourcePixels, options: TraceOptions): TracedSvg {
    const size = { width: pixels.width, height: pixels.height };
    const area = size.width * size.height;
    const palette = buildPalette(pixels, options.colors);
    const tolerance = traceTolerance(options.quality, area);
    const mapped = despeckle(
        mapToPalette(pixels, palette),
        size,
        minRegionArea(options.quality, area),
    );
    const components = labelComponents(mapped, size);

    const loopsByColor = new Map<number, TracePoint[][]>();
    const areaByColor = new Map<number, number>();

    for (let label = 0; label < components.count; label += 1) {
        const color = components.indexOf[label];

        for (const loop of traceComponent(components, label, size)) {
            const simplified = simplifyPolygon(loop, tolerance);

            if (simplified.length < 3) {
                continue;
            }

            const area = polygonArea(simplified);

            if (Math.abs(area) < MIN_LOOP_AREA) {
                continue;
            }

            const existing = loopsByColor.get(color);

            if (existing === undefined) {
                loopsByColor.set(color, [simplified]);
            } else {
                existing.push(simplified);
            }

            areaByColor.set(color, (areaByColor.get(color) ?? 0) + area);
        }
    }

    const painted = [...loopsByColor.keys()].toSorted(
        (a, b) => Math.abs(areaByColor.get(b) ?? 0) - Math.abs(areaByColor.get(a) ?? 0),
    );

    const paths = painted.map((color) => {
        const loops = loopsByColor.get(color) ?? [];

        return `    <path fill="${toHexColor(palette[color])}" fill-rule="evenodd" d="${toPathData(loops)}" />`;
    });

    const markup = [
        `<svg xmlns="${SVG_NAMESPACE}" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`,
        ...paths,
        "</svg>",
        "",
    ].join("\n");

    return { markup, colors: painted.length };
}
