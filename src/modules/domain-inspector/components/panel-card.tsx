"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PanelFailureReason, PanelResult } from "../types";

/**
 * The shell every result panel is drawn in, and the one place a panel that
 * could not answer is rendered.
 *
 * Six panels each inventing their own empty state is six chances for "this
 * domain has no certificate" and "we could not reach it" to look the same.
 */

type PanelCardProps = {
    title: ReactNode;
    icon: ReactNode;
    /** A short qualifier beside the title — a resolver name, a count. */
    meta?: ReactNode;
    children: ReactNode;
    className?: string;
};

export function PanelCard({ title, icon, meta, children, className }: PanelCardProps) {
    return (
        <section
            className={cn(
                "bg-card ring-border/70 flex min-w-0 flex-col gap-4 rounded-2xl p-4 ring-1 ring-inset sm:p-5",
                className,
            )}
        >
            <header className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-primary flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]">
                    {icon}
                </span>
                <h3 className="min-w-0 flex-1 text-[0.9375rem] leading-[1.3] font-semibold">
                    {title}
                </h3>
                {meta !== undefined && (
                    <span className="text-muted-foreground shrink-0 font-mono text-[0.6875rem]">
                        {meta}
                    </span>
                )}
            </header>
            {children}
        </section>
    );
}

/** The reason a panel has nothing to show, in the reader's own language. */
export function PanelUnavailable({ reason }: { reason: PanelFailureReason }) {
    const t = useTranslations("domainInspector.panelErrors");

    return (
        <p className="text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5 text-[0.8125rem] leading-[1.5]">
            {t(reason)}
        </p>
    );
}

/** Renders `children` for a panel that answered, the reason for one that did not. */
export function PanelBody<T>({
    result,
    children,
}: {
    result: PanelResult<T>;
    children: (data: T) => ReactNode;
}) {
    return result.ok ? <>{children(result.data)}</> : <PanelUnavailable reason={result.reason} />;
}

type FactProps = {
    label: ReactNode;
    children: ReactNode;
    /** Spans both columns, for values too long to sit in half a row. */
    wide?: boolean;
    className?: string;
};

export function Fact({ label, children, wide, className }: FactProps) {
    return (
        <div
            className={cn(
                "bg-card/60 ring-border/70 flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 ring-1 ring-inset",
                wide === true && "sm:col-span-2",
                className,
            )}
        >
            <dt className="text-muted-foreground text-[0.6875rem] leading-[1.4]">{label}</dt>
            <dd className="min-w-0 font-mono text-[0.8125rem] leading-[1.5] break-words">
                {children}
            </dd>
        </div>
    );
}

export function FactGrid({ children, label }: { children: ReactNode; label: string }) {
    return (
        <dl aria-label={label} className="grid min-w-0 gap-2 sm:grid-cols-2">
            {children}
        </dl>
    );
}

/** A wide value that has to scroll rather than push the page sideways. */
export function ScrollRow({ children }: { children: ReactNode }) {
    return <div className="min-w-0 overflow-x-auto">{children}</div>;
}
