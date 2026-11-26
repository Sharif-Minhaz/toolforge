"use client";

import { useEffect, useRef, type RefObject } from "react";

import { blockOffset } from "../domain/motion";

/**
 * Moves the block by writing its transform each frame, outside React: a state
 * update per frame would re-render the workbench at the rate it is measuring.
 * The distance is driven by frame time, not by frame count, so a missed
 * refresh shows as the jump it is.
 */
export function useMotionBlock(
    trackRef: RefObject<HTMLDivElement | null>,
    blockRef: RefObject<HTMLDivElement | null>,
    pxPerSecond: number,
    playing: boolean,
): void {
    /** Kept across pauses and speed changes, so the block carries on from where it stopped. */
    const distance = useRef<number | null>(null);

    useEffect(() => {
        const track = trackRef.current;
        const block = blockRef.current;

        if (!playing || track === null || block === null) {
            return;
        }

        let last: number | null = null;
        let frame = window.requestAnimationFrame(function tick(time) {
            // The first run starts with the block resting at the left edge.
            const travelled = distance.current ?? block.offsetWidth;
            const next =
                last === null ? travelled : travelled + ((time - last) * pxPerSecond) / 1000;

            distance.current = next;
            last = time;
            block.style.transform = `translateX(${blockOffset(next, track.clientWidth, block.offsetWidth)}px)`;
            frame = window.requestAnimationFrame(tick);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [trackRef, blockRef, pxPerSecond, playing]);
}
