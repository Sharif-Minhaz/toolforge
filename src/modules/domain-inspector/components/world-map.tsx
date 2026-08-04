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
 * A pin is three concentric circles, not one dot: a target ring wide enough to
 * find at world zoom, and a small solid core that says exactly where.
 *
 * Leaflet writes `fill` and `stroke` as presentation attributes, which any CSS
 * rule outranks — so a class is all it takes to put a pin on a design token.
 * Written as whole literals because Tailwind reads the source, not the values.
 */
const PIN_RING: Record<MapPinTone, string> = {
    agreed: "[fill:var(--brand-emerald)] [fill-opacity:0.16] [stroke:var(--brand-emerald)] [stroke-opacity:0.55]",
    differs:
        "[fill:var(--brand-amber)] [fill-opacity:0.2] [stroke:var(--brand-amber)] [stroke-opacity:0.7]",
    silent: "[fill:var(--muted-foreground)] [fill-opacity:0.07] [stroke:var(--muted-foreground)] [stroke-opacity:0.6]",
};

const PIN_CORE: Record<MapPinTone, string> = {
    agreed: "[fill:var(--brand-emerald)] [stroke:var(--card)]",
    differs: "[fill:var(--brand-amber)] [stroke:var(--card)]",
    silent: "[fill:var(--muted-foreground)] [fill-opacity:0.7] [stroke:var(--card)]",
};

/**
 * `transform-box` is the load-bearing half: without it an SVG path scales about
 * the viewport origin rather than its own centre, and the ring flies off the
 * map instead of expanding out of the pin.
 */
const PIN_BEACON = cn(
    "[fill:none] [stroke:var(--brand-amber)] [stroke-opacity:0.8]",
    "animate-beacon [transform-box:fill-box] [transform-origin:center]",
);

/** Wide enough to hover at world zoom without swallowing its neighbour. */
const RING_RADIUS = 11;

const CORE_RADIUS = 4;

/**
 * CARTO's basemaps, which exist as a matched light/dark pair — the reason they
 * are here rather than raw OpenStreetMap tiles, which have no dark twin and
 * would leave one of this site's two themes with a glaring white rectangle in
 * it. Both are free for this volume and both require the attribution below,
 * which Leaflet's own control renders.
 *
 * The label-free variants, because a pin sits on a country centroid and the
 * caller's own list names every one of them. What the labelled tiles add at
 * this zoom is a second typeface and a second language — CARTO renders each
 * region in its local script, so one card ends up carrying `AFRIKA`, `亚洲` and
 * `AMÉRICA DO SUL` at once, none of which is the reader's chosen locale.
 */
const TILES = {
    light: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    dark: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
} as const;

const ATTRIBUTION =
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

/** Past this the basemap promises a precision country centroids do not have. */
const MAX_ZOOM = 6;

/** The full Web Mercator extent, which is also what `maxBounds` allows. */
const WORLD_EDGE_LATITUDE = 85;

/** Web Mercator renders the world as a square of this many pixels at zoom 0. */
const WORLD_TILE_SIZE = 256;

/**
 * The zoom at which the world covers the frame in both axes.
 *
 * Below it the container's own background shows as pale bands above and below
 * the map — which is what made it look like a picture pasted into the card
 * rather than a panel fitted to it. Used as the floor for `minZoom`, so no
 * combination of fitting, pinching or resizing can put them back.
 */
function coverZoom(container: HTMLElement): number {
    const edge = Math.max(container.clientWidth, container.clientHeight);

    // Before the first layout there is nothing to cover; the resize handler
    // recomputes this the moment there is.
    return edge === 0 ? 1 : Math.log2(edge / WORLD_TILE_SIZE);
}

/**
 * Leaflet ships its own CSS, and it hard-codes white panels and black text.
 * Overriding it from a component means winning a specificity fight with a
 * stylesheet whose load order relative to Tailwind is not guaranteed, which is
 * what the `!` is doing here — scoped to this container, and nowhere near
 * `globals.css`.
 */
