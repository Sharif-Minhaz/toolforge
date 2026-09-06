"use client";

import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";

import { useIsHydrated } from "@/hooks/use-is-hydrated";

import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { hexToRgbTriplet, lighten, type RgbTriplet } from "../domain/palette";
import type { GlobeArc, GlobeMarker } from "../types";

/**
 * The globe, drawn with COBE.
 *
 * Deliberately free of `next-intl` and of anything domain-shaped: the caller
 * hands it finished markers, finished arcs and a finished label. That keeps the
 * one component that has to reason about WebGL contexts, device pixel ratios and
 * theme changes from also having to reason about routes.
 *
 * Five decisions worth keeping:
 *
 * - **COBE is imported inside the effect, never at the top.** It touches
 *   `document` and a WebGL context on use, and a static import would put it in
 *   the island's first chunk for every reader, including the ones who have not
 *   pressed anything yet.
 * - **The device pixel ratio is read inside the effect.** Reading it during
 *   render would be a host value in the server pass, which is the hydration bug
 *   `CLAUDE.md` rule 6 is about.
 * - **Colours come from the design tokens, converted through Canvas 2D.**
 *   Reading `fillStyle` back after assigning any CSS colour returns `#rrggbb`,
 *   which is the only conversion available that does not hard-code a palette
 *   beside the one in `globals.css`. Re-run on a theme change, since the tokens
 *   move underneath.
 * - **There is no internal render loop in COBE v2** — `update()` renders
 *   synchronously — so the rotation is our own `requestAnimationFrame`, and it
 *   is not started at all when the reader has asked for reduced motion.
 * - **WebGL absence is a real branch, not a crash.** `createGlobe` on a context
 *   it cannot get returns a working object whose methods do nothing, so failure
 *   would otherwise be an empty square with no explanation. The caller's table
 *   holds everything this canvas shows, so the honest degradation is to say so
 *   and step aside.
 */

/** How far the globe turns per frame when nothing is being dragged. */
const IDLE_SPIN = 0.0022;

/** Radians per key press, about three degrees — a nudge, not a jump. */
const KEY_STEP = 0.05;

/** Drag sensitivity: a full drag across the canvas is a bit over half a turn. */
const DRAG_SCALE = 0.006;

/** What `createGlobe` hands back, narrowed to what this component calls. */
type GlobeHandle = {
    update: (state: { phi?: number }) => void;
    destroy: () => void;
};

type RouteGlobeProps = {
    markers: readonly GlobeMarker[];
    arcs: readonly GlobeArc[];
    /** Read by assistive technology in place of the canvas. */
    label: string;
    /** Shown instead of the globe where WebGL is unavailable. */
    unsupportedLabel: string;
    autoRotate: boolean;
    className?: string;
};

/**
 * Whether this browser can give us a 3D context at all.
 *
 * Probed on a throwaway canvas rather than on the real one, because getting a
 * context is what binds it: asking the visible canvas for `webgl` here would
 * leave COBE unable to acquire its own.
 *
 * Cached at module scope, so reading it during render costs nothing after the
 * first call. That is what lets the answer be derived rather than pushed into
 * state from an effect — the probe is a fact about the browser, and it does not
 * change while the page is open.
 */
let webglSupport: boolean | null = null;

function supportsWebgl(): boolean {
    if (webglSupport !== null) {
        return webglSupport;
    }

    try {
        const probe = document.createElement("canvas");

        webglSupport = probe.getContext("webgl2") !== null || probe.getContext("webgl") !== null;
    } catch {
        webglSupport = false;
    }

    return webglSupport;
}

/**
 * One design token, in COBE's units.
 *
 * The tokens are `oklch()`, which no arithmetic here is going to convert
 * correctly. A Canvas 2D context already contains the browser's own colour
 * parser, and reading `fillStyle` back after assignment returns `#rrggbb`.
 */
function readToken(
    context: CanvasRenderingContext2D,
    name: string,
    fallback: RgbTriplet,
): RgbTriplet {
    try {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

        if (raw.length === 0) {
            return fallback;
        }

        context.fillStyle = "#000000";
        context.fillStyle = raw;

        return hexToRgbTriplet(context.fillStyle) ?? fallback;
    } catch {
        return fallback;
    }
}

