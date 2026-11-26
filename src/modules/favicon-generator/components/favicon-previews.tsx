"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { context2d } from "@/modules/tools/domain/canvas";
import { planIcon } from "../domain/layout";
import { maskableApplies } from "../domain/options";
import { drawIcon, measureInk, toGlyphStyle } from "../domain/render";
import type { FaviconOptions, IconPurpose } from "../types";
import { loadGlyphFont, resolveFontStack } from "./glyph-font";

type Preview = {
    readonly key: "tab16" | "tab32" | "home" | "maskable";
    readonly purpose: IconPurpose;
    readonly size: number;
    /** Display size. A 180 is shown at half, so it reads as an icon, not a poster. */
    readonly display: string;
    readonly mask?: string;
};

const PREVIEWS: readonly Preview[] = [
    { key: "tab16", purpose: "icon", size: 16, display: "size-4" },
    { key: "tab32", purpose: "icon", size: 32, display: "size-8" },
    // iOS rounds the home-screen icon itself; the file stays a full square.
    { key: "home", purpose: "apple", size: 180, display: "size-[90px]", mask: "rounded-[22%]" },
    // Under a circle, the mask Android launchers most often apply.
    {
        key: "maskable",
        purpose: "maskable",
        size: 180,
        display: "size-[90px]",
        mask: "rounded-full",
    },
];

type FaviconPreviewsProps = {
    options: FaviconOptions;
    /** The options cannot be drawn; the last drawing stays, dimmed. */
    stale: boolean;
};

/**
 * The icons at the sizes that matter, drawn exactly as the pack draws them.
 *
 * Painting happens in an effect because a canvas is written to rather than
 * rendered — no state is set, so the server pass emits empty canvases of the
 * right size and hydration has nothing to disagree about. Not debounced: four
 * small canvases cost less than a frame, and a lagging preview reads broken.
 */
export function FaviconPreviews({ options, stale }: FaviconPreviewsProps) {
    const t = useTranslations("faviconGenerator.workbench");
    const canvases = useRef(new Map<Preview["key"], HTMLCanvasElement>());
    const showMaskable = maskableApplies(options);
    const shown = PREVIEWS.filter((preview) => preview.key !== "maskable" || showMaskable);

    useEffect(() => {
        if (stale) {
            return;
        }

        let cancelled = false;
        const stack = resolveFontStack(options.font);
        const style = toGlyphStyle(options, stack);

        void loadGlyphFont(stack, options.bold, options.text).then(() => {
            if (cancelled) {
                return;
            }

            for (const preview of PREVIEWS) {
                const canvas = canvases.current.get(preview.key);
                const ctx = canvas === undefined ? null : context2d(canvas);

                if (ctx === null) {
                    continue;
                }

                drawIcon(
                    ctx,
                    planIcon(preview.purpose, preview.size, options),
                    style,
                    measureInk(ctx, style),
                );
            }
        });

        return () => {
            cancelled = true;
        };
    }, [options, stale]);

    return (
        <ul
            className={cn(
                "flex flex-wrap items-end gap-x-6 gap-y-4 transition-opacity duration-200",
                stale && "opacity-55",
            )}
        >
            {shown.map((preview) => (
                <li key={preview.key}>
                    <figure className="flex flex-col items-center gap-2">
                        <canvas
                            ref={(node) => {
                                if (node === null) {
                                    canvases.current.delete(preview.key);
                                } else {
                                    canvases.current.set(preview.key, node);
                                }
                            }}
                            width={preview.size}
                            height={preview.size}
                            aria-hidden="true"
                            className={cn(preview.display, preview.mask)}
                        />
                        <figcaption className="text-muted-foreground flex flex-col items-center text-[0.6875rem] leading-[1.3]">
                            <span>{t(`previews.${preview.key}`)}</span>
                            <span className="font-mono">
                                {preview.size}×{preview.size}
                            </span>
                        </figcaption>
                    </figure>
                </li>
            ))}
        </ul>
    );
}
