"use client";

import { useSyncExternalStore } from "react";

/**
 * Holds the browser's `beforeinstallprompt` event so the hero's Install button
 * can open the native install dialog later, from a press. Fed by `PwaRuntime`.
 *
 * - `none`: nothing to offer — already installed, or the browser cannot
 *   install from a page.
 * - `ready`: the native dialog can be opened.
 * - `ios`: no install API; Share → Add to Home Screen.
 * - `menu`: the dialog was dismissed and cannot be reopened; the browser menu can.
 */
export type InstallStatus = "none" | "ready" | "ios" | "menu";

type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
let dismissed = false;
let installed = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export function holdInstallPrompt(event: Event): void {
    deferred = event as InstallPromptEvent;
    emit();
}

export function markInstalled(): void {
    installed = true;
    deferred = null;
    emit();
}

export function isStandalone(): boolean {
    return (
        matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

function isIos(): boolean {
    return (
        /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
}

function getSnapshot(): InstallStatus {
    if (installed || isStandalone()) {
        return "none";
    }

    if (deferred) {
        return "ready";
    }

    if (dismissed) {
        return "menu";
    }

    return isIos() ? "ios" : "none";
}

/** Opens the native dialog. An install event can be prompted only once. */
export async function promptInstall(): Promise<void> {
    const event = deferred;

    if (!event) {
        return;
    }

    deferred = null;

    try {
        await event.prompt();
        const { outcome } = await event.userChoice;

        dismissed = outcome === "dismissed";
    } finally {
        emit();
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

export function useInstallStatus(): InstallStatus {
    return useSyncExternalStore(subscribe, getSnapshot, () => "none");
}
