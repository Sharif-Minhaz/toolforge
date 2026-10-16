import { cn } from "@/lib/utils";
import type { MouseButton, Verdict, WheelDirection } from "../types";

/**
 * A top-down mouse whose parts light while they are held.
 *
 * Decorative: every state it shows is also a number in the tiles beside it and
 * a line in the event log, so it is hidden from assistive technology rather
 * than described twice. A part that has been judged faulty keeps a red outline
 * after it is let go, so the picture answers "which one?" at a glance.
 */

type MouseDiagramProps = {
    held: ReadonlySet<MouseButton>;
    /** The wheel direction that just fired, lit for a moment. */
    flash: WheelDirection | null;
    verdicts: Readonly<Record<MouseButton, Verdict>>;
    labels: Readonly<Record<"left" | "right" | "back" | "forward", string>>;
};

function partClass(held: boolean, verdict: Verdict) {
    return cn(
        "transition-[fill,stroke] duration-100",
        held ? "fill-primary/30 stroke-primary" : "fill-muted/60 stroke-border",
        !held && verdict === "faulty" && "stroke-destructive",
        !held && verdict === "suspect" && "stroke-syntax-number",
    );
}

function arrowClass(lit: boolean) {
    return cn("transition-[fill] duration-100", lit ? "fill-primary" : "fill-muted-foreground/30");
}

export function MouseDiagram({ held, flash, verdicts, labels }: MouseDiagramProps) {
    return (
        <svg
            viewBox="0 0 220 330"
            aria-hidden="true"
            className="h-full max-h-80 w-auto overflow-visible select-none"
            strokeWidth={2}
        >
            {/* The shell. */}
            <path
                d="M30 120 C30 50 70 14 110 14 C150 14 190 50 190 120 L190 220 C190 284 154 316 110 316 C66 316 30 284 30 220 Z"
                className="fill-card stroke-border"
            />

            {/* Left and right buttons, split down the middle by the wheel well. */}
            <path
                d="M34 128 L34 118 C34 56 70 20 104 18 L104 128 Z"
                className={partClass(held.has("left"), verdicts.left)}
            />
            <path
                d="M186 128 L186 118 C186 56 150 20 116 18 L116 128 Z"
                className={partClass(held.has("right"), verdicts.right)}
            />
            <text
                x="68"
                y="96"
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] font-medium tracking-wider uppercase"
            >
                {labels.left}
            </text>
            <text
                x="152"
                y="96"
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] font-medium tracking-wider uppercase"
            >
                {labels.right}
            </text>

            {/* The wheel, which is also the middle button. */}
            <rect
                x="99"
                y="44"
                width="22"
                height="56"
                rx="11"
                className={partClass(held.has("middle"), verdicts.middle)}
            />
            <path d="M110 26 L118 37 L102 37 Z" className={arrowClass(flash === "up")} />
            <path d="M110 118 L118 107 L102 107 Z" className={arrowClass(flash === "down")} />
            <path d="M92 72 L84 64 L84 80 Z" className={arrowClass(flash === "left")} />
            <path d="M128 72 L136 64 L136 80 Z" className={arrowClass(flash === "right")} />

            {/* Side buttons on the thumb side: forward nearer the front. */}
            <rect
                x="14"
                y="150"
                width="18"
                height="44"
                rx="7"
                className={partClass(held.has("forward"), verdicts.forward)}
            />
            <rect
                x="14"
                y="202"
                width="18"
                height="44"
                rx="7"
                className={partClass(held.has("back"), verdicts.back)}
            />
            <text
                x="8"
                y="142"
                className="fill-muted-foreground text-[10px] font-medium tracking-wider uppercase"
            >
                {labels.forward}
            </text>
            <text
                x="8"
                y="262"
                className="fill-muted-foreground text-[10px] font-medium tracking-wider uppercase"
            >
                {labels.back}
            </text>
        </svg>
    );
}
