"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { tracePaths } from "../domain/signal";
import type { RunTrace as Trace } from "./use-speed-test";

const WIDTH = 100;
const HEIGHT = 40;

/**
 * Every request of the run, in the order it finished: download as a filled
 * area, upload as a line, on one shared scale so the gap between them is real.
 * The requests grow from 100 kB to 250 MB, so the ramp is the line spinning
 * up — and a dip late in the run is the line, not the test.
 */
export function RunTrace({ trace }: { trace: Trace }) {
    const t = useTranslations("speedTest.workbench");
    const top = Math.max(0, ...trace.download, ...trace.upload);
    const download = tracePaths(trace.download, WIDTH, HEIGHT, top);
    const upload = tracePaths(trace.upload, WIDTH, HEIGHT, top);

    if (download === null && upload === null) {
        return null;
    }

    return (
        <figure className="flex flex-col gap-2">
            <figcaption className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[0.6875rem] leading-[1.3]">
                <span>{t("traceTitle")}</span>
                <span className="flex items-center gap-3">
                    <Key className="bg-primary">{t("download")}</Key>
                    <Key className="bg-chart-2">{t("upload")}</Key>
                </span>
            </figcaption>
            {/* Decorative: the tiles above carry the figures it is drawn from. */}
            <svg
                aria-hidden="true"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                preserveAspectRatio="none"
                className="border-border/70 h-14 w-full overflow-visible border-b"
            >
                {download !== null && (
                    <g className="text-primary">
                        <path d={download.area} fill="currentColor" fillOpacity={0.14} />
                        <path
                            d={download.line}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.5}
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                )}
                {upload !== null && (
                    <path
                        className="text-chart-2"
                        d={upload.line}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                    />
                )}
            </svg>
        </figure>
    );
}

function Key({ className, children }: { className: string; children: string }) {
    return (
        <span className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", className)} aria-hidden="true" />
            {children}
        </span>
    );
}
