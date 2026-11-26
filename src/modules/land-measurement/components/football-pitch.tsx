import { cn } from "@/lib/utils";
import { PITCH_LENGTH_METERS, PITCH_WIDTH_METERS } from "../domain/constants";
import type { PlotShape } from "../types";

/** Metres of grass drawn past the touchlines, so the goals and lines are not clipped. */
const MARGIN = 2.5;

const CENTER_X = PITCH_LENGTH_METERS / 2;
const CENTER_Y = PITCH_WIDTH_METERS / 2;

/** The Laws of the Game's markings, in metres. */
const CIRCLE_RADIUS = 9.15;
const PENALTY_DEPTH = 16.5;
const PENALTY_WIDTH = 40.32;
const GOAL_AREA_DEPTH = 5.5;
const GOAL_AREA_WIDTH = 18.32;
const PENALTY_SPOT = 11;
const GOAL_WIDTH = 7.32;
const GOAL_DEPTH = 1.5;
const STRIPES = 10;

/** Half the chord where the penalty arc meets the box: √(9.15² − 5.5²). */
const ARC_HALF_CHORD = Math.sqrt(CIRCLE_RADIUS ** 2 - (PENALTY_DEPTH - PENALTY_SPOT) ** 2);

const LINE = "fill-none stroke-success/60";
const PLOT = "fill-primary/40 stroke-primary";

type FootballPitchProps = {
    /** `full` covers the pitch, a shape covers part of it, `null` leaves it empty. */
    plot: "full" | PlotShape | null;
    className?: string;
};

/**
 * One full-size pitch, 105 × 68 m, with the markings drawn to their real sizes
 * so the plot laid on it reads against things a reader already knows the size
 * of — the centre circle, the penalty box. Geometry is in metres; the SVG
 * scales it, and the lines keep their pixel width at any size.
 */
export function FootballPitch({ plot, className }: FootballPitchProps) {
    const stripe = PITCH_LENGTH_METERS / STRIPES;

    return (
        <svg
            viewBox={`${-MARGIN} ${-MARGIN} ${PITCH_LENGTH_METERS + MARGIN * 2} ${PITCH_WIDTH_METERS + MARGIN * 2}`}
            // `vector-effect` is not inherited, so it is set on every shape:
            // strokes stay this many pixels wide however small the pitch is drawn.
            className={cn(
                "block h-auto w-full [&_*]:[vector-effect:non-scaling-stroke]",
                className,
            )}
            aria-hidden="true"
            focusable="false"
        >
            <rect
                x={-MARGIN}
                y={-MARGIN}
                width={PITCH_LENGTH_METERS + MARGIN * 2}
                height={PITCH_WIDTH_METERS + MARGIN * 2}
                rx={1.5}
                className="fill-success/12"
            />
            {Array.from({ length: STRIPES / 2 }, (_, index) => (
                <rect
                    key={index}
                    x={index * stripe * 2}
                    y={0}
                    width={stripe}
                    height={PITCH_WIDTH_METERS}
                    className="fill-success/10"
                />
            ))}

            <g strokeWidth={1} className={LINE}>
                <rect x={0} y={0} width={PITCH_LENGTH_METERS} height={PITCH_WIDTH_METERS} />
                <line x1={CENTER_X} y1={0} x2={CENTER_X} y2={PITCH_WIDTH_METERS} />
                <circle cx={CENTER_X} cy={CENTER_Y} r={CIRCLE_RADIUS} />
                {([0, PITCH_LENGTH_METERS] as const).map((goalLine) => {
                    const inward = goalLine === 0 ? 1 : -1;
                    const boxEdge = goalLine + inward * PENALTY_DEPTH;

                    return (
                        <g key={goalLine}>
                            <rect
                                x={Math.min(goalLine, boxEdge)}
                                y={CENTER_Y - PENALTY_WIDTH / 2}
                                width={PENALTY_DEPTH}
                                height={PENALTY_WIDTH}
                            />
                            <rect
                                x={Math.min(goalLine, goalLine + inward * GOAL_AREA_DEPTH)}
                                y={CENTER_Y - GOAL_AREA_WIDTH / 2}
                                width={GOAL_AREA_DEPTH}
                                height={GOAL_AREA_WIDTH}
                            />
                            <rect
                                x={goalLine === 0 ? -GOAL_DEPTH : PITCH_LENGTH_METERS}
                                y={CENTER_Y - GOAL_WIDTH / 2}
                                width={GOAL_DEPTH}
                                height={GOAL_WIDTH}
                            />
                            <path
                                d={`M${boxEdge} ${CENTER_Y - ARC_HALF_CHORD} A${CIRCLE_RADIUS} ${CIRCLE_RADIUS} 0 0 ${goalLine === 0 ? 1 : 0} ${boxEdge} ${CENTER_Y + ARC_HALF_CHORD}`}
                            />
                        </g>
                    );
                })}
            </g>
            <g className="fill-success/70">
                <circle cx={CENTER_X} cy={CENTER_Y} r={0.45} />
                <circle cx={PENALTY_SPOT} cy={CENTER_Y} r={0.35} />
                <circle cx={PITCH_LENGTH_METERS - PENALTY_SPOT} cy={CENTER_Y} r={0.35} />
            </g>

            <Plot plot={plot} />
        </svg>
    );
}

function Plot({ plot }: { plot: FootballPitchProps["plot"] }) {
    if (plot === null) {
        return null;
    }

    if (plot === "full") {
        return (
            <rect
                x={0}
                y={0}
                width={PITCH_LENGTH_METERS}
                height={PITCH_WIDTH_METERS}
                strokeWidth={1.5}
                className={PLOT}
            />
        );
    }

    return (
        <rect
            x={plot.x}
            y={plot.y}
            width={plot.width}
            height={plot.height}
            strokeWidth={1.5}
            className={PLOT}
        />
    );
}
