"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { IconCopyButton } from "@/modules/tools/components/copy-button";
import { buildSnippet, SNIPPET_KINDS, type SnippetKind } from "../domain/snippets";
import type { BlurPlaceholder } from "../types";
import { BlurPreview } from "./blur-preview";

export type OutputCopyKey = "hash" | "dataUri" | "snippet";

type PlaceholderOutputProps = {
    placeholder: BlurPlaceholder;
    punch: number;
    sourceWidth: number;
    sourceHeight: number;
    filename: string;
    /** Object URL of the picked picture, so the blur can be judged against it. */
    sourceUrl: string | null;
    sourceName: string | null;
    snippet: SnippetKind;
    /** Dimmed while a newer run is still working, never blanked. */
    stale: boolean;
    copied: OutputCopyKey | null;
    onSnippetChange: (kind: SnippetKind) => void;
    onCopy: (key: OutputCopyKey, value: string) => void;
};

export function PlaceholderOutput({
    placeholder,
    punch,
    sourceWidth,
    sourceHeight,
    filename,
    sourceUrl,
    sourceName,
    snippet,
    stale,
    copied,
    onSnippetChange,
    onCopy,
}: PlaceholderOutputProps) {
    const t = useTranslations("blurPlaceholder.workbench");
    const tSnippets = useTranslations("blurPlaceholder.snippets");
    const format = useFormatter();
    const byteLabel = useByteLabel();

    const snippetText = buildSnippet(snippet, {
        placeholder,
        punch,
        sourceWidth,
        sourceHeight,
        filename,
    });

    const frame = "ring-border/70 overflow-hidden rounded-xl ring-1 ring-inset";
    const caption = "text-muted-foreground text-[0.6875rem] leading-normal";

    return (
        <div
            className={cn(
                "flex min-w-0 flex-col gap-4 transition-opacity duration-200",
                stale && "opacity-55",
            )}
        >
            {/*
             * Side by side and the same size, because "does this look like my
             * picture" is the only question this tool is really asked, and it
             * cannot be answered against a 48-pixel thumbnail in another row.
             */}
            <div className={cn("grid min-w-0 gap-3", sourceUrl !== null && "sm:grid-cols-2")}>
                {sourceUrl !== null && (
                    <figure className="flex min-w-0 flex-col gap-1.5">
                        <div
                            className={frame}
                            style={{
                                aspectRatio: `${placeholder.width} / ${placeholder.height}`,
                            }}
                        >
                            {/* Plain `<img>`: an object URL for a local file,
                                which `next/image` can neither fetch nor
                                optimise. */}
                            <img
                                src={sourceUrl}
                                alt={t("sourceAlt", { name: sourceName ?? "" })}
                                decoding="async"
                                className="size-full object-cover"
                            />
                        </div>
                        <figcaption className={caption}>{t("compareOriginal")}</figcaption>
                    </figure>
                )}

                <figure className="flex min-w-0 flex-col gap-1.5">
                    <div className={frame}>
                        <BlurPreview
                            hash={placeholder.hash}
                            width={placeholder.width}
                            height={placeholder.height}
                            punch={punch}
                            label={t("previewAlt")}
                        />
                    </div>
                    <figcaption className={caption}>
                        {/* Pixel dimensions mirror machine input, so they keep
                            Western digits in both locales. */}
                        {t("previewCaption", {
                            width: String(placeholder.width),
                            height: String(placeholder.height),
                        })}
                    </figcaption>
                </figure>
            </div>

            <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
                <Field
                    label={t("hashLabel")}
                    hint={t("hashHint", {
                        count: format.number(placeholder.hash.length),
                        x: String(placeholder.componentX),
                        y: String(placeholder.componentY),
                    })}
                    value={placeholder.hash}
                    copyLabel={t("copyHash")}
                    copied={copied === "hash"}
                    onCopy={() => onCopy("hash", placeholder.hash)}
                />

                <Field
                    label={t("dataUriLabel")}
                    hint={t("dataUriHint", { size: byteLabel(placeholder.dataUriBytes) })}
                    value={placeholder.dataUri}
                    copyLabel={t("copyDataUri")}
                    copied={copied === "dataUri"}
                    onCopy={() => onCopy("dataUri", placeholder.dataUri)}
                />
            </dl>

            <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl px-3 py-2.5 ring-1 ring-inset">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div role="tablist" aria-label={tSnippets("label")} className="flex gap-1">
                        {SNIPPET_KINDS.map((kind) => (
                            <button
                                key={kind}
                                type="button"
                                role="tab"
                                aria-selected={kind === snippet}
                                onClick={() => onSnippetChange(kind)}
                                className={cn(
                                    "h-7 rounded-lg px-2.5 text-xs leading-[1.3] font-medium transition-colors duration-200",
                                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                                    kind === snippet
                                        ? "bg-primary/10 text-primary ring-primary/25 ring-1 ring-inset"
                                        : "text-muted-foreground ring-border/70 hover:bg-muted hover:text-foreground ring-1 ring-inset",
                                )}
                            >
                                {tSnippets(kind)}
                            </button>
                        ))}
                    </div>

                    <IconCopyButton
                        copied={copied === "snippet"}
                        aria-label={t("copySnippet")}
                        onClick={() => onCopy("snippet", snippetText)}
                    />
                </div>

                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {tSnippets(`${snippet}Hint`)}
                </p>

                <pre className="min-w-0 overflow-x-auto font-mono text-[0.6875rem] leading-[1.6]">
                    <code>{snippetText}</code>
                </pre>
            </div>
        </div>
    );
}

type FieldProps = {
    label: string;
    hint: string;
    value: string;
    copyLabel: string;
    copied: boolean;
    onCopy: () => void;
};

/** One copyable string with its own caption. `min-w-0` throughout, or a
 *  200-character data URI blows the grid out at 390 px. */
function Field({ label, hint, value, copyLabel, copied, onCopy }: FieldProps) {
    return (
        <div className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5 ring-1 ring-inset">
            <div className="flex min-w-0 items-start justify-between gap-2">
                <dt className="text-[0.8125rem] leading-[1.3] font-medium">{label}</dt>
                <IconCopyButton copied={copied} aria-label={copyLabel} onClick={onCopy} />
            </div>
            <dd className="min-w-0">
                <p className="text-muted-foreground max-h-24 min-w-0 overflow-y-auto font-mono text-[0.6875rem] leading-[1.6] break-all">
                    {value}
                </p>
                <p className="text-muted-foreground/85 mt-1 text-[0.6875rem] leading-[1.4]">
                    {hint}
                </p>
            </dd>
        </div>
    );
}
