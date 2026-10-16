"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { POLLING_SAMPLE_WINDOW, TOUCH_COMPAT_WINDOW_MS } from "../domain/constants";
import { buttonFromIndex, wheelDirectionOf } from "../domain/input";
import { summarizePolling } from "../domain/polling";
import type { MouseButton, MouseInput, PollingSummary, WheelDirection } from "../types";

/**
 * Everything the capture area listens to, and everything it refuses to let the
 * page do while the pointer is over it.
 *
 * Native listeners rather than React props for two reasons. React attaches
 * `wheel` as passive, and a passive listener cannot stop the page scrolling.
 * And a release has to be heard *anywhere* — a button pressed in the area and
 * let go outside it would otherwise stay held forever, and every later press
 * would be measured against a release that never came.
 *
 * What is blocked inside the area, and why each one has to be:
 *
 * - **Back and Forward.** Browsers navigate on the *release* of buttons 4 and
 *   5, so it is `mouseup` that is cancelled — and `auxclick`, which some
 *   engines act on instead. A press that began in the area is cancelled
 *   wherever it ends.
 * - **The context menu**, on the right button.
 * - **Middle-click autoscroll**, which starts on `mousedown`.
 * - **Page scrolling**, so a wheel test does not scroll the test off screen.
 * - **Text selection**, which a fast double click would otherwise start.
 *
 * And what is *not* counted: a tap. A touch screen fires compatibility mouse
 * events after every touch, with `button` 0, so without a filter a phone would
 * report every tap as a left click. Any touch or pen pointer event opens a
 * short window in which mouse events are ignored.
 *
 * Keystrokes are logged while the pointer is over the area, never blocked —
 * mouse software that remaps an extra or macro button usually makes it type a
 * key, and this is the only way to see such a button work.
 */

/** How long a wheel arrow stays lit after its notch. */
const WHEEL_FLASH_MS = 140;

/** How often the polling estimate is recomputed while the mouse moves. */
const POLLING_REFRESH_MS = 250;

type CaptureState = {
    inside: boolean;
    held: ReadonlySet<MouseButton>;
    flash: WheelDirection | null;
    polling: PollingSummary | null;
    /** The highest median rate measured since the last reset. */
    peakPollingHz: number | null;
    /** Clears the polling samples, for a reset. */
    resetPolling: () => void;
    /** A mouse pointer event has been seen on this page, anywhere. */
    sawMouse: boolean;
};

