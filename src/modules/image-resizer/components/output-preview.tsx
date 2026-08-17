"use client";

import { cn } from "@/lib/utils";
import { previewFrameMaxWidth } from "@/modules/tools/domain/preview-frame";
import { previewLayout } from "../domain/preview-geometry";
import type { RenderPlan } from "../types";
import type { PixelSize } from "@/modules/tools/types";

/**
 * What the file will look like, drawn by the browser's layout engine.
 *
 * Three nested boxes and no pixel work — see `domain/preview-geometry.ts` for
 * the arithmetic and why it is done this way. Every number comes from the same
 * `RenderPlan` the exporter reads, so what is on screen and what lands in the
 * download cannot disagree about geometry; the one thing this cannot show is
 * what the encoder does to the pixels, which is what the format picker and the
 * quality slider are for.
 *
 * Free to re-render, which is the point: it updates on the keystroke rather than
 * on a press, and it keeps updating while the crop tool is open.
 */

type OutputPreviewProps = {
    readonly previewUrl: string;
    readonly alt: string;
    readonly source: PixelSize;
    readonly plan: RenderPlan;
    readonly className?: string;
};

export function OutputPreview({ previewUrl, alt, source, plan, className }: OutputPreviewProps) {
    const layout = previewLayout(source, plan);

    return (
        <div
            style={{
                aspectRatio: layout.canvasAspect,
                maxWidth: previewFrameMaxWidth(plan.canvas),
                backgroundColor:
                    plan.matte === null
                        ? undefined
                        : `rgb(${plan.matte.r} ${plan.matte.g} ${plan.matte.b})`,
            }}
            className={cn(
                "ring-border/70 relative mx-auto w-full overflow-hidden rounded-xl ring-1 ring-inset",
                /*
                 * The chequerboard that means "nothing here", and painted only
                 * when there is nothing there.
                 *
                 * It used to be unconditional, on the theory that the matte
                 * above would cover it. It cannot: the chequerboard is a
                 * `background-image` and a browser paints those *over*
                 * `background-color`, so an opaque gradient hid every colour the
                 * reader picked. The export was compositing onto the matte
                 * correctly the whole time — only this frame was lying about it,
                 * which is the worse half, because the frame is what anybody
                 * checks. Gated the way `compare-slider` and the background
                 * remover already gate theirs.
                 */
                plan.matte === null && "bg-checkerboard",
                className,
            )}
        >
            <div
                style={{
                    left: layout.draw.left,
                    top: layout.draw.top,
                    width: layout.draw.width,
                    height: layout.draw.height,
                }}
                className="absolute overflow-hidden"
            >
                {/* An object URL for bytes made in this tab, blown up so the
                    crop — not the whole picture — fills this box. */}
                <img
                    src={previewUrl}
                    alt={alt}
                    draggable={false}
                    decoding="async"
                    style={{
                        left: layout.image.left,
                        top: layout.image.top,
                        width: layout.image.width,
                        height: layout.image.height,
                    }}
                    className="absolute max-w-none"
                />
            </div>
        </div>
    );
}
