"use client";

import { IconCloud, IconDeviceLaptop } from "@tabler/icons-react";
import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { approach, type Flow, streamPace } from "../domain/signal";

/** What colour the link takes: one per direction, so the tiles and the trace agree. */
export type LinkTone = "idle" | "latency" | "download" | "upload" | "done";

/**
 * The canvas paints in its own CSS `color`, so a theme token drives it and a
 * theme switch repaints it. Download is `--primary`, upload the second chart
 * colour, the round trip plain foreground — two series, one neutral.
 */
const TONE_COLOUR: Readonly<Record<LinkTone, string>> = {
    idle: "text-muted-foreground",
    latency: "text-foreground",
    download: "text-primary",
    upload: "text-chart-2",
    done: "text-primary",
};

/** Lane offsets from the centre line, as a share of the bulge. */
const LANES = [-1, -0.5, 0, 0.5, 1] as const;
/** Centre of each node, in CSS pixels from its edge of the canvas: half of `size-11`. */
const NODE_CENTRE = 22;
const LEVEL_HALF_LIFE_MS = 280;
const PING_TRIP_MS = 520;
const PING_REST_MS = 240;
const RING_MS = 720;
const MAX_PACKETS = 240;
const STREAK_STEPS = 6;

type Packet = {
    readonly lane: number;
    readonly direction: 1 | -1;
    readonly travel: number;
    /** 0 at the reader's node, 1 at the edge's. */
    t: number;
};

type Ring = { readonly side: 0 | 1; age: number };

type Scene = {
    readonly packets: Packet[];
    readonly rings: Ring[];
    level: number;
    spawnDebt: number;
    /** Milliseconds into the current ping cycle. */
    pingClock: number;
};

type Geometry = {
    readonly ratio: number;
    readonly x0: number;
    readonly x1: number;
    readonly cy: number;
    readonly bulge: number;
};

/**
 * The link between the reader and Cloudflare's edge, alive while a test runs:
 * a ping bouncing for the round trip, then packets streaming in for a download
 * and out for an upload — more of them, faster and longer, as the measured
 * rate climbs. Purely decorative; the numbers beside it carry the meaning.
 *
 * The frame loop runs only while something moves, and not at all for a reader
 * who has asked for reduced motion: they get a still frame per state.
 */
export function LinkStage({ flow, tone }: { flow: Flow; tone: LinkTone }) {
    const t = useTranslations("speedTest.workbench");
    const reduceMotion = useReducedMotion() ?? false;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const flowRef = useRef(flow);
    const wakeRef = useRef<() => void>(() => undefined);

    // `tone` is here for the still frame: its colour class has changed by the
    // time this runs, and a loop that is not running would not repaint it.
    useEffect(() => {
        flowRef.current = flow;
        wakeRef.current();
    }, [flow, tone]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const drawing = canvas?.getContext("2d") ?? null;

        if (canvas === null || drawing === null) {
            return;
        }

        const scene: Scene = { packets: [], rings: [], level: 0, spawnDebt: 0, pingClock: 0 };
        let frame = 0;
        let last = 0;

        const paint = () => {
            const geometry = fit(canvas);

            drawing.clearRect(0, 0, canvas.width, canvas.height);
            drawing.strokeStyle = getComputedStyle(canvas).color;
            drawing.fillStyle = drawing.strokeStyle;
            drawLanes(drawing, geometry, flowRef.current);

            if (reduceMotion) {
                drawStill(drawing, geometry, flowRef.current);
                return;
            }

            drawScene(drawing, geometry, scene, flowRef.current);
        };

        const tick = (now: number) => {
            const elapsed = last === 0 ? 16 : Math.min(now - last, 64);

            last = now;
            advance(scene, flowRef.current, elapsed);
            paint();

            const moving =
                flowRef.current.mode !== "still" ||
                scene.packets.length > 0 ||
                scene.rings.length > 0;

            frame = moving ? requestAnimationFrame(tick) : 0;

            if (!moving) {
                last = 0;
            }
        };

        const wake = () => {
            if (reduceMotion) {
                paint();
                return;
            }

            if (frame === 0) {
                frame = requestAnimationFrame(tick);
            }
        };

        wakeRef.current = wake;
        wake();

        // A still frame has to be repainted when the box resizes or the theme
        // flips; a running loop picks both up on its next frame anyway.
        const resize = new ResizeObserver(() => frame === 0 && paint());
        const theme = new MutationObserver(() => frame === 0 && paint());

        resize.observe(canvas);
        theme.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style", "data-theme"],
        });

        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            theme.disconnect();
            wakeRef.current = () => undefined;
        };
    }, [reduceMotion]);

    return (
        <div aria-hidden="true" className="flex flex-col gap-1.5">
            <div className="relative flex h-24 items-center justify-between">
                <canvas
                    ref={canvasRef}
                    // No colour transition: a still frame reads the colour once,
                    // and would keep a half-way colour.
                    className={cn("absolute inset-0 size-full", TONE_COLOUR[tone])}
                />
                <LinkNode tone={tone} active={flow.mode === "stream" && flow.direction === "in"}>
                    <IconDeviceLaptop className="size-5" stroke={1.7} />
                </LinkNode>
                <LinkNode tone={tone} active={flow.mode === "stream" && flow.direction === "out"}>
                    <IconCloud className="size-5" stroke={1.7} />
                </LinkNode>
            </div>
            <div className="text-muted-foreground flex justify-between text-xs leading-[1.3]">
                <span>{t("nodeYou")}</span>
                <span>{t("nodeEdge")}</span>
            </div>
        </div>
    );
}

