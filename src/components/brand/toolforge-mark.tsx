import { cn } from "@/lib/utils";

/**
 * Brand mark. The gradient lives on the wrapper as a CSS background rather than
 * an SVG `<defs>` so the mark can be rendered many times per page without
 * colliding gradient ids.
 */
export function ToolForgeMark({ className }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[0.55rem]",
                "from-brand-violet via-brand-violet to-brand-cyan bg-linear-140",
                "shadow-[0_1px_2px_oklch(0_0_0/0.28),inset_0_1px_0_oklch(1_0_0/0.28)]",
                className,
            )}
        >
            <svg
                viewBox="0 0 32 32"
                fill="none"
                className="size-[62%] text-white drop-shadow-[0_1px_1px_oklch(0_0_0/0.25)]"
            >
                <path
                    d="M18.6 3.4 8.2 18.1a.9.9 0 0 0 .73 1.42h4.4l-1.7 9.24a.6.6 0 0 0 1.07.46l10.5-14.83a.9.9 0 0 0-.73-1.42h-4.5l1.63-8.98a.6.6 0 0 0-1.06-.47Z"
                    fill="currentColor"
                />
            </svg>
        </span>
    );
}

export function ToolForgeWordmark({ className }: { className?: string }) {
    return (
        <span className={cn("font-heading text-[0.95rem] font-semibold tracking-tight", className)}>
            Tool<span className="text-muted-foreground">Forge</span>
        </span>
    );
}
