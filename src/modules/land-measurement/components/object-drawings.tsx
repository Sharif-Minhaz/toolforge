import type { ReferenceObject } from "../types";

/**
 * The comparison objects, top-down, each drawn in its own metres from its
 * top-left corner with the long side running left to right. Real proportions
 * throughout — a bed's pillow is a real pillow's size, a car is 4.4 × 1.8 m in
 * a 5 × 2.5 m bay — because a drawing that is the wrong shape stops being the
 * thing it is meant to be recognised as. Colours are chart tokens, so both
 * themes carry them.
 */

const OUTLINE = "stroke-foreground/35";

/** A single bed, headboard on the left. */
function SingleBed() {
    return (
        <g strokeWidth={1}>
            {/* Frame, and the wooden headboard across its head. */}
            <rect
                x={0}
                y={0}
                width={1.9}
                height={0.9}
                rx={0.04}
                className={`fill-muted ${OUTLINE}`}
            />
            <rect
                x={0}
                y={0}
                width={0.09}
                height={0.9}
                rx={0.02}
                className="fill-chart-3/70 stroke-chart-3"
            />
            {/* Mattress. */}
            <rect
                x={0.11}
                y={0.04}
                width={1.76}
                height={0.82}
                rx={0.05}
                className={`fill-card ${OUTLINE}`}
            />
            {/* Pillow, with the dip a head leaves in it. */}
            <rect
                x={0.16}
                y={0.12}
                width={0.4}
                height={0.66}
                rx={0.1}
                className={`fill-card ${OUTLINE}`}
            />
            <path d="M0.36 0.2 Q0.3 0.45 0.36 0.7" className="stroke-foreground/20 fill-none" />
            {/* Blanket, turned back at the top, with quilting across it. */}
            <rect
                x={0.72}
                y={0.04}
                width={1.15}
                height={0.82}
                rx={0.05}
                className="fill-chart-1/35 stroke-chart-1/70"
            />
            <rect
                x={0.72}
                y={0.04}
                width={0.16}
                height={0.82}
                rx={0.04}
                className="fill-chart-1/55 stroke-chart-1/70"
            />
            {[1.08, 1.33, 1.58].map((at) => (
                <line key={at} x1={at} y1={0.06} x2={at} y2={0.84} className="stroke-chart-1/40" />
            ))}
            {[0.31, 0.59].map((at) => (
                <line key={at} x1={0.9} y1={at} x2={1.85} y2={at} className="stroke-chart-1/40" />
            ))}
        </g>
    );
}

/** A marked parking bay with a car in it, bonnet to the right. */
function ParkingSpace() {
    // The car, centred in the bay.
    const cx = 0.3;
    const cy = 0.35;

    return (
        <g strokeWidth={1}>
            {/* Asphalt, and the painted lines on three sides; the front is open. */}
            <rect x={0} y={0} width={5} height={2.5} className="fill-muted stroke-none" />
            <g strokeWidth={2} className="stroke-foreground/70">
                <line x1={0} y1={0.03} x2={5} y2={0.03} />
                <line x1={0} y1={2.47} x2={5} y2={2.47} />
                <line x1={0.03} y1={0} x2={0.03} y2={2.5} />
            </g>
            <g transform={`translate(${cx} ${cy})`}>
                {/* Wheels, under the body so only their outer edges show. */}
                {[0.75, 3.3].flatMap((along) =>
                    [-0.08, 1.63].map((across) => (
                        <rect
                            key={`${along}-${across}`}
                            x={along}
                            y={across}
                            width={0.66}
                            height={0.25}
                            rx={0.06}
                            className="fill-foreground/80 stroke-none"
                        />
                    )),
                )}
                {/* Wing mirrors. */}
                <ellipse
                    cx={2.95}
                    cy={-0.06}
                    rx={0.1}
                    ry={0.08}
                    className="fill-chart-2 stroke-none"
                />
                <ellipse
                    cx={2.95}
                    cy={1.86}
                    rx={0.1}
                    ry={0.08}
                    className="fill-chart-2 stroke-none"
                />
                {/* Body. */}
                <rect
                    x={0}
                    y={0}
                    width={4.4}
                    height={1.8}
                    rx={0.5}
                    className="fill-chart-2/80 stroke-chart-2"
                />
                {/* Bonnet crease and boot lid. */}
                <path d="M3.4 0.35 Q4.1 0.9 3.4 1.45" className="stroke-foreground/25 fill-none" />
                {/* Windscreen, roof, rear window. */}
                <path
                    d="M2.85 0.22 L3.35 0.12 L3.35 1.68 L2.85 1.58 Z"
                    className="fill-foreground/45 stroke-none"
                />
                <rect
                    x={1.4}
                    y={0.22}
                    width={1.45}
                    height={1.36}
                    rx={0.12}
                    className="fill-chart-2 stroke-none"
                />
                <path
                    d="M1.4 0.22 L1.05 0.16 L1.05 1.64 L1.4 1.58 Z"
                    className="fill-foreground/45 stroke-none"
                />
                {/* Headlights and tail lights. */}
                <rect
                    x={4.22}
                    y={0.18}
                    width={0.12}
                    height={0.3}
                    rx={0.04}
                    className="fill-chart-3 stroke-none"
                />
                <rect
                    x={4.22}
                    y={1.32}
                    width={0.12}
                    height={0.3}
                    rx={0.04}
                    className="fill-chart-3 stroke-none"
                />
                <rect
                    x={0.06}
                    y={0.18}
                    width={0.1}
                    height={0.3}
                    rx={0.04}
                    className="fill-chart-4 stroke-none"
                />
                <rect
                    x={0.06}
                    y={1.32}
                    width={0.1}
                    height={0.3}
                    rx={0.04}
                    className="fill-chart-4 stroke-none"
                />
            </g>
        </g>
    );
}

