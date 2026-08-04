"use client";

import {
    IconAlertTriangle,
    IconArrowsExchange,
    IconCircleCheck,
    IconInfoCircle,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import type { ConversionNote, ConversionNoteKind } from "../types";

const ICONS = {
    lossy: IconAlertTriangle,
    adapted: IconArrowsExchange,
    info: IconInfoCircle,
} as const satisfies Record<ConversionNoteKind, unknown>;

/**
 * `lossy` is the only tone that warns. Painting an ordinary note amber teaches
 * the reader to ignore amber, which is exactly the colour the one note that
 * costs them something arrives in.
 */
const TONES = {
    lossy: "text-brand-amber",
    adapted: "text-primary",
    info: "text-muted-foreground",
} as const satisfies Record<ConversionNoteKind, string>;

type NotesListProps = {
    notes: readonly ConversionNote[];
};

export function NotesList({ notes }: NotesListProps) {
    const t = useTranslations("bson.workbench");
    const tNotes = useTranslations("bson.notes");
    const tKinds = useTranslations("bson.noteKinds");

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
                    const Icon = ICONS[note.kind];

                    return (
                        <li
                            key={note.id}
                            className="bg-card/60 ring-border/70 flex min-w-0 items-start gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-inset"
                        >
                            <Icon
                                className={`mt-0.5 size-4 shrink-0 ${TONES[note.kind]}`}
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            <span className="flex min-w-0 flex-col gap-1">
                                <span className="text-muted-foreground text-[0.8125rem] leading-relaxed wrap-break-word">
                                    {/* Every id is a member of a literal union,
                                        so each key here is checked at compile
                                        time. */}
                                    {tNotes(note.id)}
                                </span>
                                <span className="text-muted-foreground/70 text-[0.6875rem] leading-[1.4] font-medium tracking-wide uppercase">
                                    {tKinds(note.kind)}
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
