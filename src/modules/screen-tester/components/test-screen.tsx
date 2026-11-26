import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { IDLE_MS, keyStep, patternBackground, SOLID_COLOURS } from "../domain/patterns";
import { SCREEN_PATTERNS, type ScreenDisplay, type ScreenStep } from "../types";

type TestScreenProps = {
    index: number;
    display: ScreenDisplay;
    customColour: string;
    onStep: (step: ScreenStep) => void;
};

/**
 * The running test: one pattern over the whole screen, and a small guide that
 * fades with the cursor once the reader stops moving, so nothing sits over the
 * pixels being looked at. A pattern changes only when the reader asks — there
 * is deliberately no timer that advances it.
 */
export function TestScreen({ index, display, customColour, onStep }: TestScreenProps) {
    const t = useTranslations("screenTester.workbench");
    const tPatterns = useTranslations("screenTester.patterns");

    const surfaceRef = useRef<HTMLDivElement>(null);
    const idleTimer = useRef<number | undefined>(undefined);
    const [idle, setIdle] = useState(false);

    useEffect(() => {
        const timer = idleTimer;
        timer.current = window.setTimeout(() => setIdle(true), IDLE_MS);

        return () => window.clearTimeout(timer.current);
    }, []);

    function wake() {
        setIdle(false);
        window.clearTimeout(idleTimer.current);
        idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
    }

    function step(direction: ScreenStep) {
        wake();
        onStep(direction);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        wake();
        const direction = keyStep(event.key);

        // A focused button answers Space and Enter itself; stepping here as
        // well would move two screens at once.
        if (
            direction === null ||
            (event.target instanceof HTMLButtonElement &&
                (event.key === " " || event.key === "Enter"))
        ) {
            return;
        }

        event.preventDefault();
        onStep(direction);
    }

    const pattern = SCREEN_PATTERNS[index];
    const background = patternBackground(pattern, customColour);

    return (
        <DialogContent
            showCloseButton={false}
            // The surface, not the first button: Space on a focused Exit
            // button would end the test the reader meant to step through.
            initialFocus={surfaceRef}
            onKeyDown={handleKeyDown}
            onPointerMove={wake}
            className={cn(
                "inset-0 block w-full max-w-none translate-x-0 translate-y-0 touch-none rounded-none p-0 ring-0 select-none sm:max-w-none",
                idle && "cursor-none",
            )}
        >
            <DialogTitle className="sr-only">{t("screen.title")}</DialogTitle>

            <div
                ref={surfaceRef}
                tabIndex={-1}
                className="absolute inset-0"
                style={background === null ? undefined : { background }}
                onClick={() => step("next")}
            >
                {background === null && <CheckerCanvas />}
            </div>

            <div
                className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
                    "transition-opacity duration-300 motion-reduce:transition-none",
                    idle && "opacity-0",
                )}
            >
                <div
                    className={cn(
                        "bg-popover text-popover-foreground ring-border flex max-w-full flex-col items-center gap-2 rounded-2xl p-3 ring-1",
                        !idle && "pointer-events-auto",
                    )}
                >
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={t("screen.previous")}
                            onClick={() => step("previous")}
                        >
                            <IconChevronLeft className="size-4" stroke={1.8} aria-hidden="true" />
                        </Button>
                        <p
                            aria-live="polite"
                            className="min-w-28 text-center text-sm leading-[1.3] font-medium"
                        >
                            {tPatterns(`${pattern}.name`)}{" "}
                            <span className="text-muted-foreground font-normal">
                                ·{" "}
                                {t("screen.position", {
                                    current: index + 1,
                                    total: SCREEN_PATTERNS.length,
                                })}
                            </span>
                        </p>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={t("screen.next")}
                            onClick={() => step("next")}
                        >
                            <IconChevronRight className="size-4" stroke={1.8} aria-hidden="true" />
                        </Button>
                        <DialogClose render={<Button variant="outline" size="sm" />}>
                            <IconX className="size-3.5" stroke={1.8} aria-hidden="true" />
                            {t("screen.exit")}
                        </DialogClose>
                    </div>
                    <DialogDescription className="text-center text-xs leading-[1.3]">
                        {t("screen.guide")}
                    </DialogDescription>
                    {display !== "fullscreen" && (
                        <p className="text-center text-xs leading-[1.3]">
                            {t(`screen.${display}`)}
                        </p>
                    )}
                </div>
            </div>
        </DialogContent>
    );
}

/**
 * A one-pixel checkerboard on the screen's own pixels. A CSS pattern would be
 * laid out in CSS pixels and resampled to grey on any display that scales, so
 * the canvas backing store is sized in device pixels and filled from a 2×2
 * tile with no transform.
 */
function CheckerCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;

        if (canvas === null) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => {
            const device = entry.devicePixelContentBoxSize?.[0];

            // shortcut: without a device-pixel box (Safari) the CSS box is
            // rounded, which can land a pixel off at fractional scales; exact
            // wherever `device-pixel-content-box` is supported.
            paintChecker(
                canvas,
                device?.inlineSize ?? Math.round(entry.contentRect.width * window.devicePixelRatio),
                device?.blockSize ?? Math.round(entry.contentRect.height * window.devicePixelRatio),
            );
        });

        try {
            observer.observe(canvas, { box: "device-pixel-content-box" });
        } catch {
            // The box option is an enum; a browser without it throws, and the
            // content box is the fallback above.
            observer.observe(canvas);
        }

        return () => observer.disconnect();
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" className="block size-full" />;
}

function paintChecker(canvas: HTMLCanvasElement, width: number, height: number) {
    const tile = document.createElement("canvas");
    tile.width = 2;
    tile.height = 2;

    const tileContext = tile.getContext("2d");
    const context = canvas.getContext("2d");

    if (tileContext === null || context === null || width === 0 || height === 0) {
        return;
    }

    tileContext.fillStyle = SOLID_COLOURS.black;
    tileContext.fillRect(0, 0, 2, 2);
    tileContext.fillStyle = SOLID_COLOURS.white;
    tileContext.fillRect(0, 0, 1, 1);
    tileContext.fillRect(1, 1, 1, 1);

    canvas.width = width;
    canvas.height = height;

    const pattern = context.createPattern(tile, "repeat");

    if (pattern === null) {
        return;
    }

    context.fillStyle = pattern;
    context.fillRect(0, 0, width, height);
}
