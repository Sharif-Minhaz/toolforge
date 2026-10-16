import { cn } from "@/lib/utils";
import { LOCK_KEYS, type LockKey, type LockStates } from "../types";

/**
 * Num Lock, Caps Lock and Scroll Lock, as the three lights over a full-size
 * board's number pad. Scroll Lock is the one people wonder about: it once
 * made the arrow keys scroll the window instead of moving the cursor, and
 * today mostly Excel and a few KVM switches still listen to it.
 *
 * The names printed beside the lights are cap names — data, like the caps
 * themselves — and the lights are decorative; the state is also said in words
 * beside the board.
 */

const PRINTED: Readonly<Record<LockKey, string>> = {
    NumLock: "Num",
    CapsLock: "Caps",
    ScrollLock: "Scroll",
};

export function LockLights({ locks, className }: { locks: LockStates; className?: string }) {
    return (
        <span aria-hidden="true" className={cn("flex items-center gap-[1em]", className)}>
            {LOCK_KEYS.map((key) => {
                const on = locks?.[key] === true;

                return (
                    <span key={key} className="flex items-center gap-[0.35em]">
                        <span
                            className={cn(
                                "size-[0.6em] rounded-full ring-1 transition-[background-color,box-shadow] duration-150",
                                locks === null
                                    ? "bg-muted ring-border"
                                    : on
                                      ? "bg-success ring-success shadow-[0_0_0.6em_var(--success)]"
                                      : "bg-muted-foreground/25 ring-border",
                            )}
                        />
                        <span className="text-muted-foreground text-[0.7em] leading-none tracking-wide uppercase">
                            {PRINTED[key]}
                        </span>
                    </span>
                );
            })}
        </span>
    );
}