const COURT_SURFACE = "fill-success/15 stroke-success/80";
const COURT_LINE = "fill-none stroke-success/80";

/** BWF doubles court: net, short service lines 1.98 m out, centre lines, doubles long service lines. */
function BadmintonCourt() {
    const l = 13.4;
    const w = 6.1;

    return (
        <g strokeWidth={1}>
            <rect x={0} y={0} width={l} height={w} className={COURT_SURFACE} />
            <g className={COURT_LINE}>
                <line x1={0} y1={0.46} x2={l} y2={0.46} />
                <line x1={0} y1={w - 0.46} x2={l} y2={w - 0.46} />
                <line x1={0.76} y1={0} x2={0.76} y2={w} />
                <line x1={l - 0.76} y1={0} x2={l - 0.76} y2={w} />
                <line x1={l / 2 - 1.98} y1={0} x2={l / 2 - 1.98} y2={w} />
                <line x1={l / 2 + 1.98} y1={0} x2={l / 2 + 1.98} y2={w} />
                <line x1={0} y1={w / 2} x2={l / 2 - 1.98} y2={w / 2} />
                <line x1={l / 2 + 1.98} y1={w / 2} x2={l} y2={w / 2} />
            </g>
            {/* The net, with its posts. */}
            <line
                x1={l / 2}
                y1={-0.2}
                x2={l / 2}
                y2={w + 0.2}
                strokeWidth={2}
                className="stroke-foreground/70"
            />
        </g>
    );
}

/** ITF doubles court: singles sidelines, service lines 6.4 m out, centre service line, net. */
function TennisCourt() {
    const l = 23.77;
    const w = 10.97;

    return (
        <g strokeWidth={1}>
            <rect
                x={0}
                y={0}
                width={l}
                height={w}
                className="fill-chart-2/20 stroke-foreground/60"
            />
            <g className="stroke-foreground/60 fill-none">
                <line x1={0} y1={1.37} x2={l} y2={1.37} />
                <line x1={0} y1={w - 1.37} x2={l} y2={w - 1.37} />
                <line x1={l / 2 - 6.4} y1={1.37} x2={l / 2 - 6.4} y2={w - 1.37} />
                <line x1={l / 2 + 6.4} y1={1.37} x2={l / 2 + 6.4} y2={w - 1.37} />
                <line x1={l / 2 - 6.4} y1={w / 2} x2={l / 2 + 6.4} y2={w / 2} />
                <line x1={0} y1={w / 2} x2={0.3} y2={w / 2} />
                <line x1={l - 0.3} y1={w / 2} x2={l} y2={w / 2} />
            </g>
            <line
                x1={l / 2}
                y1={-0.9}
                x2={l / 2}
                y2={w + 0.9}
                strokeWidth={2}
                className="stroke-foreground/80"
            />
        </g>
    );
}

/** FIFA futsal court at its largest: halfway line, centre circle, penalty arcs, goals. */
function FutsalCourt() {
    const l = 40;
    const w = 20;

    return (
        <g strokeWidth={1}>
            <rect x={0} y={0} width={l} height={w} className={COURT_SURFACE} />
            <g className={COURT_LINE}>
                <line x1={l / 2} y1={0} x2={l / 2} y2={w} />
                <circle cx={l / 2} cy={w / 2} r={3} />
                {/* Penalty areas: 6 m quarter circles joined by a 3.16 m line. */}
                <path
                    d={`M0 ${w / 2 - 7.58} A6 6 0 0 1 6 ${w / 2 - 1.58} L6 ${w / 2 + 1.58} A6 6 0 0 1 0 ${w / 2 + 7.58}`}
                />
                <path
                    d={`M${l} ${w / 2 - 7.58} A6 6 0 0 0 ${l - 6} ${w / 2 - 1.58} L${l - 6} ${w / 2 + 1.58} A6 6 0 0 0 ${l} ${w / 2 + 7.58}`}
                />
            </g>
            <rect
                x={-0.8}
                y={w / 2 - 1.5}
                width={0.8}
                height={3}
                className="stroke-foreground/70 fill-none"
            />
            <rect
                x={l}
                y={w / 2 - 1.5}
                width={0.8}
                height={3}
                className="stroke-foreground/70 fill-none"
            />
        </g>
    );
}

export function ObjectDrawing({ object }: { object: Exclude<ReferenceObject, "football-pitch"> }) {
    switch (object) {
        case "single-bed":
            return <SingleBed />;
        case "parking-space":
            return <ParkingSpace />;
        case "badminton-court":
            return <BadmintonCourt />;
        case "tennis-court":
            return <TennisCourt />;
        case "futsal-court":
            return <FutsalCourt />;
    }
}
