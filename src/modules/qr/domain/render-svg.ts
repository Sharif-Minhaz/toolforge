import type { QrEyeStyle, QrMatrix, QrStyle } from "../types";
import { TRANSPARENT_BACKGROUND } from "./constants";
import { isDark } from "./encoder";
import { resolveLogoBacking } from "./options";

/**
 * A matrix and a style into an SVG document. Pure string building: no DOM, no
 * canvas, no measurement — which is what lets the page render the first code on
 * the server and hand the markup to the island as a prop.
 *
 * The coordinate system is one unit per module, so every number below reads as
 * "modules" and the export size is a viewBox concern rather than an arithmetic
 * one.
 */

/** Corner radius of a `rounded` body module, as a fraction of one module. */
const ROUNDED_DOT_RADIUS = 0.28;

/** `smooth` rounds to a half module, which turns a lone module into a circle. */
const SMOOTH_DOT_RADIUS = 0.5;

/** Outer, inner-ring and centre radii of each eye style. */
const EYE_RADII: Record<QrEyeStyle, readonly [number, number, number]> = {
    square: [0, 0, 0],
    rounded: [2, 1.5, 1],
    dot: [3.5, 2.5, 1.5],
};

/** Clear space around the logo, so modules do not touch it. */
const LOGO_PADDING = 0.4;

export type QrSvgOptions = {
    /**
     * Becomes the document's `<title>`. Passed in already translated — the
     * domain layer has no access to a translator and should not gain one.
     */
    readonly title?: string;
    /** Pixel side written into `width`/`height`; omitted for a fluid SVG. */
    readonly pixelSize?: number;
};

/* ------------------------------------------------------------------ path --- */

/** Three decimals is finer than any renderer resolves, and keeps the path short. */
function n(value: number): string {
    return String(Math.round(value * 1_000) / 1_000);
}

/** A rectangle whose corners are rounded by the same radius, as a path. */
function roundedRect(x: number, y: number, side: number, radius: number): string {
    const r = Math.min(radius, side / 2);

    if (r <= 0) {
        return `M${n(x)} ${n(y)}h${n(side)}v${n(side)}h${n(-side)}Z`;
    }

    const straight = side - r * 2;

    return [
        `M${n(x + r)} ${n(y)}`,
        `h${n(straight)}`,
        `a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}`,
        `v${n(straight)}`,
        `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}`,
        `h${n(-straight)}`,
        `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}`,
        `v${n(-straight)}`,
        `a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}`,
        "Z",
    ].join("");
}

/**
 * One module with each corner rounded only where both of its neighbours are
 * light. Adjacent modules therefore fuse into a continuous ribbon while a lone
 * module stays a dot — the whole point of the `smooth` style.
 */
function smoothModule(matrix: QrMatrix, x: number, y: number, originX: number, originY: number) {
    const r = SMOOTH_DOT_RADIUS;
    const up = isDark(matrix, x, y - 1);
    const down = isDark(matrix, x, y + 1);
    const left = isDark(matrix, x - 1, y);
    const right = isDark(matrix, x + 1, y);

    const topLeft = !up && !left;
    const topRight = !up && !right;
    const bottomRight = !down && !right;
    const bottomLeft = !down && !left;

    const left0 = originX + x;
    const top0 = originY + y;
    const right0 = left0 + 1;
    const bottom0 = top0 + 1;

    const corner = (rounded: boolean, toX: number, toY: number) =>
        rounded ? `A${n(r)} ${n(r)} 0 0 1 ${n(toX)} ${n(toY)}` : `L${n(toX)} ${n(toY)}`;

    return [
        `M${n(left0 + (topLeft ? r : 0))} ${n(top0)}`,
        `L${n(right0 - (topRight ? r : 0))} ${n(top0)}`,
        corner(topRight, right0, top0 + r),
        `L${n(right0)} ${n(bottom0 - (bottomRight ? r : 0))}`,
        corner(bottomRight, right0 - r, bottom0),
        `L${n(left0 + (bottomLeft ? r : 0))} ${n(bottom0)}`,
        corner(bottomLeft, left0, bottom0 - r),
        `L${n(left0)} ${n(top0 + (topLeft ? r : 0))}`,
        corner(topLeft, left0 + r, top0),
        "Z",
    ].join("");
}

