import type { ReactNode } from "react";

import { AIM_VILLAINS, type AimTarget, type AimVillain } from "../types";

/**
 * The characters a target wears. Original drawings of stock archetypes, made
 * for this page — a ghost, a zombie, a masked bandit, a robot, an alien, a bat
 * and a carved pumpkin — rather than any studio's licensed villain.
 *
 * Each is drawn in a unit circle (radius 1 about the origin) and scaled to the
 * target, so the drawing always fills exactly the circle that counts as a hit:
 * what looks hittable is what is hittable, and Fitts's throughput stays honest.
 * Behind every character sits a soft disc and a dashed rim, so it reads on a
 * busy backdrop in both themes.
 *
 * Colours are theme tokens only (see `aim-scene.tsx`); strokes are in unit
 * space, so they thicken with the target the way a drawing would.
 */

const LINE = 0.06;

function Ghost() {
    return (
        <g>
            <path
                d="M-0.62 0.72 V-0.08 A0.62 0.62 0 0 1 0.62 -0.08 V0.72 Q0.47 0.56 0.31 0.72 Q0.16 0.88 0 0.72 Q-0.16 0.56 -0.31 0.72 Q-0.47 0.88 -0.62 0.72 Z"
                className="fill-chart-2/35 stroke-chart-2"
                strokeWidth={LINE}
            />
            <ellipse cx="-0.22" cy="-0.12" rx="0.11" ry="0.17" className="fill-foreground/80" />
            <ellipse cx="0.22" cy="-0.12" rx="0.11" ry="0.17" className="fill-foreground/80" />
            <ellipse cx="0" cy="0.25" rx="0.12" ry="0.15" className="fill-foreground/70" />
        </g>
    );
}

function Zombie() {
    return (
        <g>
            <rect
                x="-0.6"
                y="-0.62"
                width="1.2"
                height="1.3"
                rx="0.42"
                className="fill-chart-5/70 stroke-chart-5"
                strokeWidth={LINE}
            />
            <path
                d="M-0.55 -0.35 L-0.4 -0.72 L-0.2 -0.45 L0 -0.78 L0.18 -0.47 L0.38 -0.74 L0.55 -0.35 Z"
                className="fill-foreground/60"
            />
            <path
                d="M-0.42 -0.28 H0.05 M-0.33 -0.34 V-0.22 M-0.18 -0.34 V-0.22 M-0.03 -0.34 V-0.22"
                className="stroke-foreground/60"
                strokeWidth={0.04}
            />
            <circle cx="-0.24" cy="0.02" r="0.16" className="fill-card" />
            <circle cx="-0.2" cy="0.05" r="0.07" className="fill-foreground/85" />
            <path
                d="M0.12 -0.08 L0.36 0.14 M0.36 -0.08 L0.12 0.14"
                className="stroke-foreground/80"
                strokeWidth={0.07}
                strokeLinecap="round"
            />
            <path
                d="M-0.32 0.4 L-0.2 0.32 L-0.08 0.42 L0.04 0.32 L0.16 0.42 L0.3 0.32"
                className="stroke-foreground/80"
                strokeWidth={0.06}
                fill="none"
                strokeLinejoin="round"
            />
        </g>
    );
}

function Bandit() {
    return (
        <g>
            <circle
                cx="0"
                cy="0.12"
                r="0.6"
                className="fill-chart-3/55 stroke-chart-3"
                strokeWidth={LINE}
            />
            <path d="M-0.78 -0.3 H0.78 L0.6 -0.42 H-0.6 Z" className="fill-foreground/80" />
            <path
                d="M-0.42 -0.42 L-0.36 -0.82 H0.36 L0.42 -0.42 Z"
                className="fill-foreground/75"
            />
            <rect x="-0.36" y="-0.52" width="0.72" height="0.07" className="fill-chart-4/80" />
            <rect
                x="-0.62"
                y="-0.08"
                width="1.24"
                height="0.3"
                rx="0.12"
                className="fill-foreground/85"
            />
            <ellipse cx="-0.22" cy="0.07" rx="0.11" ry="0.07" className="fill-card" />
            <ellipse cx="0.22" cy="0.07" rx="0.11" ry="0.07" className="fill-card" />
            <path
                d="M-0.26 0.42 Q-0.12 0.32 0 0.4 Q0.12 0.32 0.26 0.42"
                className="stroke-foreground/80"
                strokeWidth={0.08}
                fill="none"
                strokeLinecap="round"
            />
        </g>
    );
}

function Robot() {
    return (
        <g>
            <path d="M0 -0.58 V-0.78" className="stroke-foreground/60" strokeWidth={0.05} />
            <circle cx="0" cy="-0.82" r="0.08" className="fill-chart-4" />
            <rect
                x="-0.6"
                y="-0.58"
                width="1.2"
                height="1.12"
                rx="0.2"
                className="fill-muted-foreground/45 stroke-foreground/50"
                strokeWidth={LINE}
            />
            <rect
                x="-0.76"
                y="-0.16"
                width="0.16"
                height="0.32"
                rx="0.05"
                className="fill-muted-foreground/60"
            />
            <rect
                x="0.6"
                y="-0.16"
                width="0.16"
                height="0.32"
                rx="0.05"
                className="fill-muted-foreground/60"
            />
            <rect x="-0.4" y="-0.3" width="0.28" height="0.2" rx="0.05" className="fill-chart-2" />
            <rect x="0.12" y="-0.3" width="0.28" height="0.2" rx="0.05" className="fill-chart-2" />
            <rect
                x="-0.34"
                y="0.16"
                width="0.68"
                height="0.2"
                rx="0.05"
                className="fill-foreground/70"
            />
            <path
                d="M-0.17 0.16 V0.36 M0 0.16 V0.36 M0.17 0.16 V0.36"
                className="stroke-muted-foreground"
                strokeWidth={0.04}
            />
        </g>
    );
}

