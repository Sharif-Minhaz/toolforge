"use client";

import { IconAlertTriangle, IconArrowsExchange, IconCircleCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import type { ConversionNote } from "../types";

/**
 * The cURL converter's list, over this tool's catalogue. Lifting it would take
 * the translator, the title, the empty line and both kind labels as
 * parameters, which costs more than the duplicate.
 */
export function NotesList({ notes }: { notes: readonly ConversionNote[] }) {
    const t = useTranslations("dockerCompose.workbench");
    const tNotes = useTranslations("dockerCompose.notes");

    if (notes.length === 0) {
        return (
            <p className="text-muted-foreground flex items-start gap-2 text-[0.8125rem] leading-relaxed">
                <IconCircleCheck
                    className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]"
                    stroke={1.8}
                    aria-hidden="true"
                />
                {t("notesEmpty")}
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">{t("notesTitle")}</p>

            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {notes.map((note) => {
                    const dropped = note.kind === "dropped";
                    const Icon = dropped ? IconAlertTriangle : IconArrowsExchange;

                    return (
                        <li
                            key={`${note.id}-${note.detail ?? ""}`}
                            className="bg-muted/30 ring-border/70 flex min-w-0 items-start gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-inset"
                        >
                            <Icon
                                className={
                                    dropped
                                        ? "text-brand-amber mt-0.5 size-4 shrink-0"
                                        : "text-primary mt-0.5 size-4 shrink-0"
                                }
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            <span className="flex min-w-0 flex-col gap-1">
                                <span className="text-muted-foreground text-[0.8125rem] leading-relaxed wrap-break-word">
                                    {tNotes(note.id, { detail: note.detail ?? "" })}
                                </span>
                                <span className="text-muted-foreground/70 text-xs leading-[1.4] font-medium">
                                    {dropped ? t("kindDropped") : t("kindAdapted")}
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
