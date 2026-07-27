import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Brand mark. A raster rather than inline SVG because the artwork carries its
 * own gradients and highlights; it ships at 4× the rendered size so the 32px
 * sidebar logo stays crisp on a retina display.
 *
 * Decorative by design — the link that wraps it carries the accessible name.
 */
export function ToolForgeMark({ className }: { className?: string }) {
    return (
        <Image
            src="/brand-mark.webp"
            alt=""
            width={128}
            height={128}
            priority
            className={cn("size-8 shrink-0 select-none", className)}
        />
    );
}

export function ToolForgeWordmark({ className }: { className?: string }) {
    return (
        <span className={cn("font-heading text-[0.95rem] font-semibold tracking-tight", className)}>
            Tool<span className="text-muted-foreground">Forge</span>
        </span>
    );
}
