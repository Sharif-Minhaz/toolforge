"use client";

import { IconCheck, IconLoader2, IconPlus, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { DragEvent } from "react";

import { cn } from "@/lib/utils";

import { MAX_SHEETS } from "../domain/constants";

/** What the strip needs to know about one slot. Never the whole sheet. */
export type StripEntry = {
    readonly id: string;
    readonly name: string;
    readonly thumbnailUrl: string;
    readonly state: "idle" | "working" | "ready" | "failed";
};

type SourceStripProps = {
    readonly entries: readonly StripEntry[];
    readonly selectedId: string | null;
    readonly onSelect: (id: string) => void;
    readonly onRemove: (id: string) => void;
    readonly onAdd: (files: readonly File[]) => void;
    readonly accept: string;
    readonly disabled: boolean;
};

/**
 * The row of pictures along the bottom, and the button that adds another.
 *
 * Each tile is an independent piece of work, which is the point: pressing one
 * shows *that* picture with *its* cut-out, *its* background and *its* compare
 * position, and nothing here ever applies one slot's settings to another. There
 * is deliberately no "remove all backgrounds" button — five separate jobs that
 * happen to be open at once is what this is, not a batch.
 *
 * `aria-current` rather than `aria-pressed`: these are not toggles, and only one
 * of them is ever the picture on screen. A screen reader announcing "current"
 * says the true thing, where "pressed" would suggest four of the five are off.
 */
export function SourceStrip({
    entries,
    selectedId,
    onSelect,
    onRemove,
    onAdd,
    accept,
    disabled,
}: SourceStripProps) {
    const t = useTranslations("backgroundRemover.strip");

    const full = entries.length >= MAX_SHEETS;

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        onAdd([...event.dataTransfer.files]);
    }

    return (
        <div className="flex min-w-0 flex-col gap-2">
            {/*
             * The scroll box and the centring are two elements on purpose.
             * `justify-center` on the scrolling element itself is the classic
             * trap: once the content overflows, the leftmost tiles are pushed
             * into negative scroll space and become unreachable by any means.
             * `mx-auto w-fit` on an inner row centres it while it fits and
             * simply starts at the left edge when it does not.
             */}
            <div className="-mx-1 min-w-0 overflow-x-auto px-1">
                <div
                    role="group"
                    aria-label={t("label")}
                    className="mx-auto flex w-fit items-center gap-2 py-1"
                >
                    <label
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleDrop}
                        aria-disabled={disabled || full}
                        className={cn(
                            "border-border/80 bg-card/40 text-muted-foreground focus-within:ring-ring grid size-16 shrink-0 cursor-pointer place-items-center rounded-xl border border-dashed transition-colors duration-200 focus-within:ring-2",
                            "hover:border-primary/50 hover:text-foreground",
                            (disabled || full) && "pointer-events-none opacity-45",
                        )}
                    >
                        <IconPlus className="size-5" stroke={1.8} aria-hidden="true" />
                        <span className="sr-only">{full ? t("full") : t("add")}</span>
                        <input
                            type="file"
                            accept={accept}
                            multiple
                            disabled={disabled || full}
                            onChange={(event) => {
                                onAdd([...(event.target.files ?? [])]);
                                // Cleared so choosing the same file twice in a row
                                // still fires `change` — the browser suppresses it
                                // when the value has not altered.
                                event.target.value = "";
                            }}
                            className="sr-only"
                        />
                    </label>

                    {entries.map((entry) => {
                        const selected = entry.id === selectedId;

                        return (
                            <div key={entry.id} className="group/tile relative shrink-0">
                                <button
                                    type="button"
                                    aria-current={selected ? "true" : undefined}
                                    aria-label={t("slot", { name: entry.name })}
                                    disabled={disabled}
                                    onClick={() => onSelect(entry.id)}
                                    className={cn(
                                        "focus-visible:ring-ring block size-16 overflow-hidden rounded-xl ring-1 transition-[box-shadow,opacity] duration-200 ring-inset focus-visible:ring-2 focus-visible:outline-none",
                                        selected
                                            ? "ring-primary ring-2"
                                            : "ring-border/70 hover:ring-border opacity-80 hover:opacity-100",
                                        disabled && "cursor-not-allowed opacity-45",
                                    )}
                                >
                                    {/*
                                     * A plain `<img>` on an object URL for bytes that
                                     * never left this tab: there is no origin for
                                     * `next/image` to optimise through.
                                     */}
                                    <img
                                        src={entry.thumbnailUrl}
                                        alt=""
                                        decoding="async"
                                        className="bg-checkerboard size-full object-cover"
                                    />
                                </button>

                                {entry.state !== "idle" && (
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            "pointer-events-none absolute bottom-1 left-1 grid size-4 place-items-center rounded-full text-white shadow-[0_1px_3px_rgba(0,0,0,0.5)]",
                                            entry.state === "ready" && "bg-[var(--color-success)]",
                                            entry.state === "working" && "bg-black/65",
                                            entry.state === "failed" && "bg-destructive",
                                        )}
                                    >
                                        {entry.state === "working" ? (
                                            <IconLoader2 className="size-3 animate-spin" />
                                        ) : entry.state === "ready" ? (
                                            <IconCheck className="size-3" stroke={3} />
                                        ) : (
                                            <IconX className="size-3" stroke={3} />
                                        )}
                                    </span>
                                )}

                                <button
                                    type="button"
                                    aria-label={t("remove", { name: entry.name })}
                                    disabled={disabled}
                                    onClick={() => onRemove(entry.id)}
                                    // Visible on hover for a pointer, and always for
                                    // the keyboard — a hover-only control is a
                                    // control a keyboard cannot find.
                                    className={cn(
                                        "focus-visible:ring-ring absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-black/70 text-white opacity-100 transition-opacity duration-150 focus-visible:ring-2 focus-visible:outline-none",
                                        "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/tile:opacity-100 [@media(hover:hover)]:group-hover/tile:opacity-100",
                                    )}
                                >
                                    <IconX className="size-3" stroke={2.6} aria-hidden="true" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <p className="text-muted-foreground text-center text-[0.6875rem] leading-normal">
                {full ? t("full") : t("hint", { remaining: MAX_SHEETS - entries.length })}
            </p>
        </div>
    );
}
