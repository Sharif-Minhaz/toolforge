import { useId } from "react";

import { REFERENCE_SIZES } from "../domain/constants";
import { tileColumns } from "../domain/reference";
import type { ReferenceObject } from "../types";
import { ObjectDrawing } from "./object-drawings";

/** Most tiles ever drawn: no step on the ladder is more than about nine of the last. */
const MAX_TILES = 12;

const DIMENSION = "stroke-muted-foreground/70";

/** Soil dots across a side; enough to read as ground, few enough to stay quiet. */
const SOIL_DOTS_PER_SIDE = 14;

type ReferenceFigureProps = {
    /** The plot, in m². */
    squareMeters: number;
    object: Exclude<ReferenceObject, "football-pitch">;
    /**
     * How many objects to draw — the same rounded count the sentence says, so
     * "about 2" is never drawn as two and a sliver of a third.
     */
    count: number;
    /** The length of one side, localised: "40.1 m". */
    sideLabel: string;
};

/**
 * The plot as a square beside the everyday object it is compared with, both
 * at one scale: "this much land" next to "this many parking spaces". Whole
 * objects are drawn in full; a partly covered last one is faded beyond the
 * share the plot covers. Geometry is in metres and the strokes stay
 * their pixel width at any size.
 *
 * The plot is drawn the way a survey sketch draws one — ground inside, a
 * boundary line, a pillar at each corner, and its sides dimensioned — so it
 * reads as a piece of land rather than a swatch of colour.
 */
export function ReferenceFigure({ squareMeters, object, count, sideLabel }: ReferenceFigureProps) {
    // A pattern needs an id, and two figures on one page must not share one.
    const soilId = `soil-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const { length, width } = REFERENCE_SIZES[object];
    const tiles = Math.min(MAX_TILES, Math.max(1, Math.ceil(count)));
    const whole = Math.min(tiles, Math.floor(count));
    const columns = tileColumns(tiles, length, width);
    const rows = Math.ceil(tiles / columns);
    // Nearly touching, so the block reads as one shape beside the square,
    // with just enough of a gap to count the objects in it.
    const gap = width * 0.04;

    const gridWidth = columns * length + (columns - 1) * gap;
    const gridHeight = rows * width + (rows - 1) * gap;
    const side = Math.sqrt(squareMeters);
    const height = Math.max(side, gridHeight);
    const separation = Math.max(side, gridWidth) * 0.18;
    const pad = height * 0.04;

    // Room above and to the left of the plot for its dimension lines.
    const fontSize = height * 0.06;
    const margin = fontSize * 2.4;
    const plotX = margin;
    const plotY = margin + (height - side) / 2;
    const totalWidth = margin + side + separation + gridWidth;
    const totalHeight = margin + height;
    const pillar = Math.max(side * 0.045, fontSize * 0.35);
    const soil = side / SOIL_DOTS_PER_SIDE;
    const dimensionOffset = fontSize * 0.9;
    const tick = fontSize * 0.35;

    return (
        <svg
            viewBox={`${-pad} ${-pad} ${totalWidth + pad * 2} ${totalHeight + pad * 2}`}
            className="mx-auto block h-auto max-h-80 w-full max-w-3xl [&_*]:[vector-effect:non-scaling-stroke]"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <pattern
                    id={soilId}
                    x={plotX}
                    y={plotY}
                    width={soil}
                    height={soil}
                    patternUnits="userSpaceOnUse"
                >
                    <circle
                        cx={soil / 2}
                        cy={soil / 2}
                        r={soil * 0.09}
                        className="fill-primary/45"
                    />
                    <circle cx={0} cy={0} r={soil * 0.06} className="fill-primary/30" />
                </pattern>
            </defs>

            {/* The plot: ground, its texture, the boundary, a pillar per corner. */}
            <rect x={plotX} y={plotY} width={side} height={side} className="fill-primary/15" />
            <rect x={plotX} y={plotY} width={side} height={side} fill={`url(#${soilId})`} />
            <rect
                x={plotX}
                y={plotY}
                width={side}
                height={side}
                strokeWidth={1.5}
                className="stroke-primary fill-none"
            />
            {[
                [plotX, plotY],
                [plotX + side, plotY],
                [plotX, plotY + side],
                [plotX + side, plotY + side],
            ].map(([cx, cy]) => (
                <rect
                    key={`${cx}-${cy}`}
                    x={cx - pillar / 2}
                    y={cy - pillar / 2}
                    width={pillar}
                    height={pillar}
                    strokeWidth={1}
                    className="fill-card stroke-primary"
                />
            ))}

            {/* Its length along the top, and the same down the left. */}
            <g strokeWidth={1} className={DIMENSION}>
                <line
                    x1={plotX}
                    y1={plotY - dimensionOffset}
                    x2={plotX + side}
                    y2={plotY - dimensionOffset}
                />
                <line
                    x1={plotX}
                    y1={plotY - dimensionOffset - tick}
                    x2={plotX}
                    y2={plotY - dimensionOffset + tick}
                />
                <line
                    x1={plotX + side}
                    y1={plotY - dimensionOffset - tick}
                    x2={plotX + side}
                    y2={plotY - dimensionOffset + tick}
                />
                <line
                    x1={plotX - dimensionOffset}
                    y1={plotY}
                    x2={plotX - dimensionOffset}
                    y2={plotY + side}
                />
                <line
                    x1={plotX - dimensionOffset - tick}
                    y1={plotY}
                    x2={plotX - dimensionOffset + tick}
                    y2={plotY}
                />
                <line
                    x1={plotX - dimensionOffset - tick}
                    y1={plotY + side}
                    x2={plotX - dimensionOffset + tick}
                    y2={plotY + side}
                />
            </g>
            <text
                x={plotX + side / 2}
                y={plotY - dimensionOffset - fontSize * 0.45}
                fontSize={fontSize}
                textAnchor="middle"
                className="fill-muted-foreground font-mono"
            >
                {sideLabel}
            </text>
            <text
                x={plotX - dimensionOffset - fontSize * 0.45}
                y={plotY + side / 2}
                fontSize={fontSize}
                textAnchor="middle"
                transform={`rotate(-90 ${plotX - dimensionOffset - fontSize * 0.45} ${plotY + side / 2})`}
                className="fill-muted-foreground font-mono"
            >
                {sideLabel}
            </text>

            {Array.from({ length: tiles }, (_, index) => {
                const column = index % columns;
                const row = Math.floor(index / columns);

                return (
                    <ObjectTile
                        key={index}
                        object={object}
                        x={margin + side + separation + column * (length + gap)}
                        y={margin + (height - gridHeight) / 2 + row * (width + gap)}
                        covered={index < whole ? 1 : count - whole}
                    />
                );
            })}
        </svg>
    );
}