/** One end of the link. The receiving end takes the link's colour. */
function LinkNode({
    tone,
    active,
    children,
}: {
    tone: LinkTone;
    active: boolean;
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                "bg-card relative flex size-11 items-center justify-center rounded-full ring-1 transition-colors duration-300 ring-inset",
                active ? cn("ring-current", TONE_COLOUR[tone]) : "ring-border text-foreground",
            )}
        >
            {children}
        </span>
    );
}

function fit(canvas: HTMLCanvasElement): Geometry {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    return {
        ratio,
        x0: NODE_CENTRE * ratio,
        x1: width - NODE_CENTRE * ratio,
        cy: height / 2,
        bulge: height * 0.36,
    };
}

/** A point on a lane: the lanes meet at both nodes and spread apart between them. */
function pointOn(geometry: Geometry, lane: number, t: number): readonly [number, number] {
    const offset = LANES[lane] ?? 0;

    return [
        geometry.x0 + (geometry.x1 - geometry.x0) * t,
        geometry.cy + offset * geometry.bulge * Math.sin(Math.PI * t),
    ];
}

function advance(scene: Scene, flow: Flow, elapsed: number) {
    const seconds = elapsed / 1000;
    const target = flow.mode === "stream" ? flow.level : 0;

    scene.level = approach(scene.level, target, elapsed, LEVEL_HALF_LIFE_MS);

    if (flow.mode === "stream") {
        const pace = streamPace(scene.level);

        scene.spawnDebt += pace.spawnPerSecond * seconds;

        while (scene.spawnDebt >= 1 && scene.packets.length < MAX_PACKETS) {
            scene.spawnDebt -= 1;
            scene.packets.push({
                lane: Math.floor(Math.random() * LANES.length),
                direction: flow.direction === "in" ? -1 : 1,
                travel: pace.travelPerSecond * (0.75 + Math.random() * 0.5),
                t: flow.direction === "in" ? 1 : 0,
            });
        }

        scene.spawnDebt = Math.min(scene.spawnDebt, 1);
    } else {
        scene.spawnDebt = 0;
    }

    if (flow.mode === "ping") {
        const cycle = PING_TRIP_MS * 2 + PING_REST_MS;
        const before = scene.pingClock;
        const after = before + elapsed;

        // A ring where the ping lands: at the edge on the way out, back home
        // on the way in.
        if (before < PING_TRIP_MS && after >= PING_TRIP_MS) {
            scene.rings.push({ side: 1, age: 0 });
        }

        if (before < PING_TRIP_MS * 2 && after >= PING_TRIP_MS * 2) {
            scene.rings.push({ side: 0, age: 0 });
        }

        scene.pingClock = after % cycle;
    } else {
        scene.pingClock = 0;
    }

    const streak = streamPace(scene.level).streak;

    for (let index = scene.packets.length - 1; index >= 0; index -= 1) {
        const packet = scene.packets[index];

        if (packet === undefined) {
            continue;
        }

        packet.t += packet.direction * packet.travel * seconds;

        if (packet.t < -streak || packet.t > 1 + streak) {
            scene.packets.splice(index, 1);
        }
    }

    for (let index = scene.rings.length - 1; index >= 0; index -= 1) {
        const ring = scene.rings[index];

        if (ring === undefined) {
            continue;
        }

        ring.age += elapsed;

        if (ring.age >= RING_MS) {
            scene.rings.splice(index, 1);
        }
    }
}

