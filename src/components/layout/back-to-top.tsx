"use client";

import { IconArrowUp } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/modules/tools/components/use-result-scroll";

/** The id the skip link already targets; focus lands there after the jump. */
const MAIN_CONTENT_ID = "main-content";

function subscribe(onChange: () => void): () => void {
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);

    return () => {
        window.removeEventListener("scroll", onChange);
        window.removeEventListener("resize", onChange);
    };
}

/** Shown once the reader is a full screen down — before that, the top is a flick away. */
function isPastFirstScreen(): boolean {
    return window.scrollY > window.innerHeight;
}

/**
 * Floating "back to top" control. Hidden on the server and on first paint
 * (pages prerender, and scroll position is the host's), then follows the
 * window's scroll.
 */
export function BackToTop() {
    const t = useTranslations("nav");
    const visible = useSyncExternalStore(subscribe, isPastFirstScreen, () => false);

    function handleClick() {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
        // The button hides once the page is back at the top; without this a
        // keyboard reader's focus would be left on a control that is gone.
        document.getElementById(MAIN_CONTENT_ID)?.focus({ preventScroll: true });
    }

    return (
        <Button
            type="button"
            size="icon-lg"
            aria-label={t("backToTop")}
            title={t("backToTop")}
            inert={!visible}
            onClick={handleClick}
            className={cn(
                // Solid primary: an outline button vanishes into the dark shell wash.
                "ring-border fixed right-4 bottom-4 z-30 size-11 rounded-full shadow-lg ring-1 sm:right-6 sm:bottom-6",
                "transition-[opacity,translate] duration-200 motion-reduce:transition-none",
                visible ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
            )}
        >
            <IconArrowUp className="size-5" stroke={2} aria-hidden="true" />
        </Button>
    );
}