type TileProps = {
    object: ReferenceFigureProps["object"];
    x: number;
    y: number;
    /** 1 for a whole object; the share covered for the last, partial one. */
    covered: number;
};

/**
 * One object. A partly covered last one is drawn whole but faded, with the
 * covered share drawn over it at full strength and a dashed line where the
 * plot runs out — still recognisable as a bed or a car, and still showing
 * how much of it the plot accounts for.
 */
function ObjectTile({ object, x, y, covered }: TileProps) {
    const clipId = `cover-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const { length, width } = REFERENCE_SIZES[object];
    const placed = `translate(${x} ${y})`;

    if (covered >= 1) {
        return (
            <g transform={placed}>
                <ObjectDrawing object={object} />
            </g>
        );
    }

    // Generous on every side but the right, so posts and goals past the
    // outline on the covered side are not cut off.
    const overhang = width * 0.5;
    const edge = length * covered;

    return (
        <g transform={placed}>
            <clipPath id={clipId}>
                <rect
                    x={-overhang}
                    y={-overhang}
                    width={edge + overhang}
                    height={width + overhang * 2}
                />
            </clipPath>
            <g opacity={0.25}>
                <ObjectDrawing object={object} />
            </g>
            <g clipPath={`url(#${clipId})`}>
                <ObjectDrawing object={object} />
            </g>
            <line
                x1={edge}
                y1={-width * 0.06}
                x2={edge}
                y2={width * 1.06}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                className="stroke-primary"
            />
        </g>
    );
}
