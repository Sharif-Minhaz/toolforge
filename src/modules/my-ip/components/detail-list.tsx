import type { ReactNode } from "react";

import { CopyValueButton } from "./copy-value-button";

export type DetailItem = {
    readonly key: string;
    readonly label: string;
    /** Shown under the label in mono — a header's wire name. */
    readonly hint?: string;
    /** What is displayed. */
    readonly value: ReactNode;
    /** What the copy button writes; no button when `null`. */
    readonly copyValue: string | null;
};

/**
 * Label, value, copy — one row per fact. A `<dl>` so a screen reader pairs each
 * value with its name; the copy button sits inside the `<dd>` it copies.
 */
export function DetailList({
    items,
    copyLabel,
}: {
    items: readonly DetailItem[];
    /** Already formatted with the row's label, e.g. "Copy User agent". */
    copyLabel: (label: string) => string;
}) {
    return (
        <dl className="divide-border/70 flex min-w-0 flex-col divide-y">
            {items.map(({ key, label, hint, value, copyValue }) => (
                <div
                    key={key}
                    className="grid min-w-0 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-3 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
                >
                    <dt className="flex min-w-0 flex-col gap-0.5 text-xs leading-5">
                        <span className="text-muted-foreground">{label}</span>
                        {hint !== undefined && (
                            <span className="text-muted-foreground/75 font-mono text-[0.6875rem] break-all">
                                {hint}
                            </span>
                        )}
                    </dt>
                    <dd className="flex min-w-0 items-start gap-2">
                        <span className="min-w-0 flex-1 font-mono text-xs leading-5 break-all">
                            {value}
                        </span>
                        {copyValue !== null && (
                            <CopyValueButton value={copyValue} label={copyLabel(label)} />
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
