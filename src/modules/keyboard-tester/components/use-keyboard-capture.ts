"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { ESCAPE_RELEASE_MS } from "../domain/constants";
import { nextLockStates, reportedLockStates, type LockPlatform } from "../domain/locks";
import type { KeyInput, LockStates } from "../types";
import { keyboardApi } from "./keyboard-api";

/**
 * Listens to the keyboard only while the test area has focus, and while it
 * does, keeps every key from the page: Tab does not move focus, Space does not
 * scroll, F5 does not reload, Alt does not open a menu bar.
 *
 * Holding Escape gives the keyboard back. Without a way out, a reader who
 * moves by keyboard would be trapped in the area — and Escape still counts as
 * tested on the way.
 *
 * Two platform quirks are absorbed here rather than reported as faults:
 *
 * - macOS sends no `keyup` for a key pressed while Command is held, so every
 *   key would look stuck. On Command's own release, everything is released.
 * - A virtual keyboard on a phone reports `Unidentified` with no position; it
 *   is counted apart so the page can say why nothing lights up.
 *
 * And one thing the page cannot block by itself — Ctrl+W, Ctrl+T, the Windows
 * key, Escape leaving full screen — is what `captureSystemKeys` is for: full
 * screen plus the Keyboard Lock API, Chromium only.
 */

export type SystemKeysState = "off" | "on" | "unsupported";

type KeyboardCapture = {
    focused: boolean;
    /** Keys the platform could not place — an on-screen keyboard. */
    unidentified: number;
    systemKeys: SystemKeysState;
    /** Num, Caps and Scroll Lock, read off the last key event. */
    locks: LockStates;
    captureSystemKeys: () => void;
    releaseSystemKeys: () => void;
};

function isUnidentified(code: string): boolean {
    return code === "" || code === "Unidentified";
}

