"use client";

import { useTranslations } from "next-intl";

import { StatusStrip } from "@/modules/tools/components/status-strip";
import type { PdfConversionNotes } from "../types";

/**
 * Everything the conversion threw away, said out loud.
 *
 * A converter that quietly drops a chart, cuts a sheet at two thousand rows, or
 * writes a page of empty boxes where somebody's language was has not converted
 * the document — it has produced a different one and said nothing. Each notice
 * is a warning rather than an error: the PDF is real and usable, and this is
 * what is not in it.
 *
 * Shown above the button rather than after the download, which is `CLAUDE.md`
 * rule 32's shape: a limitation the reader would want to know about belongs
 * beside the control, not in the article underneath.
 */

type ConversionNotesProps = {
    notes: PdfConversionNotes;
};

export function ConversionNotes({ notes }: ConversionNotesProps) {
    const t = useTranslations("pdfConverter.notices");
    const tScripts = useTranslations("pdfConverter.scripts");
    const tMdx = useTranslations("pdfConverter.mdx");

    const messages: string[] = [];

    // Split from the rest: a picture left behind because it points at the web
    // is not a format this tool cannot store, it is a request it refused to
    // make, and those are two different things to be told.
    const remote = notes.droppedImageTypes.includes("remote");
    const formats = notes.droppedImageTypes.filter((type) => type !== "remote");

    if (formats.length > 0) {
        messages.push(t("droppedImages", { count: formats.length, types: formats.join(", ") }));
    }

    if (remote) {
        messages.push(t("remoteImages"));
    }

    for (const entry of notes.truncated) {
        messages.push(t(TRUNCATION_KEYS[entry.kind], { kept: entry.kept, total: entry.total }));
    }

    if (notes.unsupportedScripts.length > 0) {
        messages.push(
            t("unsupportedScripts", {
                scripts: notes.unsupportedScripts.map((script) => tScripts(script)).join(", "),
            }),
        );
    }

    if (notes.strippedMdx.length > 0) {
        messages.push(
            t("strippedMdx", {
                items: notes.strippedMdx.map((kind) => tMdx(kind)).join(", "),
            }),
        );
    }

    if (messages.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-1.5">
            {messages.map((message) => (
                <StatusStrip key={message} tone="warning" message={message} />
            ))}
        </div>
    );
}

/** Built from a literal union, so a new truncation kind fails to compile. */
const TRUNCATION_KEYS = {
    sheets: "truncatedSheets",
    rows: "truncatedRows",
    columns: "truncatedColumns",
    slides: "truncatedSlides",
    blocks: "truncatedBlocks",
} as const satisfies Record<PdfConversionNotes["truncated"][number]["kind"], string>;
