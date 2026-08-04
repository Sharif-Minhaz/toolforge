"use client";

import "leaflet/dist/leaflet.css";

import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";

/**
 * A world map with a pin per location, drawn with Leaflet.
 *
 * Deliberately free of `next-intl` and of anything domain-shaped: the caller
 * hands it finished strings. That keeps the one component that has to reason
 * about DOM lifecycles, tile URLs and vendor CSS from also having to reason
 * about resolvers — and means the next tool that needs a map passes it a
 * different list of pins and nothing else.
 *
 * Three decisions worth keeping:
 *
 * - **Leaflet is imported inside the effect, never at the top.** It is ~150 KB
 *   that touches `window` on evaluation. A static import would both break the
 *   server render and land in the island's first chunk for every reader,
 *   including the ones whose report has no map in it.
 * - **`circleMarker`, not `marker`.** Leaflet's default pin is a PNG resolved
 *   against a CSS-relative path, which every bundler breaks and everybody
 *   patches with `L.Icon.Default.mergeOptions`. A circle is an SVG `<path>`
 *   with a `className`, so it takes design tokens directly and there is no
 *   image to lose.
 * - **Tooltips are built as DOM, not as an HTML string.** `bindTooltip` accepts
 *   either, and the string form is `innerHTML`. Pin text is derived from
 *   answers a stranger's DNS returned, so the only safe version is one where
 *   escaping is not a step that can be forgotten.
 */

export const MAP_PIN_TONES = ["agreed", "differs", "silent"] as const;

export type MapPinTone = (typeof MAP_PIN_TONES)[number];

export type MapPin = {
    readonly key: string;
    readonly latitude: number;
    readonly longitude: number;
    readonly tone: MapPinTone;
    /** The tooltip's first line — already localised, flag included. */
    readonly title: string;
    /** One line per thing at this location. Already localised. */
    readonly lines: readonly string[];
};

/**
 * Leaflet writes `fill` and `stroke` as presentation attributes, which any CSS
 * rule outranks — so a class is all it takes to put a pin on a design token.
 * Written as whole literals because Tailwind reads the source, not the values.
 */
const PIN_CLASSES: Record<MapPinTone, string> = {
    agreed: "[fill:var(--brand-emerald)] [stroke:var(--card)] [fill-opacity:0.9]",
    differs: "[fill:var(--brand-amber)] [stroke:var(--card)] [fill-opacity:0.95]",
    silent: "[fill:var(--muted-foreground)] [stroke:var(--card)] [fill-opacity:0.55]",
};

/**
 * CARTO's basemaps, which exist as a matched light/dark pair — the reason they
 * are here rather than raw OpenStreetMap tiles, which have no dark twin and
 * would leave one of this site's two themes with a glaring white rectangle in
 * it. Both are free for this volume and both require the attribution below,
 * which Leaflet's own control renders.
 */
const TILES = {
    light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
} as const;

const ATTRIBUTION =
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

/** Past this the basemap promises a precision country centroids do not have. */
const MAX_ZOOM = 6;

/**
 * Leaflet ships its own CSS, and it hard-codes white panels and black text.
 * Overriding it from a component means winning a specificity fight with a
 * stylesheet whose load order relative to Tailwind is not guaranteed, which is
 * what the `!` is doing here — scoped to this container, and nowhere near
 * `globals.css`.
 */
const LEAFLET_THEME = cn(
    "[&_.leaflet-container]:!bg-muted [&_.leaflet-container]:!font-sans",
    "[&_.leaflet-tooltip]:!bg-foreground [&_.leaflet-tooltip]:!text-background",
    "[&_.leaflet-tooltip]:!border-0 [&_.leaflet-tooltip]:!shadow-none",
    "[&_.leaflet-tooltip]:!rounded-md [&_.leaflet-tooltip]:!px-2.5 [&_.leaflet-tooltip]:!py-1.5",
    "[&_.leaflet-tooltip-top]:before:!border-t-[var(--color-foreground)]",
    "[&_.leaflet-tooltip-bottom]:before:!border-b-[var(--color-foreground)]",
    "[&_.leaflet-bar_a]:!bg-card [&_.leaflet-bar_a]:!text-foreground",
    "[&_.leaflet-bar_a]:!border-border [&_.leaflet-bar]:!border-border",
    "[&_.leaflet-bar_a:hover]:!bg-muted",
    "[&_.leaflet-control-attribution]:!bg-card/80 [&_.leaflet-control-attribution]:!text-muted-foreground",
    "[&_.leaflet-control-attribution_a]:!text-muted-foreground",
);