const LEAFLET_THEME = cn(
    // `&.`, not `&_`. Leaflet puts `.leaflet-container` on the element it is
    // handed — this one — so the descendant form silently matched nothing and
    // left Leaflet's own `#ddd` as the backdrop.
    "[&.leaflet-container]:!bg-card [&.leaflet-container]:!font-sans",

    /*
     * Dark Matter and Positron are both built as quiet backdrops for bright
     * data overlays, and the tiles are pure neutral greys: dark is water
     * `#262626` over land `#090909`, light is water `#d4dadc` under land
     * `#fafaf8`. Two things follow, and both are why the raw tiles look wrong
     * on this card rather than merely dark.
     *
     * The card sits at `oklch(0.187)`, which in dark mode falls *between* the
     * two — so land and water are each within a few values of their own frame
     * and the whole thing mushes. The fix is not "make it brighter": it is to
     * move land below `--background` and water above `--muted`, so the map
     * reads against the card from both sides.
     *
     * And because the source is neutral, a colour matrix on it collapses to
     * three constant per-channel gains — which means `sepia -> hue-rotate ->
     * saturate` is exactly a tint, and can be solved rather than eyeballed.
     * These land on the app's own hue (264) at its own chroma: dark water
     * resolves to `#2b2e36` at `oklch(0.302 0.015 269)`, dark land to
     * `#070809`; light water to `#cdcfd4`, light land to `#f3f3f4`, which is
     * `--muted` to within a value. Retune by rerunning the solver, not by
     * nudging digits — the numbers are coupled and the light theme clips to
     * flat white a long way before it looks wrong in the source.
     *
     * The light theme's low `saturate` earns its keep twice over: Positron
     * draws administrative borders in a salmon pink that belongs to nothing
     * else on this site, and this is what returns them to grey.
     */
    "[&_.leaflet-tile-pane]:[filter:brightness(0.72)_contrast(1.53)_sepia(0.98)_hue-rotate(180deg)_saturate(0.1)]",
    "dark:[&_.leaflet-tile-pane]:[filter:brightness(1.11)_contrast(1.03)_sepia(0.78)_hue-rotate(184deg)_saturate(0.9)]",

    "[&_.leaflet-tooltip]:!bg-foreground [&_.leaflet-tooltip]:!text-background",
    "[&_.leaflet-tooltip]:!border-0 [&_.leaflet-tooltip]:!shadow-none",
    "[&_.leaflet-tooltip]:!rounded-md [&_.leaflet-tooltip]:!px-2.5 [&_.leaflet-tooltip]:!py-1.5",
    "[&_.leaflet-tooltip-top]:before:!border-t-[var(--color-foreground)]",
    "[&_.leaflet-tooltip-bottom]:before:!border-b-[var(--color-foreground)]",

    // Chrome, kept quiet. Leaflet's defaults put a near-white slab and a
    // 22px glyph in the corner, which on this card is the highest-contrast
    // thing in the frame — brighter than the reading it is framing.
    "[&_.leaflet-bar]:!rounded-lg [&_.leaflet-bar]:!border-0 [&_.leaflet-bar]:!shadow-none",
    "[&_.leaflet-bar]:!overflow-hidden [&_.leaflet-bar]:!ring-1 [&_.leaflet-bar]:!ring-border",
    "[&_.leaflet-bar_a]:!bg-card/70 [&_.leaflet-bar_a]:!text-muted-foreground",
    "[&_.leaflet-bar_a]:!border-border/60 [&_.leaflet-bar_a]:!text-base",
    "[&_.leaflet-bar_a]:!backdrop-blur-sm",
    "[&_.leaflet-bar_a:hover]:!bg-card [&_.leaflet-bar_a:hover]:!text-foreground",

    "[&_.leaflet-control-attribution]:!bg-card/70 [&_.leaflet-control-attribution]:!backdrop-blur-sm",
    "[&_.leaflet-control-attribution]:!text-muted-foreground",
    "[&_.leaflet-control-attribution]:!rounded-tl-md [&_.leaflet-control-attribution]:!px-1.5",
    "[&_.leaflet-control-attribution]:!text-[0.5625rem] [&_.leaflet-control-attribution]:!leading-[1.6]",
    "[&_.leaflet-control-attribution_a]:!text-muted-foreground",
    "[&_.leaflet-control-attribution_a:hover]:!text-foreground",
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
                    // Built by hand below so the prefix can be dropped.
                    attributionControl: false,
                    minZoom: coverZoom(container),
                    maxZoom: MAX_ZOOM,
                    /*
                     * Leaflet's default snaps every zoom to a whole number, and
                     * `fitBounds` snaps *down* — so a frame the world nearly
                     * fills gets the next size smaller and a band of backdrop
                     * around it. Off, the fit is exact. It costs slightly soft
                     * tiles at fractional scales, which is a better trade than
                     * a pale border on every report.
                     */
                    zoomSnap: 0,
                    // Wheeling over a full-width map should scroll the page, not
                    // swallow the gesture and zoom. The control and a double
                    // click still zoom, so nothing is unreachable.
                    scrollWheelZoom: false,
                    zoomAnimation: reducedMotion !== true,
                    fadeAnimation: reducedMotion !== true,
                    markerZoomAnimation: reducedMotion !== true,
                    maxBounds: [
                        [-WORLD_EDGE_LATITUDE, -180],
                        [WORLD_EDGE_LATITUDE, 180],
                    ],
                    maxBoundsViscosity: 1,
                });

                // The frame changes size with the layout — a sidebar collapsing
                // is enough — and the zoom that covered the old one may not
                // cover the new one. `setMinZoom` zooms out of range views for
                // us, so this is the whole of keeping the bands gone.
                map.on("resize", () => map?.setMinZoom(coverZoom(container)));

                // `prefix: false` drops Leaflet's own "Leaflet" credit, which
                // its BSD-2 licence does not ask for and which arrives with a
                // flag emoji nobody chose. OpenStreetMap and CARTO do require
                // theirs, and those are what the tile layer contributes.
                L.control.attribution({ prefix: false, position: "bottomright" }).addTo(map);

                L.tileLayer(resolvedTheme === "dark" ? TILES.dark : TILES.light, {
                    subdomains: "abcd",
                    maxZoom: MAX_ZOOM,
                    noWrap: true,
                    attribution: ATTRIBUTION,
                }).addTo(map);

                for (const pin of pins) {
                    const at: [number, number] = [pin.latitude, pin.longitude];

                    /*
                     * Divergence is the one thing on this card worth walking
                     * across the room for, so it is the one thing that moves.
                     * Everything else holds still — a map where every pin
                     * pulses says nothing about which pin to look at.
                     */
                    if (pin.tone === "differs" && reducedMotion !== true) {
                        L.circleMarker(at, {
                            radius: RING_RADIUS,
                            weight: 1.5,
                            interactive: false,
                            className: PIN_BEACON,
                        }).addTo(map);
                    }

                    // The ring carries the tooltip rather than the core: it is
                    // the larger target, and a 4px hover area is not one.
                    L.circleMarker(at, {
                        radius: RING_RADIUS,
                        weight: 1,
                        // A resolver that never answered gets a broken ring,
                        // not a fainter one. Absence should read as absence and
                        // still be the pin you can find.
                        dashArray: pin.tone === "silent" ? "2 4" : undefined,
                        className: PIN_RING[pin.tone],
                    })
                        .bindTooltip(buildTooltip(pin), {
                            direction: "top",
                            offset: [0, -RING_RADIUS],
                            opacity: 1,
                        })
                        .addTo(map);

                    L.circleMarker(at, {
                        radius: CORE_RADIUS,
                        weight: 2,
                        interactive: false,
                        className: PIN_CORE[pin.tone],
                    }).addTo(map);
                }

                // Clamped up to `minZoom` when the pins would fit inside the
                // frame, which is the one case where showing every pin and
                // filling the frame cannot both hold. Filling wins: a pin that
                // needs a drag to reach is a smaller loss than a border the
                // reader reads as a rendering fault.
                map.fitBounds(
                    pins.map((pin) => [pin.latitude, pin.longitude]),
                    // Enough padding that a ring at the edge is not half a ring.
                    { padding: [28, 28], maxZoom: 4, animate: false },
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
                //
                // `bg-card`, not `bg-muted`: the filtered ocean lands at close
                // to the card's own value, so the area outside the world at low
                // zoom should match it rather than draw a second rectangle.
                "bg-card ring-border/70 relative isolate h-64 w-full overflow-hidden rounded-xl ring-1 ring-inset sm:h-80",
                LEAFLET_THEME,
                className,
            )}
        />
    );
}
