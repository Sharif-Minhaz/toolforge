"use client";

import { useEffect, useRef, useState } from "react";

import { describeError, logEvent } from "@/modules/observability/domain/logger";

import {
    assembleTranslation,
    buildTranslateUrl,
    planTranslation,
    readTranslation,
} from "../domain/translation";

/**
 * Translate, pressed — from the reader's own browser, straight to Google.
 *
 * Browser-direct rather than through this site's server, and the address is
 * the reason. The endpoint limits by caller address; this server's would be one
 * address for every reader, on a datacenter range Google blocks first, so one
 * busy hour would take translation away from everybody. From the browser, each
 * reader spends their own allowance — and a block, when it comes, is theirs
 * alone and says so. The development machine's network was refused with a 429
 * before a single request had been made from it, which is how this reads in
 * practice.
 */

export const TRANSLATION_FAILURES = [
    "empty",
    "too_long",
    "unsupported_language",
    "blocked",
    "unreachable",
    "unreadable",
] as const;

export type TranslationFailure = (typeof TRANSLATION_FAILURES)[number];

export type TranslationState =
    | { readonly phase: "idle" }
    | { readonly phase: "working"; readonly done: number; readonly total: number }
    | { readonly phase: "failed"; readonly reason: TranslationFailure };

export type TranslationResult = {
    readonly text: string;
    /** Google's code for what it detected, or `null` when it did not say. */
    readonly source: string | null;
};

class TranslationStop extends Error {
    constructor(readonly reason: TranslationFailure) {
        super(reason);
    }
}

async function translateRun(text: string, target: string, signal: AbortSignal) {
    let response: Response;

    try {
        response = await fetch(buildTranslateUrl(text, target), {
            signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
        });
    } catch (caught) {
        if (signal.aborted) {
            throw caught;
        }

        // A dropped connection, a network that blocks Google, and a block
        // page served without CORS headers all arrive as the same TypeError;
        // the browser does not let a page tell them apart.
        logEvent("warn", "text_to_speech.translate_unreachable", { error: describeError(caught) });

        throw new TranslationStop("unreachable");
    }

    if (response.status === 429 || response.status === 403) {
        throw new TranslationStop("blocked");
    }

    if (response.status === 400) {
        throw new TranslationStop("unsupported_language");
    }

    if (!response.ok) {
        throw new TranslationStop("unreachable");
    }

    let body: unknown;

    try {
        body = await response.json();
    } catch {
        throw new TranslationStop("unreadable");
    }

    const read = readTranslation(body);

    if (read === null) {
        logEvent("warn", "text_to_speech.translate_unreadable");

        throw new TranslationStop("unreadable");
    }

    return read;
}

export type TextTranslation = {
    readonly state: TranslationState;
    /** Resolves with the translated box, or `null` on failure or cancel. */
    readonly translate: (text: string, target: string) => Promise<TranslationResult | null>;
    readonly reset: () => void;
};

export function useTextTranslation(): TextTranslation {
    const [state, setState] = useState<TranslationState>({ phase: "idle" });
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => controllerRef.current?.abort(), []);

    async function translate(text: string, target: string): Promise<TranslationResult | null> {
        const plan = planTranslation(text);

        if (!plan.ok) {
            setState({ phase: "failed", reason: plan.reason });

            return null;
        }

        controllerRef.current?.abort();

        const controller = new AbortController();

        controllerRef.current = controller;
        setState({ phase: "working", done: 0, total: plan.requests });

        const translated: string[] = [];
        let source: string | null = null;

        try {
            // One at a time, deliberately. A burst of parallel requests is
            // exactly the traffic shape the endpoint's limiter is watching for.
            for (const piece of plan.pieces) {
                if (piece.kind !== "translate") {
                    continue;
                }

                const run = await translateRun(piece.text, target, controller.signal);

                translated.push(run.text);
                source ??= run.source;
                setState({ phase: "working", done: translated.length, total: plan.requests });
            }
        } catch (caught) {
            if (controller.signal.aborted) {
                return null;
            }

            setState({
                phase: "failed",
                reason: caught instanceof TranslationStop ? caught.reason : "unreadable",
            });

            return null;
        } finally {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
            }
        }

        setState({ phase: "idle" });

        return { text: assembleTranslation(plan.pieces, translated), source };
    }

    function reset() {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setState({ phase: "idle" });
    }

    return { state, translate, reset };
}
