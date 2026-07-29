"use client";

import { useLocale } from "next-intl";
import { useTheme } from "next-themes";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { TURNSTILE_SCRIPT_URL } from "../domain/turnstile";
import type { TurnstileTheme } from "../types/turnstile";

type TurnstileWidgetProps = {
    siteKey: string;
    /** Names the widget in Cloudflare's dashboard; one value per tool. */
    action: string;
    /** A token is single-use: bump this after every attempt to draw a fresh one. */
    resetSignal: number;
    onVerify: (token: string) => void;
    onExpire: () => void;
    onError: () => void;
};

/**
 * Renders the Turnstile challenge that gates a metered upstream request.
 *
 * The widget is drawn explicitly rather than by the script's auto-scan, so its
 * lifetime is tied to this component and a token can be invalidated on demand.
 * It renders visibly, and re-runs after every attempt — watching it return to
 * "Success" is how a reader knows the disabled button is about to come back.
 */
export function TurnstileWidget({
    siteKey,
    action,
    resetSignal,
    onVerify,
    onExpire,
    onError,
}: TurnstileWidgetProps) {
    const locale = useLocale();
    const { resolvedTheme } = useTheme();

    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [scriptReady, setScriptReady] = useState(false);

    // Held in a ref so a new closure on every parent render does not tear the
    // widget down and build it again. Synced in an effect rather than during
    // render, which is both the rule and the safe order: the render effect
    // below is declared after this one, so it always sees the current pair.
    const handlersRef = useRef({ onVerify, onExpire, onError });

    useEffect(() => {
        handlersRef.current = { onVerify, onExpire, onError };
    }, [onVerify, onExpire, onError]);

    const theme: TurnstileTheme =
        resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : "auto";

    useEffect(() => {
        const api = window.turnstile;
        const container = containerRef.current;

        if (!scriptReady || !api || !container) {
            return;
        }

        const widgetId = api.render(container, {
            sitekey: siteKey,
            action,
            theme,
            size: "flexible",
            // Visible rather than `interaction-only`: the challenge gates the
            // submit button, and a control that disables another control has
            // to show its own state or the disabled button looks broken.
            appearance: "always",
            language: locale,
            "response-field": false,
            callback: (token) => handlersRef.current.onVerify(token),
            "error-callback": () => handlersRef.current.onError(),
            "expired-callback": () => handlersRef.current.onExpire(),
            "timeout-callback": () => handlersRef.current.onExpire(),
        });

        widgetIdRef.current = widgetId ?? null;

        return () => {
            if (widgetIdRef.current !== null) {
                api.remove(widgetIdRef.current);
                widgetIdRef.current = null;
            }
        };
    }, [scriptReady, siteKey, action, theme, locale]);

    useEffect(() => {
        // The first render already carries a fresh token; only a later bump is
        // asking for a replacement.
        if (resetSignal === 0 || widgetIdRef.current === null) {
            return;
        }

        window.turnstile?.reset(widgetIdRef.current);
    }, [resetSignal]);

    return (
        <>
            <Script
                src={TURNSTILE_SCRIPT_URL}
                strategy="lazyOnload"
                onReady={() => setScriptReady(true)}
                onError={() => handlersRef.current.onError()}
            />
            <div ref={containerRef} className="empty:hidden" />
        </>
    );
}
