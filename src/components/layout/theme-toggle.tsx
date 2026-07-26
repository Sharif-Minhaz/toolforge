"use client";

import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";

import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { cn } from "@/lib/utils";

const OPTIONS = [
    { value: "light", Icon: IconSun },
    { value: "dark", Icon: IconMoon },
    { value: "system", Icon: IconDeviceDesktop },
] as const;

type ThemeToggleProps = {
    className?: string;
    /** Distinguishes the sliding indicator between the desktop and mobile copies. */
    layoutIdPrefix: string;
};

/** Three-way segmented control with a shared-layout indicator. */
export function ThemeToggle({ className, layoutIdPrefix }: ThemeToggleProps) {
    const t = useTranslations("theme");
    const { theme, setTheme } = useTheme();
    // `theme` is only known once the client has read storage, so the first pass
    // renders a neutral track and the selection appears after hydration.
    const hydrated = useIsHydrated();

    return (
        <div
            role="radiogroup"
            aria-label={t("label")}
            className={cn(
                "bg-muted/70 ring-border/70 relative inline-flex items-center gap-0.5 rounded-full p-0.5 ring-1 ring-inset",
                className,
            )}
        >
            {OPTIONS.map(({ value, Icon }) => {
                const selected = hydrated && theme === value;

                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={t(value)}
                        onClick={() => setTheme(value)}
                        className={cn(
                            "relative grid size-6 place-items-center rounded-full transition-colors duration-200 outline-none",
                            "focus-visible:ring-ring focus-visible:ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-offset-1",
                            selected
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId={`${layoutIdPrefix}-theme-indicator`}
                                className="bg-card ring-border/80 absolute inset-0 rounded-full shadow-sm ring-1"
                                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                            />
                        )}
                        <Icon className="relative size-3.5" stroke={1.9} />
                    </button>
                );
            })}
        </div>
    );
}