export function useMouseCapture(
    zoneRef: RefObject<HTMLElement | null>,
    onInput: (input: MouseInput) => void,
): CaptureState {
    const [inside, setInside] = useState(false);
    const [held, setHeld] = useState<ReadonlySet<MouseButton>>(new Set());
    const [flash, setFlash] = useState<WheelDirection | null>(null);
    const [polling, setPolling] = useState<PollingSummary | null>(null);
    const [peakPollingHz, setPeakPollingHz] = useState<number | null>(null);
    const [sawMouse, setSawMouse] = useState(false);

    /** Outlives the effect, which re-subscribes whenever the fault window moves. */
    const insideRef = useRef(false);
    const samples = useRef<number[]>([]);
    const sampled = useRef(0);

    useEffect(() => {
        const zone = zoneRef.current;

        if (zone === null) {
            return;
        }

        /** Presses that began in the area, so their release is ours to cancel. */
        const pressedHere = new Set<MouseButton>();
        let flashTimer: number | undefined;
        let lastTouchAt = -Infinity;

        function isCompatibilityEvent(event: MouseEvent) {
            return event.timeStamp - lastTouchAt < TOUCH_COMPAT_WINDOW_MS;
        }

        function handlePointer(event: PointerEvent) {
            if (event.pointerType === "mouse") {
                setSawMouse(true);
            } else {
                lastTouchAt = event.timeStamp;
            }
        }

        function handleKey(event: KeyboardEvent) {
            const target = event.target;

            if (
                !insideRef.current ||
                event.repeat ||
                (target instanceof HTMLElement &&
                    (target.isContentEditable ||
                        target.closest("input, textarea, select") !== null))
            ) {
                return;
            }

            onInput({ type: "key", code: event.code || event.key, time: event.timeStamp });
        }

        function syncHeld() {
            setHeld(new Set(pressedHere));
        }

        function handleDown(event: MouseEvent) {
            // Before the lookup: an unmapped sixth button still must not start
            // anything the browser would do with it.
            event.preventDefault();

            const button = buttonFromIndex(event.button);

            if (button === null || isCompatibilityEvent(event)) {
                return;
            }

            pressedHere.add(button);
            syncHeld();
            onInput({ type: "press", button, time: event.timeStamp });
        }

        function handleZoneUp(event: MouseEvent) {
            event.preventDefault();
        }

        function handleWindowUp(event: MouseEvent) {
            const button = buttonFromIndex(event.button);

            if (button === null || !pressedHere.has(button)) {
                return;
            }

            // Pressed in the area and let go outside it: Back and Forward
            // still must not fire.
            event.preventDefault();
            pressedHere.delete(button);
            syncHeld();
            onInput({ type: "release", button, time: event.timeStamp });
        }

        function handleBlur() {
            if (pressedHere.size === 0) {
                return;
            }

            pressedHere.clear();
            syncHeld();
            onInput({ type: "cancel", time: performance.now() });
        }

        function handleWheel(event: WheelEvent) {
            event.preventDefault();

            const direction = wheelDirectionOf(event.deltaX, event.deltaY);

            if (direction === null) {
                return;
            }

            onInput({ type: "wheel", direction, time: event.timeStamp });
            setFlash(direction);
            window.clearTimeout(flashTimer);
            flashTimer = window.setTimeout(() => setFlash(null), WHEEL_FLASH_MS);
        }

        function handleMove(event: PointerEvent) {
            if (event.pointerType !== "mouse") {
                return;
            }

            // Every report the mouse sent since the last frame, each with its
            // own timestamp. Without this the rate measured is the display's.
            const coalesced =
                typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
            const reports = coalesced.length > 0 ? coalesced : [event];
            const buffer = samples.current;

            for (const report of reports) {
                buffer.push(report.timeStamp);
            }

            sampled.current += reports.length;

            if (buffer.length > POLLING_SAMPLE_WINDOW) {
                buffer.splice(0, buffer.length - POLLING_SAMPLE_WINDOW);
            }
        }

        function cancel(event: Event) {
            event.preventDefault();
        }

        function setPointerInside(next: boolean) {
            insideRef.current = next;
            setInside(next);
        }

        // A finger resting on the area is not a mouse inside it.
        const enter = (event: PointerEvent) => {
            if (event.pointerType === "mouse") {
                setPointerInside(true);
            }
        };
        const leave = (event: PointerEvent) => {
            if (event.pointerType === "mouse") {
                setPointerInside(false);
            }
        };

        zone.addEventListener("mousedown", handleDown);
        zone.addEventListener("mouseup", handleZoneUp);
        zone.addEventListener("auxclick", cancel);
        zone.addEventListener("contextmenu", cancel);
        zone.addEventListener("selectstart", cancel);
        zone.addEventListener("wheel", handleWheel, { passive: false });
        zone.addEventListener("pointermove", handleMove);
        zone.addEventListener("pointerenter", enter);
        zone.addEventListener("pointerleave", leave);
        // Capture phase, so a release over an element that stops propagation
        // is still heard.
        window.addEventListener("mouseup", handleWindowUp, true);
        window.addEventListener("blur", handleBlur);
        window.addEventListener("pointerdown", handlePointer, true);
        window.addEventListener("pointerup", handlePointer, true);
        window.addEventListener("pointermove", handlePointer, { capture: true, passive: true });
        window.addEventListener("keydown", handleKey);

        let lastSampled = 0;
        const refresh = window.setInterval(() => {
            // Only when something moved: a mouse at rest keeps showing the
            // rate it last had rather than fading to nothing.
            if (sampled.current === lastSampled) {
                return;
            }

            lastSampled = sampled.current;

            const summary = summarizePolling(samples.current);

            if (summary !== null) {
                setPolling(summary);
                setPeakPollingHz((peak) =>
                    peak === null ? summary.medianHz : Math.max(peak, summary.medianHz),
                );
            }
        }, POLLING_REFRESH_MS);

        return () => {
            zone.removeEventListener("mousedown", handleDown);
            zone.removeEventListener("mouseup", handleZoneUp);
            zone.removeEventListener("auxclick", cancel);
            zone.removeEventListener("contextmenu", cancel);
            zone.removeEventListener("selectstart", cancel);
            zone.removeEventListener("wheel", handleWheel);
            zone.removeEventListener("pointermove", handleMove);
            zone.removeEventListener("pointerenter", enter);
            zone.removeEventListener("pointerleave", leave);
            window.removeEventListener("mouseup", handleWindowUp, true);
            window.removeEventListener("blur", handleBlur);
            window.removeEventListener("pointerdown", handlePointer, true);
            window.removeEventListener("pointerup", handlePointer, true);
            window.removeEventListener("pointermove", handlePointer, true);
            window.removeEventListener("keydown", handleKey);
            window.clearTimeout(flashTimer);
            window.clearInterval(refresh);
        };
    }, [zoneRef, onInput]);

    function resetPolling() {
        samples.current = [];
        sampled.current = 0;
        setPolling(null);
        setPeakPollingHz(null);
    }

    return { inside, held, flash, polling, peakPollingHz, resetPolling, sawMouse };
}
