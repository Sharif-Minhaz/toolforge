"use client";

import { IconAlertTriangle, IconArrowsExchange, IconCircleCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import type { ConversionNote } from "../types";

type NotesListProps = {
    notes: readonly ConversionNote[];
};

/**
 * What did not carry across, named one item at a time.
 *
 * This is the half of the tool that stops a converted snippet from being a lie.
 * A `fetch` that quietly lost `--insecure` looks correct right up to the first
 * self-signed certificate, so every flag with no equivalent gets a line here
 * rather than being left out in silence.
 */
export function NotesList({ notes }: NotesListProps) {
    const t = useTranslations("curl.workbench");
    const tNotes = useTranslations("curl.notes");

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

            <ul className="flex flex-col gap-1.5">
                {notes.map((note) => {
                    const dropped = note.kind === "dropped";
                    const Icon = dropped ? IconAlertTriangle : IconArrowsExchange;

                    return (
                        <li
                            key={`${note.id}-${note.detail ?? ""}`}
                            className="bg-card/60 ring-border/70 flex min-w-0 items-start gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-inset"
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
                                    {/* Every id is a member of a literal union,
                                        so each key below is checked at compile
                                        time. `detail` is passed always; a
                                        message that names no placeholder simply
                                        ignores it. */}
                                    {tNotes(note.id, { detail: note.detail ?? "" })}
                                </span>
                                <span className="text-muted-foreground/70 text-[0.6875rem] leading-[1.4] font-medium tracking-wide uppercase">
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
