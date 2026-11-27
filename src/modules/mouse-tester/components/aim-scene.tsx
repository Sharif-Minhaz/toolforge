import type { ReactNode } from "react";

import { AIM_ARENA } from "../domain/constants";
import type { AimScene } from "../types";

/**
 * The backdrops behind the aim trainer, drawn in arena units (1000 × 560).
 *
 * Every colour is a theme token — the five chart hues, `foreground`, `card`,
 * `muted-foreground` — at an opacity, never a literal, so each scene repaints
 * itself for dark mode the way the rest of the page does (`docs/design-system.md`).
 * The chart hues stand in for an illustrator's palette: `chart-5` is foliage,
 * `chart-2` water and sky, `chart-3` sun, wood and lamplight, `chart-4` roofs,
 * `chart-1` dusk.
 *
 * Flat shapes on purpose: the scenery is mood, and a target must never be
 * harder to see on one backdrop than on another. Nothing here takes a pointer
 * event — every click goes to the arena underneath.
 */

const W = AIM_ARENA.width;
const H = AIM_ARENA.height;
/** Where land meets sky. */
const HORIZON = 360;

function Sky({ id, top, bottom }: { id: string; top: string; bottom: string }) {
    return (
        <>
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style={{ stopColor: top, stopOpacity: 0.35 }} />
                    <stop offset="1" style={{ stopColor: bottom, stopOpacity: 0.12 }} />
                </linearGradient>
            </defs>
            <rect width={W} height={H} fill={`url(#${id})`} />
        </>
    );
}

function Sun({ x, y, r }: { x: number; y: number; r: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={r * 1.9} className="fill-chart-3/10" />
            <circle cx={x} cy={y} r={r * 1.4} className="fill-chart-3/20" />
            <circle cx={x} cy={y} r={r} className="fill-chart-3/80" />
        </g>
    );
}

function Moon({ x, y, r }: { x: number; y: number; r: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={r * 1.8} className="fill-chart-3/10" />
            <circle cx={x} cy={y} r={r} className="fill-chart-3/70" />
            <circle cx={x + r * 0.35} cy={y - r * 0.2} r={r * 0.85} className="fill-chart-1/25" />
        </g>
    );
}

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
    return (
        <g transform={`translate(${x} ${y}) scale(${s})`} className="fill-card/70">
            <ellipse cx="0" cy="0" rx="46" ry="18" />
            <ellipse cx="-22" cy="-10" rx="22" ry="16" />
            <ellipse cx="14" cy="-16" rx="26" ry="20" />
        </g>
    );
}

function Pine({ x, base, h, tone }: { x: number; base: number; h: number; tone: string }) {
    const w = h * 0.42;

    return (
        <g>
            <rect
                x={x - h * 0.03}
                y={base - h * 0.18}
                width={h * 0.06}
                height={h * 0.18}
                className="fill-chart-3/45"
            />
            <path
                d={`M${x} ${base - h} L${x + w * 0.62} ${base - h * 0.55} L${x + w * 0.36} ${base - h * 0.55} L${x + w} ${base - h * 0.15} L${x - w} ${base - h * 0.15} L${x - w * 0.36} ${base - h * 0.55} L${x - w * 0.62} ${base - h * 0.55} Z`}
                className={tone}
            />
        </g>
    );
}

function RoundTree({ x, base, h }: { x: number; base: number; h: number }) {
    return (
        <g>
            <rect
                x={x - h * 0.05}
                y={base - h * 0.45}
                width={h * 0.1}
                height={h * 0.45}
                className="fill-chart-3/50"
            />
            <circle cx={x} cy={base - h * 0.62} r={h * 0.3} className="fill-chart-5/60" />
            <circle cx={x - h * 0.18} cy={base - h * 0.5} r={h * 0.2} className="fill-chart-5/55" />
            <circle
                cx={x + h * 0.2}
                cy={base - h * 0.52}
                r={h * 0.22}
                className="fill-chart-5/65"
            />
        </g>
    );
}

function DeadTree({ x, base, h }: { x: number; base: number; h: number }) {
    return (
        <path
            d={`M${x} ${base} L${x} ${base - h * 0.6} M${x} ${base - h * 0.45} L${x - h * 0.28} ${base - h * 0.8} M${x - h * 0.15} ${base - h * 0.63} L${x - h * 0.3} ${base - h * 0.6} M${x} ${base - h * 0.6} L${x + h * 0.22} ${base - h} M${x + h * 0.1} ${base - h * 0.78} L${x + h * 0.32} ${base - h * 0.74}`}
            className="stroke-foreground/45"
            strokeWidth={h * 0.045}
            strokeLinecap="round"
            fill="none"
        />
    );
}

