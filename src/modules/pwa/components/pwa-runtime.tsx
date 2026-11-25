"use client";

import { useEffect } from "react";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import { OFFLINE_ATTRIBUTE, type WarmMessage } from "../domain/network";
import { SERVICE_WORKER_PATH } from "../domain/precache";
import { holdInstallPrompt, isStandalone, markInstalled } from "./install-store";

/**
 * Registers the service worker, keeps `<html data-offline>` in step with the
 * connection, and holds the install event for the hero's button.
 *
 * Production only: `next dev` serves changing code under the same `/_next/`
 * URLs, and `public/sw-manifest.js` exists only after `next build`.
 */
export function PwaRuntime() {
    useEffect(() => {
        const root = document.documentElement;
        const syncNetwork = () => root.toggleAttribute(OFFLINE_ATTRIBUTE, !navigator.onLine);

        // The installed app keeps every offline tool, not only the visited ones.
        // Asked on each launch; the worker skips it when this build and
        // language are already kept.
        const warm = () => {
            void navigator.serviceWorker?.ready.then((registration) => {
                const message: WarmMessage = { type: "warm", locale: root.lang };

                registration.active?.postMessage(message);
            });
        };

        const onPrompt = (event: Event) => {
            // Held, so the native dialog opens from the Install button rather
            // than from whatever the reader pressed first.
            event.preventDefault();
            holdInstallPrompt(event);
        };

        const onInstalled = () => {
            markInstalled();
            warm();
        };

        syncNetwork();
        window.addEventListener("online", syncNetwork);
        window.addEventListener("offline", syncNetwork);
        window.addEventListener("beforeinstallprompt", onPrompt);
        window.addEventListener("appinstalled", onInstalled);

        if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
            navigator.serviceWorker.register(SERVICE_WORKER_PATH).then(
                () => {
                    if (isStandalone()) {
                        warm();
                    }
                },
                (caught: unknown) => {
                    logEvent("warn", "pwa.register_failed", { error: describeError(caught) });
                },
            );
        }

        return () => {
            window.removeEventListener("online", syncNetwork);
            window.removeEventListener("offline", syncNetwork);
            window.removeEventListener("beforeinstallprompt", onPrompt);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    return null;
}
