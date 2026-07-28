"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getCssNamedSwatches, getTailwindFamilies, type ResolvedSwatch } from "../domain/matching";
import { TAILWIND_VERSION } from "../domain/tailwind-palette";

type PaletteBrowserProps = {
    /** Hex of the colour currently picked, so the matching swatch reads as active. */
    activeHex: string;
    onSelect: (swatch: ResolvedSwatch) => void;
};

const FAMILIES = getTailwindFamilies();
const CSS_NAMES = getCssNamedSwatches();

function Swatch({
    swatch,
    active,
    label,
    onSelect,
}: {
    swatch: ResolvedSwatch;
    active: boolean;
    label: string;
    onSelect: (swatch: ResolvedSwatch) => void;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={() => onSelect(swatch)}
            style={{ background: swatch.hex }}
            className={cn(
                "focus-visible:ring-ring h-8 w-full min-w-8 rounded-md ring-1 ring-black/10 transition-transform duration-150 ring-inset hover:scale-105 focus-visible:ring-2 focus-visible:outline-none",
                active && "ring-2 ring-[var(--tool-accent)]",
            )}
        />
    );
}

/**
 * Every swatch in both built-in palettes, clickable straight into the picker.
 * The Tailwind grid scrolls sideways inside its own container rather than
 * widening the page at 390px.
 */
export function PaletteBrowser({ activeHex, onSelect }: PaletteBrowserProps) {
    const t = useTranslations("color.palette");

    return (
        <Card className="[--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent>
                <Tabs defaultValue="tailwind">
                    <TabsList>
                        <TabsTrigger value="tailwind">{t("tabs.tailwind")}</TabsTrigger>
                        <TabsTrigger value="css">{t("tabs.css")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="tailwind" className="flex flex-col gap-4 pt-3">
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.5]">
                            {t("tailwindNote", { version: TAILWIND_VERSION })}
                        </p>

                        <div className="-mx-1 overflow-x-auto px-1 pb-1">
                            <div className="flex min-w-140 flex-col gap-1.5">
                                {FAMILIES.map((group) => (
                                    <div
                                        key={group.family}
                                        className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2"
                                    >
                                        <span className="text-muted-foreground truncate font-mono text-[0.6875rem]">
                                            {group.family}
                                        </span>
                                        <div
                                            className="grid gap-1"
                                            style={{
                                                gridTemplateColumns: `repeat(${group.swatches.length}, minmax(0, 1fr))`,
                                            }}
                                        >
                                            {group.swatches.map((swatch) => (
                                                <Swatch
                                                    key={swatch.name}
                                                    swatch={swatch}
                                                    active={swatch.hex === activeHex}
                                                    label={`${swatch.name} ${swatch.hex}`}
                                                    onSelect={onSelect}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="css" className="flex flex-col gap-4 pt-3">
                        <p className="text-muted-foreground text-[0.6875rem] leading-[1.5]">
                            {t("cssNote", { count: CSS_NAMES.length })}
                        </p>

                        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                            {CSS_NAMES.map((swatch) => (
                                <li key={swatch.name} className="min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => onSelect(swatch)}
                                        aria-pressed={swatch.hex === activeHex}
                                        className={cn(
                                            "bg-card/60 ring-border/70 focus-visible:ring-ring flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 ring-1 transition-colors duration-150 ring-inset hover:bg-[color-mix(in_oklch,var(--tool-accent)_8%,transparent)] focus-visible:ring-2 focus-visible:outline-none",
                                            swatch.hex === activeHex &&
                                                "ring-2 ring-[var(--tool-accent)]",
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="size-5 shrink-0 rounded ring-1 ring-black/10 ring-inset"
                                            style={{ background: swatch.hex }}
                                        />
                                        <span className="min-w-0 flex-1 truncate text-left font-mono text-[0.6875rem]">
                                            {swatch.name}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
