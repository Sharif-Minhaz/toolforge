import { cn } from "@/lib/utils";

/**
 * A cube turning over, for the seconds a model call takes.
 *
 * Plain CSS 3D rather than three.js: three is behind a dynamic import that
 * only the finished model should pay for, and a spinner that needed a WebGL
 * context would be the slowest thing on the page to appear. Six faces on a
 * preserved-3D box, a quarter turn at a time (`--animate-cube-turn` in
 * `globals.css`). Under reduced motion the site-wide rule stops it on its
 * first frame, which is still a cube.
 *
 * Decorative: the words beside it carry the state, so it is hidden from
 * assistive technology.
 */

const FACES = [
    "rotateY(0deg)",
    "rotateY(90deg)",
    "rotateY(180deg)",
    "rotateY(270deg)",
    "rotateX(90deg)",
    "rotateX(-90deg)",
] as const;

export function ModelSpinner({ className }: { readonly className?: string }) {
    return (
        <div
            aria-hidden="true"
            className={cn("relative flex size-24 items-center justify-center", className)}
            style={{ perspective: "520px" }}
        >
            <div
                className="animate-cube-turn relative size-12"
                style={{ transformStyle: "preserve-3d" }}
            >
                {FACES.map((face) => (
                    <span
                        key={face}
                        className="border-primary/70 bg-primary/15 absolute inset-0 rounded-[3px] border"
                        style={{ transform: `${face} translateZ(1.5rem)` }}
                    />
                ))}
            </div>
            <span className="animate-cube-shadow bg-foreground absolute bottom-1 h-1.5 w-12 rounded-full blur-[3px]" />
        </div>
    );
}
