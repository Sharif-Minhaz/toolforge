import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { labelScale, type KeyLabel } from "../domain/labels";
import type { KeyboardLayout, LayoutKey } from "../types";

/**
 * The board, drawn to scale. Keys are placed in percentages of the board's
 * own width and height, so the drawing scales as one piece; the caps' text is
 * sized in container units for the same reason.
 *
 * Decorative to assistive technology: every state it shows is also said in
 * words — the progress count, the list of keys left, the chatter list.
 */

export type KeyState = "untested" | "held" | "tested" | "chatter";

const STATE_CLASS: Record<KeyState, string> = {
    untested: "bg-muted/40 text-muted-foreground ring-border",
    held: "bg-primary text-primary-foreground ring-primary",
    tested: "bg-success/15 text-foreground ring-success/50",
    chatter: "bg-destructive/15 text-destructive ring-destructive",
};

/** The ISO Enter's notch: its bounding box less the corner Backslash sits in. */
const ISO_ENTER_CLIP = "polygon(0 0, 100% 0, 100% 100%, 16.667% 100%, 16.667% 50%, 0 50%)";

/** The gap around each cap, in key units. */
const INSET = 0.05;

type KeyboardViewProps = {
    layout: KeyboardLayout;
    /** Drawn in the board's indicator corner, where it has one. */
    indicator?: ReactNode;
    labelOf: (code: string) => KeyLabel;
    stateOf: (code: string) => KeyState;
    fnLabel: string;
};

export function KeyboardView({ layout, indicator, labelOf, stateOf, fnLabel }: KeyboardViewProps) {
    const percentX = (value: number) => `${(value / layout.width) * 100}%`;
    const percentY = (value: number) => `${(value / layout.height) * 100}%`;

    function place(key: LayoutKey) {
        return {
            left: percentX(key.x + INSET),
            top: percentY(key.y + INSET),
            width: percentX(key.w - INSET * 2),
            height: percentY(key.h - INSET * 2),
        };
    }

    return (
        <div aria-hidden="true" className="@container w-full select-none">
            <div
                className="relative w-full"
                style={{
                    aspectRatio: `${layout.width} / ${layout.height}`,
                    // A third of a key unit, so a 60% board's caps read larger
                    // than a full board's at the same width.
                    fontSize: `${(100 / layout.width) * 0.3}cqw`,
                }}
            >
                {layout.indicatorArea !== null && indicator !== undefined && (
                    <div
                        className="absolute"
                        style={{
                            left: percentX(layout.indicatorArea.x),
                            top: percentY(layout.indicatorArea.y),
                            width: percentX(layout.indicatorArea.w),
                            height: percentY(layout.indicatorArea.h),
                        }}
                    >
                        {indicator}
                    </div>
                )}

                {layout.keys.map((key, index) => {
                    if (key.code === null) {
                        return (
                            <div
                                key={`fn-${index}`}
                                style={place(key)}
                                className="text-muted-foreground/70 absolute grid place-items-center rounded-[0.35em] border border-dashed border-current leading-none"
                            >
                                {fnLabel}
                            </div>
                        );
                    }

                    const label = labelOf(key.code);
                    const state = stateOf(key.code);

                    return (
                        <div
                            key={key.code}
                            style={{
                                ...place(key),
                                clipPath: key.shape === "isoEnter" ? ISO_ENTER_CLIP : undefined,
                            }}
                            className={cn(
                                "absolute flex flex-col items-center justify-center gap-[0.15em] overflow-hidden rounded-[0.35em] px-[0.2em] leading-none font-medium",
                                // A clipped shape loses its ring to the clip, so
                                // the ISO Enter is drawn by its fill alone.
                                key.shape === "isoEnter" ? "" : "ring-1 ring-inset",
                                "transition-colors duration-75",
                                STATE_CLASS[state],
                                key.shape === "isoEnter" &&
                                    "items-end justify-start pt-[0.6em] pr-[0.6em]",
                            )}
                        >
                            {label.shifted !== undefined && (
                                <span className="text-[0.8em] opacity-70">{label.shifted}</span>
                            )}
                            <span
                                className="max-w-full truncate"
                                style={{ fontSize: `${labelScale(key.w, label.main)}em` }}
                            >
                                {label.main}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