function buildTooltip(pin: MapPin): HTMLElement {
    const root = document.createElement("div");

    root.className = "flex flex-col gap-0.5";

    const title = document.createElement("p");

    title.className = "text-[0.8125rem] leading-snug font-medium";
    title.textContent = pin.title;
    root.append(title);

    for (const line of pin.lines) {
        const row = document.createElement("p");

        row.className = "font-mono text-[0.6875rem] leading-snug opacity-80";
        row.textContent = line;
        root.append(row);
    }

    return root;
}

export function WorldMap({
    pins,
    label,
    className,
}: {
    pins: readonly MapPin[];
    /** Names the region for a screen reader; the pins themselves are decorative. */
    label: string;
    className?: string;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [failed, setFailed] = useState(false);
    const { resolvedTheme } = useTheme();
    const reducedMotion = useReducedMotion();

    /*
     * One effect that builds the whole map, rather than three that create it,
     * retint it and repin it in an order nothing enforces. Rebuilding on a
     * theme toggle costs a handful of tiles and nine SVG circles, and the pan
     * position it discards is not state anybody was relying on — whereas an
     * effect that runs before the async creation finishes is a class of bug
     * that only appears on a slow connection.
     */
    useEffect(() => {
        const container = containerRef.current;

        if (container === null || pins.length === 0) {
            return;
        }

        let cancelled = false;
        let map: import("leaflet").Map | null = null;

        void (async () => {
            try {
                const L = await import("leaflet");

                // The cleanup of a previous run sets this before its map is
                // torn down, so bailing here is what stops React's double
                // effect from meeting "Map container is already initialized".
                if (cancelled) {
                    return;
                }

                map = L.map(container, {
                    zoomControl: true,
                    attributionControl: true,
                    minZoom: 1,
                    maxZoom: MAX_ZOOM,
                    // Wheeling over a full-width map should scroll the page, not
                    // swallow the gesture and zoom. The control and a double
                    // click still zoom, so nothing is unreachable.
                    scrollWheelZoom: false,
                    zoomAnimation: reducedMotion !== true,
                    fadeAnimation: reducedMotion !== true,
                    markerZoomAnimation: reducedMotion !== true,
                    maxBounds: [
                        [-85, -180],
                        [85, 180],
                    ],
                    maxBoundsViscosity: 1,
                });

                L.tileLayer(resolvedTheme === "dark" ? TILES.dark : TILES.light, {
                    subdomains: "abcd",
                    maxZoom: MAX_ZOOM,
                    noWrap: true,
                    attribution: ATTRIBUTION,
                }).addTo(map);

                for (const pin of pins) {
                    L.circleMarker([pin.latitude, pin.longitude], {
                        // Every pin is one location, so size carries no meaning
                        // and is set for legibility at world zoom alone.
                        radius: 7,
                        weight: 2,
                        className: PIN_CLASSES[pin.tone],
                    })
                        .bindTooltip(buildTooltip(pin), {
                            direction: "top",
                            offset: [0, -8],
                            opacity: 1,
                        })
                        .addTo(map);
                }

                map.fitBounds(
                    pins.map((pin) => [pin.latitude, pin.longitude]),
                    { padding: [36, 36], maxZoom: 4, animate: false },
                );
            } catch (caught) {
                if (!cancelled) {
                    setFailed(true);
                    logEvent("warn", "domain_inspector.map_failed", {
                        error: describeError(caught),
                    });
                }
            }
        })();

        return () => {
            cancelled = true;
            map?.remove();
        };
    }, [pins, resolvedTheme, reducedMotion]);

    if (pins.length === 0 || failed) {
        return null;
    }

    return (
        <div
            ref={containerRef}
            /*
             * `figure`, not `img`. Leaflet renders real zoom buttons and real
             * attribution links inside this element, and `role="img"` tells a
             * screen reader the whole subtree is one graphic — which leaves
             * those controls focusable but unnamed. `figure` names the region
             * and still allows interactive descendants.
             */
            role="figure"
            aria-label={label}
            className={cn(
                // `isolate` is load-bearing: Leaflet gives its panes z-index 400
                // and up, which without a stacking context here would paint the
                // map over the app's sticky chrome.
                "bg-muted ring-border/70 relative isolate h-56 w-full overflow-hidden rounded-xl ring-1 ring-inset sm:h-72",
                LEAFLET_THEME,
                className,
            )}
        />
    );
}
