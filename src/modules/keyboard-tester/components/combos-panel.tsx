"use client";

import { IconCircleCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { GhostCombo } from "../domain/combos";

/**
 * The chords a cheap matrix blocks, one card each. A key that stays dark while
 * the rest of its chord lights is the one the matrix refused — that is the
 * whole readout, because a key that never arrives cannot be detected any
 * other way.
 */

type CombosPanelProps = {
    combos: readonly GhostCombo[];
    passed: readonly string[];
    held: ReadonlySet<string>;
    nameOf: (code: string) => string;
};

export function CombosPanel({ combos, passed, held, nameOf }: CombosPanelProps) {
    const t = useTranslations("keyboardTester.rollover");
    const tCombos = useTranslations("keyboardTester.combos");

    return (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {combos.map((combo) => {
                const done = passed.includes(combo.id);
                const live = combo.codes.filter((code) => held.has(code)).length;

                return (
                    <li
                        key={combo.id}
                        className={cn(
                            "flex flex-col gap-2 rounded-xl p-3 ring-1 ring-inset",
                            done ? "bg-success/5 ring-success/40" : "ring-border/60",
                        )}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-[0.8125rem] leading-5 font-medium">
                                {tCombos(combo.id)}
                            </span>
                            <span
                                className={cn(
                                    "inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium whitespace-nowrap",
                                    done ? "text-success" : "text-muted-foreground",
                                )}
                            >
                                {done ? (
                                    <>
                                        <IconCircleCheck
                                            className="size-3.5"
                                            stroke={2}
                                            aria-hidden="true"
                                        />
                                        {t("passed")}
                                    </>
                                ) : live > 0 ? (
                                    t("progress", { held: live, total: combo.codes.length })
                                ) : (
                                    t("notYet")
                                )}
                            </span>
                        </div>
                        <span className="flex flex-wrap gap-1">
                            {combo.codes.map((code) => (
                                <span
                                    key={code}
                                    className={cn(
                                        "min-w-7 rounded-md px-1.5 py-1 text-center font-mono text-[0.75rem] leading-none ring-1 ring-inset",
                                        held.has(code)
                                            ? "bg-primary text-primary-foreground ring-primary"
                                            : done
                                              ? "bg-success/15 ring-success/50"
                                              : "bg-muted/40 ring-border text-muted-foreground",
                                    )}
                                >
                                    {nameOf(code)}
                                </span>
                            ))}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