/** The three 7×7 finder patterns, which the eye styles draw for themselves. */
function isInsideEye(matrix: QrMatrix, x: number, y: number): boolean {
    const far = matrix.size - 7;

    return (x < 7 && y < 7) || (x >= far && y < 7) || (x < 7 && y >= far);
}

function buildBodyPath(matrix: QrMatrix, style: QrStyle): string {
    const parts: string[] = [];

    for (let y = 0; y < matrix.size; y += 1) {
        for (let x = 0; x < matrix.size; x += 1) {
            if (!isDark(matrix, x, y) || isInsideEye(matrix, x, y)) {
                continue;
            }

            if (style.dotStyle === "smooth") {
                parts.push(smoothModule(matrix, x, y, style.margin, style.margin));
                continue;
            }

            const radius = style.dotStyle === "rounded" ? ROUNDED_DOT_RADIUS : 0;

            parts.push(roundedRect(style.margin + x, style.margin + y, 1, radius));
        }
    }

    return parts.join("");
}

/**
 * A finder pattern as a ring plus a centre. The ring is one path with two
 * subpaths and `evenodd`, so the hole stays a hole whatever sits behind it — a
 * light rectangle would show as a white square on a transparent code.
 */
function buildEyePaths(matrix: QrMatrix, style: QrStyle): { ring: string; centre: string } {
    const [outer, inner, middle] = EYE_RADII[style.eyeStyle];
    const far = style.margin + matrix.size - 7;
    const near = style.margin;
    const origins: readonly (readonly [number, number])[] = [
        [near, near],
        [far, near],
        [near, far],
    ];

    const ring: string[] = [];
    const centre: string[] = [];

    for (const [x, y] of origins) {
        ring.push(roundedRect(x, y, 7, outer), roundedRect(x + 1, y + 1, 5, inner));
        centre.push(roundedRect(x + 2, y + 2, 3, middle));
    }

    return { ring: ring.join(""), centre: centre.join("") };
}

/* ------------------------------------------------------------------- svg --- */

const XML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
};

function escapeXml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

export function renderQrSvg(matrix: QrMatrix, style: QrStyle, options: QrSvgOptions = {}): string {
    const extent = matrix.size + style.margin * 2;
    const { ring, centre } = buildEyePaths(matrix, style);
    const parts: string[] = [];

    if (style.background !== TRANSPARENT_BACKGROUND) {
        parts.push(
            `<rect width="${n(extent)}" height="${n(extent)}" fill="${escapeXml(style.background)}"/>`,
        );
    }

    const fill = escapeXml(style.foreground);

    parts.push(
        `<path fill="${fill}" d="${buildBodyPath(matrix, style)}"/>`,
        `<path fill="${fill}" fill-rule="evenodd" d="${ring}"/>`,
        `<path fill="${fill}" d="${centre}"/>`,
    );

    if (style.logo !== null) {
        const side = matrix.size * style.logo.scale;
        const origin = style.margin + (matrix.size - side) / 2;
        const backing = origin - LOGO_PADDING;
        const backingSide = side + LOGO_PADDING * 2;

        parts.push(
            `<path fill="${escapeXml(resolveLogoBacking(style))}" d="${roundedRect(backing, backing, backingSide, 0.6)}"/>`,
            `<image href="${escapeXml(style.logo.dataUrl)}" x="${n(origin)}" y="${n(origin)}" width="${n(side)}" height="${n(side)}" preserveAspectRatio="xMidYMid meet"/>`,
        );
    }

    // `role="img"` with no label: the caller wraps this in an element carrying
    // the localised description, and two competing labels is worse than one.
    const dimensions =
        options.pixelSize === undefined
            ? ""
            : ` width="${options.pixelSize}" height="${options.pixelSize}"`;
    const title = options.title === undefined ? "" : `<title>${escapeXml(options.title)}</title>`;

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(extent)} ${n(extent)}"${dimensions} shape-rendering="${style.dotStyle === "square" && style.eyeStyle === "square" ? "crispEdges" : "geometricPrecision"}">`,
        title,
        parts.join(""),
        "</svg>",
    ].join("");
}