function Tombstone({
    x,
    base,
    s,
    cross = false,
}: {
    x: number;
    base: number;
    s: number;
    cross?: boolean;
}) {
    if (cross) {
        return (
            <path
                d={`M${x - 4 * s} ${base} V${base - 34 * s} H${x - 14 * s} V${base - 42 * s} H${x - 4 * s} V${base - 54 * s} H${x + 4 * s} V${base - 42 * s} H${x + 14 * s} V${base - 34 * s} H${x + 4 * s} V${base} Z`}
                className="fill-muted-foreground/45"
            />
        );
    }

    return (
        <g>
            <path
                d={`M${x - 16 * s} ${base} V${base - 34 * s} A${16 * s} ${16 * s} 0 0 1 ${x + 16 * s} ${base - 34 * s} V${base} Z`}
                className="fill-muted-foreground/40"
            />
            <path
                d={`M${x - 7 * s} ${base - 32 * s} H${x + 7 * s} M${x - 7 * s} ${base - 24 * s} H${x + 4 * s}`}
                className="stroke-foreground/25"
                strokeWidth={2 * s}
            />
        </g>
    );
}

function House({ x, base, w, h }: { x: number; base: number; w: number; h: number }) {
    return (
        <g>
            <rect
                x={x}
                y={base - h}
                width={w}
                height={h}
                className="fill-card/85 stroke-foreground/15"
                strokeWidth={1.5}
            />
            <path
                d={`M${x - w * 0.1} ${base - h} L${x + w / 2} ${base - h - w * 0.45} L${x + w * 1.1} ${base - h} Z`}
                className="fill-chart-4/65"
            />
            <rect
                x={x + w * 0.16}
                y={base - h * 0.68}
                width={w * 0.22}
                height={h * 0.26}
                className="fill-chart-3/55"
            />
            <rect
                x={x + w * 0.58}
                y={base - h * 0.55}
                width={w * 0.24}
                height={h * 0.55}
                className="fill-chart-3/35"
            />
        </g>
    );
}

function Ground({ y, tone }: { y: number; tone: string }) {
    return (
        <path
            d={`M0 ${y} Q ${W * 0.25} ${y - 18} ${W * 0.5} ${y} T ${W} ${y} V${H} H0 Z`}
            className={tone}
        />
    );
}

function Forest() {
    return (
        <>
            <Sky id="aim-sky-forest" top="var(--chart-2)" bottom="var(--chart-3)" />
            <Sun x={830} y={110} r={46} />
            <Cloud x={220} y={90} s={1.1} />
            <Cloud x={560} y={60} s={0.8} />
            <path
                d={`M0 ${HORIZON} Q 180 250 360 ${HORIZON - 30} T 720 ${HORIZON - 20} T ${W} ${HORIZON - 40} V${H} H0 Z`}
                className="fill-chart-5/20"
            />
            {[60, 150, 250, 470, 640, 760, 900].map((x, index) => (
                <Pine
                    key={x}
                    x={x}
                    base={HORIZON + 10}
                    h={120 + (index % 3) * 30}
                    tone="fill-chart-5/40"
                />
            ))}
            <Ground y={HORIZON + 30} tone="fill-chart-5/30" />
            {[30, 330, 560, 960].map((x, index) => (
                <Pine key={x} x={x} base={H} h={210 + (index % 2) * 50} tone="fill-chart-5/65" />
            ))}
            <ellipse cx={180} cy={H - 10} rx={70} ry={26} className="fill-chart-5/50" />
            <ellipse cx={760} cy={H - 6} rx={90} ry={30} className="fill-chart-5/45" />
        </>
    );
}

function Lake() {
    return (
        <>
            <Sky id="aim-sky-lake" top="var(--chart-2)" bottom="var(--chart-4)" />
            <Sun x={500} y={HORIZON - 70} r={52} />
            <Cloud x={160} y={80} s={1} />
            <Cloud x={820} y={110} s={1.2} />
            <path
                d={`M0 ${HORIZON} L150 190 L260 290 L380 160 L520 ${HORIZON - 40} L660 210 L800 140 L${W} ${HORIZON - 30} V${HORIZON} Z`}
                className="fill-muted-foreground/30"
            />
            <path
                d="M380 160 L350 200 L372 196 L392 214 L410 190 Z M800 140 L770 180 L792 176 L812 196 L830 172 Z"
                className="fill-card/80"
            />
            <rect y={HORIZON} width={W} height={H - HORIZON} className="fill-chart-2/30" />
            {[20, 60, 100, 140].map((dy, index) => (
                <path
                    key={dy}
                    d={`M${120 + index * 60} ${HORIZON + dy} h${180 - index * 20} M${560 - index * 30} ${HORIZON + dy + 14} h${140 + index * 25}`}
                    className="stroke-card/60"
                    strokeWidth={3}
                    strokeLinecap="round"
                />
            ))}
            <path
                d={`M0 ${H} V${H - 70} Q 90 ${H - 110} 200 ${H - 60} T 330 ${H} Z`}
                className="fill-chart-5/55"
            />
            <path
                d={`M${W} ${H} V${H - 90} Q ${W - 120} ${H - 120} ${W - 230} ${H - 50} T ${W - 330} ${H} Z`}
                className="fill-chart-5/50"
            />
            {[40, 70, 95, 900, 930, 960].map((x) => (
                <path
                    key={x}
                    d={`M${x} ${H - 40} q 4 -40 10 -60`}
                    className="stroke-chart-5/80"
                    strokeWidth={4}
                    fill="none"
                    strokeLinecap="round"
                />
            ))}
        </>
    );
}