export function useKeyboardCapture(
    areaRef: RefObject<HTMLElement | null>,
    fullscreenRef: RefObject<HTMLElement | null>,
    onInput: (input: KeyInput) => void,
): KeyboardCapture {
    const [focused, setFocused] = useState(false);
    const [unidentified, setUnidentified] = useState(0);
    const [systemKeys, setSystemKeys] = useState<SystemKeysState>("off");
    const [locks, setLocks] = useState<LockStates>(null);
    const systemKeysRef = useRef<SystemKeysState>("off");

    useEffect(() => {
        const area = areaRef.current;

        if (area === null) {
            return;
        }

        const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
        const platform: LockPlatform = isMac
            ? "mac"
            : /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)
              ? "linux"
              : "other";
        let escapeTimer: number | undefined;

        // Every key event carries the lock states and nothing else can be
        // asked, so the lights are worked out from each event — see
        // `nextLockStates` for why the lock key's own report is not trusted.
        function reportOf(event: KeyboardEvent | MouseEvent) {
            return {
                NumLock: event.getModifierState("NumLock"),
                CapsLock: event.getModifierState("CapsLock"),
                ScrollLock: event.getModifierState("ScrollLock"),
            };
        }

        // The click that focuses the board is the first chance to read the
        // lights, and it is truthful about all three — so they are right
        // before any key is pressed, not only after the second one.
        function handlePointer(event: PointerEvent) {
            const reported = reportOf(event);

            setLocks((current) => reportedLockStates(current, reported));
        }

        function readLocks(event: KeyboardEvent) {
            const reported = reportOf(event);

            setLocks((current) =>
                nextLockStates(
                    current,
                    {
                        type: event.type === "keydown" ? "down" : "up",
                        code: event.code,
                        repeat: event.repeat,
                        reported,
                    },
                    platform,
                ),
            );
        }

        // macOS sends one event per Caps Lock toggle — a press to turn it on,
        // a release to turn it off — so either one is a whole keystroke, or
        // the key would look held for as long as Caps Lock is on.
        function macCapsLock(event: KeyboardEvent) {
            onInput({ type: "down", code: event.code, time: event.timeStamp, repeat: false });
            onInput({ type: "up", code: event.code, time: event.timeStamp });
        }

        function handleDown(event: KeyboardEvent) {
            event.preventDefault();
            readLocks(event);

            if (isUnidentified(event.code)) {
                setUnidentified((count) => count + 1);

                return;
            }

            if (isMac && event.code === "CapsLock") {
                macCapsLock(event);

                return;
            }

            onInput({
                type: "down",
                code: event.code,
                time: event.timeStamp,
                repeat: event.repeat,
            });

            // In system-key mode Escape belongs to the browser's own "hold to
            // leave full screen", and the two must not race.
            if (event.code === "Escape" && !event.repeat && systemKeysRef.current !== "on") {
                window.clearTimeout(escapeTimer);
                escapeTimer = window.setTimeout(() => area?.blur(), ESCAPE_RELEASE_MS);
            }
        }

        function handleUp(event: KeyboardEvent) {
            event.preventDefault();
            readLocks(event);

            if (isUnidentified(event.code)) {
                return;
            }

            if (isMac && event.code === "CapsLock") {
                macCapsLock(event);

                return;
            }

            if (event.code === "Escape") {
                window.clearTimeout(escapeTimer);
            }

            onInput({ type: "up", code: event.code, time: event.timeStamp });

            if (isMac && (event.code === "MetaLeft" || event.code === "MetaRight")) {
                onInput({ type: "releaseAll", time: event.timeStamp });
            }
        }

        function handleFocus() {
            setFocused(true);
        }

        function handleBlur() {
            window.clearTimeout(escapeTimer);
            setFocused(false);
            onInput({ type: "releaseAll", time: performance.now() });
        }

        area.addEventListener("keydown", handleDown);
        area.addEventListener("keyup", handleUp);
        area.addEventListener("focus", handleFocus);
        area.addEventListener("pointerdown", handlePointer);
        area.addEventListener("blur", handleBlur);

        return () => {
            window.clearTimeout(escapeTimer);
            area.removeEventListener("keydown", handleDown);
            area.removeEventListener("keyup", handleUp);
            area.removeEventListener("focus", handleFocus);
            area.removeEventListener("pointerdown", handlePointer);
            area.removeEventListener("blur", handleBlur);
        };
    }, [areaRef, onInput]);

    useEffect(() => {
        function handleFullscreen() {
            if (document.fullscreenElement === null && systemKeysRef.current === "on") {
                keyboardApi()?.unlock?.();
                systemKeysRef.current = "off";
                setSystemKeys("off");
            }
        }

        document.addEventListener("fullscreenchange", handleFullscreen);

        return () => document.removeEventListener("fullscreenchange", handleFullscreen);
    }, []);

    function captureSystemKeys() {
        const target = fullscreenRef.current;
        const lock = keyboardApi()?.lock;

        if (
            target === null ||
            lock === undefined ||
            typeof target.requestFullscreen !== "function"
        ) {
            systemKeysRef.current = "unsupported";
            setSystemKeys("unsupported");

            return;
        }

        // Keyboard Lock only takes effect in full screen, so the lock is asked
        // for once full screen has been granted.
        target
            .requestFullscreen()
            .then(() => lock.call(keyboardApi()))
            .then(() => {
                systemKeysRef.current = "on";
                setSystemKeys("on");
                areaRef.current?.focus();
            })
            .catch(() => {
                systemKeysRef.current = "unsupported";
                setSystemKeys("unsupported");
            });
    }

    function releaseSystemKeys() {
        keyboardApi()?.unlock?.();

        if (document.fullscreenElement !== null) {
            void document.exitFullscreen();
        }

        systemKeysRef.current = "off";
        setSystemKeys("off");
    }

    return { focused, unidentified, systemKeys, locks, captureSystemKeys, releaseSystemKeys };
}
