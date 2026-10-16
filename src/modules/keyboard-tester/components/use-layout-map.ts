"use client";

import { useEffect, useState } from "react";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { keyboardApi } from "./keyboard-api";

/**
 * The reader's own layout, where the browser will say (Chromium only). `null`
 * until it arrives and wherever it never does — the server render, Firefox,
 * Safari — and the US caps are drawn instead. Nothing about testing depends on
 * it: keys are matched by physical position.
 *
 * Read again when the window regains focus, because that is when somebody who
 * switched layouts in the system tray comes back.
 */
export function useLayoutMap(): ReadonlyMap<string, string> | null {
    const [layoutMap, setLayoutMap] = useState<ReadonlyMap<string, string> | null>(null);

    useEffect(() => {
        const read = keyboardApi()?.getLayoutMap;

        if (read === undefined) {
            return;
        }

        let cancelled = false;

        function refresh() {
            read?.call(keyboardApi())
                .then((map) => {
                    if (!cancelled) {
                        setLayoutMap(new Map(map));
                    }
                })
                .catch((caught: unknown) => {
                    // Refused inside a cross-origin frame; the US caps stand.
                    logEvent("warn", "keyboard_tester.layout_map_failed", {
                        error: describeError(caught),
                    });
                });
        }

        refresh();
        window.addEventListener("focus", refresh);

        return () => {
            cancelled = true;
            window.removeEventListener("focus", refresh);
        };
    }, []);

    return layoutMap;
}