function Alien() {
    return (
        <g>
            <path
                d="M-0.25 -0.55 L-0.45 -0.85 M0.25 -0.55 L0.45 -0.85"
                className="stroke-chart-1"
                strokeWidth={0.05}
            />
            <circle cx="-0.45" cy="-0.85" r="0.07" className="fill-chart-3" />
            <circle cx="0.45" cy="-0.85" r="0.07" className="fill-chart-3" />
            <path
                d="M0 -0.62 C0.55 -0.62 0.68 -0.15 0.5 0.2 C0.35 0.5 0.15 0.72 0 0.72 C-0.15 0.72 -0.35 0.5 -0.5 0.2 C-0.68 -0.15 -0.55 -0.62 0 -0.62 Z"
                className="fill-chart-1/60 stroke-chart-1"
                strokeWidth={LINE}
            />
            <path
                d="M-0.08 -0.02 C-0.2 -0.2 -0.42 -0.22 -0.44 -0.06 C-0.44 0.08 -0.24 0.12 -0.08 -0.02 Z"
                className="fill-foreground/85"
            />
            <path
                d="M0.08 -0.02 C0.2 -0.2 0.42 -0.22 0.44 -0.06 C0.44 0.08 0.24 0.12 0.08 -0.02 Z"
                className="fill-foreground/85"
            />
            <circle cx="-0.3" cy="-0.1" r="0.04" className="fill-card" />
            <circle cx="0.3" cy="-0.1" r="0.04" className="fill-card" />
            <path
                d="M-0.1 0.42 Q0 0.48 0.1 0.42"
                className="stroke-foreground/70"
                strokeWidth={0.05}
                fill="none"
                strokeLinecap="round"
            />
        </g>
    );
}

function Bat() {
    return (
        <g>
            <path
                d="M-0.2 -0.05 C-0.45 -0.45 -0.8 -0.35 -0.92 -0.05 C-0.78 -0.1 -0.7 0 -0.68 0.12 C-0.58 0.02 -0.48 0.04 -0.44 0.16 C-0.36 0.06 -0.26 0.08 -0.2 0.2 Z"
                className="fill-foreground/70"
            />
            <path
                d="M0.2 -0.05 C0.45 -0.45 0.8 -0.35 0.92 -0.05 C0.78 -0.1 0.7 0 0.68 0.12 C0.58 0.02 0.48 0.04 0.44 0.16 C0.36 0.06 0.26 0.08 0.2 0.2 Z"
                className="fill-foreground/70"
            />
            <path
                d="M-0.22 -0.32 L-0.14 -0.56 L-0.04 -0.34 Z M0.22 -0.32 L0.14 -0.56 L0.04 -0.34 Z"
                className="fill-foreground/80"
            />
            <ellipse cx="0" cy="0.02" rx="0.28" ry="0.38" className="fill-foreground/80" />
            <circle cx="-0.1" cy="-0.08" r="0.06" className="fill-chart-4" />
            <circle cx="0.1" cy="-0.08" r="0.06" className="fill-chart-4" />
            <path
                d="M-0.07 0.12 L-0.04 0.22 L-0.01 0.12 Z M0.01 0.12 L0.04 0.22 L0.07 0.12 Z"
                className="fill-card"
            />
        </g>
    );
}

function Pumpkin() {
    return (
        <g>
            <path
                d="M0 -0.5 C0 -0.62 0.06 -0.74 0.16 -0.8"
                className="stroke-chart-5"
                strokeWidth={0.1}
                fill="none"
                strokeLinecap="round"
            />
            <ellipse cx="-0.32" cy="0.08" rx="0.4" ry="0.56" className="fill-chart-3/75" />
            <ellipse cx="0.32" cy="0.08" rx="0.4" ry="0.56" className="fill-chart-3/75" />
            <ellipse
                cx="0"
                cy="0.08"
                rx="0.36"
                ry="0.6"
                className="fill-chart-3/90 stroke-chart-3"
                strokeWidth={0.03}
            />
            <path
                d="M-0.4 -0.12 L-0.2 -0.24 L-0.14 -0.04 Z M0.4 -0.12 L0.2 -0.24 L0.14 -0.04 Z"
                className="fill-foreground/80"
            />
            <path d="M-0.06 0.02 L0 -0.08 L0.06 0.02 Z" className="fill-foreground/80" />
            <path
                d="M-0.44 0.22 Q0 0.56 0.44 0.22 L0.32 0.3 L0.24 0.22 L0.14 0.34 L0.04 0.24 L-0.06 0.34 L-0.16 0.24 L-0.26 0.32 L-0.34 0.24 Z"
                className="fill-foreground/80"
            />
        </g>
    );
}

const DRAWINGS: Record<AimVillain, () => ReactNode> = {
    ghost: Ghost,
    zombie: Zombie,
    bandit: Bandit,
    robot: Robot,
    alien: Alien,
    bat: Bat,
    pumpkin: Pumpkin,
};

export function AimVillainTarget({ target }: { target: AimTarget }) {
    const Drawing = DRAWINGS[AIM_VILLAINS[target.variant] ?? "ghost"];

    return (
        <g transform={`translate(${target.x} ${target.y}) scale(${target.radius})`}>
            {/* The hit area, made visible: a soft disc and a dashed rim. */}
            <circle r="1" className="fill-card/60" />
            <circle
                r="0.98"
                className="stroke-primary/70"
                strokeWidth={0.05}
                strokeDasharray="0.18 0.12"
                fill="none"
            />
            <g transform="scale(0.86)">
                <Drawing />
            </g>
        </g>
    );
}