function Graveyard() {
    return (
        <>
            <Sky id="aim-sky-graveyard" top="var(--chart-1)" bottom="var(--chart-4)" />
            <Moon x={180} y={110} r={44} />
            {[
                [620, 70],
                [700, 130],
                [860, 60],
                [930, 150],
                [420, 90],
            ].map(([x, y]) => (
                <circle key={x} cx={x} cy={y} r={2.5} className="fill-chart-3/70" />
            ))}
            <path
                d={`M0 ${HORIZON} Q 250 300 500 ${HORIZON - 10} T ${W} ${HORIZON - 30} V${H} H0 Z`}
                className="fill-chart-1/20"
            />
            <path
                d={`M640 ${HORIZON - 10} V250 L700 205 L760 250 V${HORIZON - 10} Z M690 ${HORIZON - 10} v-40 h20 v40 Z`}
                className="fill-foreground/25"
            />
            <path
                d="M700 205 V180 M690 190 H710"
                className="stroke-foreground/30"
                strokeWidth={4}
            />
            <DeadTree x={90} base={HORIZON + 40} h={240} />
            <DeadTree x={900} base={HORIZON + 50} h={200} />
            <Ground y={HORIZON + 40} tone="fill-chart-5/20" />
            {[150, 260, 380, 520, 610, 740, 850].map((x, index) => (
                <Tombstone
                    key={x}
                    x={x}
                    base={HORIZON + 70 + (index % 3) * 40}
                    s={1 + (index % 2) * 0.3}
                    cross={index % 3 === 1}
                />
            ))}
            <path
                d={`M0 ${H - 40} H${W} ${Array.from({ length: 26 }, (_, index) => `M${index * 40 + 10} ${H} V${H - 70} l6 -10 l6 10 V${H}`).join(" ")}`}
                className="stroke-foreground/30"
                strokeWidth={3}
                fill="none"
            />
            <ellipse cx={300} cy={H - 70} rx={260} ry={22} className="fill-card/35" />
            <ellipse cx={780} cy={H - 90} rx={220} ry={18} className="fill-card/30" />
        </>
    );
}

function Village() {
    return (
        <>
            <Sky id="aim-sky-village" top="var(--chart-2)" bottom="var(--chart-3)" />
            <Sun x={140} y={100} r={40} />
            <Cloud x={480} y={80} s={0.9} />
            <Cloud x={800} y={70} s={1.15} />
            <path
                d={`M0 ${HORIZON - 10} Q 300 280 620 ${HORIZON - 20} T ${W} ${HORIZON - 50} V${H} H0 Z`}
                className="fill-chart-5/25"
            />
            <House x={560} base={HORIZON + 10} w={110} h={80} />
            <House x={720} base={HORIZON + 20} w={140} h={96} />
            <RoundTree x={880} base={HORIZON + 20} h={150} />
            <RoundTree x={500} base={HORIZON + 10} h={110} />
            <Ground y={HORIZON + 20} tone="fill-chart-5/35" />
            <path
                d={`M380 ${HORIZON + 20} C 330 430 520 460 430 ${H} H600 C 690 470 470 430 470 ${HORIZON + 20} Z`}
                className="fill-chart-2/45"
            />
            <path
                d={`M372 470 Q 470 440 590 470`}
                className="stroke-chart-3/60"
                strokeWidth={10}
                fill="none"
                strokeLinecap="round"
            />
            <House x={120} base={H - 40} w={150} h={100} />
            <RoundTree x={60} base={H} h={190} />
            <RoundTree x={330} base={H} h={150} />
            <RoundTree x={920} base={H} h={200} />
            {[650, 700, 750, 800].map((x) => (
                <path
                    key={x}
                    d={`M${x} ${H - 20} v-34 M${x - 26} ${H - 44} h52`}
                    className="stroke-chart-3/45"
                    strokeWidth={4}
                />
            ))}
        </>
    );
}

const SCENES: Record<AimScene, () => ReactNode> = {
    forest: Forest,
    lake: Lake,
    graveyard: Graveyard,
    village: Village,
};

export function AimSceneBackdrop({ scene }: { scene: AimScene }) {
    const Scene = SCENES[scene];

    return (
        <g aria-hidden="true" className="pointer-events-none">
            <Scene />
        </g>
    );
}