export function RouteGlobe({
    markers,
    arcs,
    label,
    unsupportedLabel,
    autoRotate,
    className,
}: RouteGlobeProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const phiRef = useRef(0);
    /** Held so a drag or an arrow key can repaint when nothing is spinning. */
    const globeRef = useRef<GlobeHandle | null>(null);
    /** Read inside the effect, so the arrays are not themselves dependencies. */
    /**
     * A stable dependency for the effect below.
     *
     * `markers` and `arcs` are fresh arrays on every render of the parent, so
     * depending on them directly would tear down and rebuild a WebGL context
     * several times a keystroke. Serialising them and reading the value back out
     * of that string gives an object whose identity changes only when the
     * content does — which is what the effect actually cares about, and it needs
     * no ref written during render to get there.
     */
    const dataKey = useMemo(() => JSON.stringify({ markers, arcs }), [markers, arcs]);
    const data = useMemo(
        () => JSON.parse(dataKey) as { markers: GlobeMarker[]; arcs: GlobeArc[] },
        [dataKey],
    );
    const { resolvedTheme } = useTheme();
    const reduceMotion = useReducedMotion();
    const hydrated = useIsHydrated();

    const [size, setSize] = useState(0);
    /** Set only when COBE itself throws, which no probe can predict. */
    const [failed, setFailed] = useState(false);

    // Derived during render rather than pushed in from an effect. `useIsHydrated`
    // is false on the server pass and on the hydration pass, so both sides agree
    // on "supported" and the probe only runs afterwards — which is the whole
    // point of that hook, and why this is not the `useState` initialiser that
    // rule 6 forbids.
    const supported = hydrated ? supportsWebgl() && !failed : true;

    useEffect(() => {
        const container = containerRef.current;

        if (container === null) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => {
            // Rounded, because a fractional canvas width costs a resample every
            // frame for a difference nobody can see.
            setSize(Math.round(entry.contentRect.width));
        });

        observer.observe(container);

        return () => observer.disconnect();
    }, []);

    const spinning = autoRotate && !reduceMotion;

    useEffect(() => {
        const canvas = canvasRef.current;

        if (canvas === null || !supported || size === 0) {
            return;
        }

        let frame = 0;
        let cancelled = false;

        const measure = document.createElement("canvas").getContext("2d");
        const base: RgbTriplet = resolvedTheme === "dark" ? [0.18, 0.19, 0.24] : [0.82, 0.84, 0.89];
        const accent =
            measure === null
                ? ([0.45, 0.35, 0.95] as RgbTriplet)
                : readToken(measure, "--syntax-keyword", [0.45, 0.35, 0.95]);
        const arcTone =
            measure === null
                ? ([0.3, 0.6, 0.9] as RgbTriplet)
                : readToken(measure, "--syntax-key", [0.3, 0.6, 0.9]);

        async function start() {
            try {
                const { default: createGlobe } = await import("cobe");

                if (cancelled || canvas === null) {
                    return;
                }

                const globe = createGlobe(canvas, {
                    // Read here rather than during render: it is a property of
                    // the reader's screen, which the server pass cannot know.
                    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
                    // CSS pixels. COBE multiplies these by the ratio above to
                    // size the backing store.
                    width: size,
                    height: size,
                    phi: phiRef.current,
                    theta: 0.25,
                    dark: resolvedTheme === "dark" ? 1 : 0,
                    diffuse: 1.2,
                    mapSamples: 16_000,
                    mapBrightness: resolvedTheme === "dark" ? 4.5 : 1.6,
                    baseColor: [...base],
                    markerColor: [...accent],
                    glowColor: [...lighten(base, resolvedTheme === "dark" ? 0.15 : 0.55)],
                    arcColor: [...arcTone],
                    arcWidth: 0.5,
                    arcHeight: 0.35,
                    markers: data.markers.map((marker) => ({
                        location: [marker.location[0], marker.location[1]],
                        size: marker.size,
                    })),
                    arcs: data.arcs.map((arc) => ({
                        from: [arc.from[0], arc.from[1]],
                        to: [arc.to[0], arc.to[1]],
                    })),
                });

                globeRef.current = globe;

                // COBE v2 has no render loop of its own — `update` draws
                // synchronously — so one call is what paints a still globe when
                // the reader has asked for reduced motion.
                globe.update({ phi: phiRef.current });

                if (!spinning) {
                    return;
                }

                const tick = () => {
                    phiRef.current += IDLE_SPIN;
                    globe.update({ phi: phiRef.current });
                    frame = requestAnimationFrame(tick);
                };

                frame = requestAnimationFrame(tick);
            } catch (caught) {
                logEvent("warn", "ip_globe.globe_failed", { error: describeError(caught) });
                setFailed(true);
            }
        }

        void start();

        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            // A leaked WebGL context is not collected on unmount, and browsers
            // cap how many one page may hold.
            globeRef.current?.destroy();
            globeRef.current = null;
        };
    }, [supported, size, spinning, resolvedTheme, data]);

    /**
     * Repaint after moving the globe by hand.
     *
     * Necessary rather than tidy: with rotation off there is no frame loop, so
     * a drag would move `phi` and change nothing on screen.
     */
    function turnTo(phi: number) {
        phiRef.current = phi;
        globeRef.current?.update({ phi });
    }

    function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
        const start = event.clientX;
        const from = phiRef.current;

        event.currentTarget.setPointerCapture(event.pointerId);

        const move = (moved: PointerEvent) => {
            turnTo(from + (moved.clientX - start) * DRAG_SCALE);
        };

        const end = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
    }

    if (!supported) {
        return (
            <div
                className={cn(
                    "bg-card/60 ring-border/70 text-muted-foreground flex items-center justify-center rounded-xl p-6 text-center text-xs leading-[1.5] ring-1 ring-inset",
                    className,
                )}
            >
                {unsupportedLabel}
            </div>
        );
    }

    return (
        <div ref={containerRef} className={cn("w-full", className)}>
            <canvas
                ref={canvasRef}
                role="img"
                aria-label={label}
                tabIndex={0}
                onPointerDown={handlePointerDown}
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        turnTo(phiRef.current - KEY_STEP);
                    }

                    if (event.key === "ArrowRight") {
                        event.preventDefault();
                        turnTo(phiRef.current + KEY_STEP);
                    }
                }}
                // Sized in CSS as a square; the backing store is set by COBE
                // from the width and the device pixel ratio above.
                className="focus-visible:ring-ring aspect-square w-full cursor-grab touch-pan-y rounded-full outline-none focus-visible:ring-2 active:cursor-grabbing"
            />
        </div>
    );
}