function drawLanes(drawing: CanvasRenderingContext2D, geometry: Geometry, flow: Flow) {
    drawing.save();
    drawing.lineWidth = geometry.ratio;
    drawing.globalAlpha = flow.mode === "still" ? 0.28 : 0.16;
    drawing.setLineDash(flow.mode === "still" ? [2 * geometry.ratio, 4 * geometry.ratio] : []);

    LANES.forEach((_, lane) => {
        drawing.beginPath();

        for (let step = 0; step <= 32; step += 1) {
            const [x, y] = pointOn(geometry, lane, step / 32);

            if (step === 0) {
                drawing.moveTo(x, y);
            } else {
                drawing.lineTo(x, y);
            }
        }

        drawing.stroke();
    });

    drawing.restore();
}

function drawScene(
    drawing: CanvasRenderingContext2D,
    geometry: Geometry,
    scene: Scene,
    flow: Flow,
) {
    const streak = streamPace(scene.level).streak;

    drawing.save();
    drawing.lineCap = "round";
    drawing.lineWidth = 2 * geometry.ratio;

    for (const packet of scene.packets) {
        const head = clamp01(packet.t);
        const tail = clamp01(packet.t - packet.direction * streak);
        // Packets fade in leaving one node and out arriving at the other.
        const alpha = Math.sin(Math.PI * clamp01((head + tail) / 2)) ** 0.6;

        if (alpha <= 0.02 || head === tail) {
            continue;
        }

        drawing.globalAlpha = alpha;
        drawing.beginPath();

        for (let step = 0; step <= STREAK_STEPS; step += 1) {
            const [x, y] = pointOn(
                geometry,
                packet.lane,
                tail + ((head - tail) * step) / STREAK_STEPS,
            );

            if (step === 0) {
                drawing.moveTo(x, y);
            } else {
                drawing.lineTo(x, y);
            }
        }

        drawing.stroke();
    }

    if (flow.mode === "ping") {
        const clock = scene.pingClock;

        if (clock < PING_TRIP_MS * 2) {
            const leg = clock < PING_TRIP_MS ? clock / PING_TRIP_MS : 2 - clock / PING_TRIP_MS;
            const eased = 0.5 - 0.5 * Math.cos(Math.PI * leg);
            const [x, y] = pointOn(geometry, 2, eased);

            drawing.globalAlpha = 1;
            drawing.beginPath();
            drawing.arc(x, y, 3.5 * geometry.ratio, 0, Math.PI * 2);
            drawing.fill();
        }
    }

    drawing.lineWidth = 1.5 * geometry.ratio;

    for (const ring of scene.rings) {
        const progress = ring.age / RING_MS;
        const x = ring.side === 0 ? geometry.x0 : geometry.x1;

        drawing.globalAlpha = 0.55 * (1 - progress);
        drawing.beginPath();
        drawing.arc(
            x,
            geometry.cy,
            (NODE_CENTRE + 18 * (1 - (1 - progress) ** 2)) * geometry.ratio,
            0,
            Math.PI * 2,
        );
        drawing.stroke();
    }

    drawing.restore();
}

/** Reduced motion: a frozen frame that still says which way data is going. */
function drawStill(drawing: CanvasRenderingContext2D, geometry: Geometry, flow: Flow) {
    if (flow.mode === "still") {
        return;
    }

    drawing.save();
    drawing.lineCap = "round";
    drawing.lineWidth = 2 * geometry.ratio;

    if (flow.mode === "ping") {
        const [x, y] = pointOn(geometry, 2, 0.5);

        drawing.beginPath();
        drawing.arc(x, y, 3.5 * geometry.ratio, 0, Math.PI * 2);
        drawing.fill();
        drawing.restore();
        return;
    }

    // Evenly spaced dashes along every lane, staggered so they read as traffic.
    LANES.forEach((_, lane) => {
        for (let slot = 1; slot < 6; slot += 1) {
            const head = slot / 6 + (lane % 2) * 0.04;
            const tail = head - (flow.direction === "in" ? -1 : 1) * 0.05;

            drawing.globalAlpha = 0.7;
            drawing.beginPath();
            drawing.moveTo(...pointOn(geometry, lane, tail));
            drawing.lineTo(...pointOn(geometry, lane, head));
            drawing.stroke();
        }
    });

    drawing.restore();
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}
