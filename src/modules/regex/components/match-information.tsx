"use client";

import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { RegexCapture, RegexMatch } from "../types";
import { SidePanel } from "./side-panel";

/** Renders a captured value, or says plainly that the group took no part. */
function CaptureValue({ capture }: { capture: RegexCapture }) {
    const t = useTranslations("regex.matches");

    if (capture.value === null) {
        return <span className="text-muted-foreground/80 italic">{t("didNotParticipate")}</span>;
    }

    if (capture.value.length === 0) {
        return <span className="text-muted-foreground/80 italic">{t("emptyString")}</span>;
    }

    return <span className="text-foreground break-all">{capture.value}</span>;
}

type MatchRowProps = {
    match: RegexMatch;
    ordinal: number;
};

function MatchRow({ match, ordinal }: MatchRowProps) {
    const t = useTranslations("regex.matches");
    const format = useFormatter();

    return (
        <li className="border-border/60 flex min-w-0 flex-col gap-1.5 border-b py-2.5 last:border-b-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[0.6875rem] font-semibold text-(--tool-accent)">
                    {t("matchOrdinal", { ordinal: format.number(ordinal) })}
                </span>
                {/* Offsets into the input are machine data, so they keep
                    Western digits: passed as strings, they never reach a
                    number format. */}
                <span className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                    {t("range", { start: String(match.start), end: String(match.end) })}
                </span>
            </div>

            <code className="bg-muted/60 text-foreground rounded-md px-1.5 py-1 font-mono text-[0.75rem] break-all whitespace-pre-wrap">
                {match.value.length === 0 ? (
                    <span className="text-muted-foreground/80 italic">{t("emptyMatch")}</span>
                ) : (
                    match.value
                )}
            </code>

            {match.captures.length > 0 && (
                <dl className="mt-0.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-[0.75rem]">
                    {match.captures.map((capture) => (
                        <div key={capture.index} className="contents">
                            <dt className="text-muted-foreground font-mono text-[0.6875rem] leading-[1.6] tabular-nums">
                                {capture.name === null
                                    ? t("groupNumber", { index: String(capture.index) })
                                    : t("groupNamed", {
                                          index: String(capture.index),
                                          name: capture.name,
                                      })}
                            </dt>
                            <dd className="min-w-0 font-mono text-[0.6875rem] leading-[1.6]">
                                <CaptureValue capture={capture} />
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </li>
    );
}

type MatchInformationProps = {
    matches: readonly RegexMatch[];
    truncated: boolean;
    /** Set when the pattern or input was refused, so "no matches" would mislead. */
    blocked: boolean;
    pending: boolean;
};

export function MatchInformation({ matches, truncated, blocked, pending }: MatchInformationProps) {
    const t = useTranslations("regex.workbench");
    const tMatches = useTranslations("regex.matches");
    const format = useFormatter();

    return (
        <SidePanel
            title={t("matchInformationTitle")}
            pending={pending}
            badge={
                matches.length > 0 ? (
                    <span
                        className={cn(
                            "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[0.6875rem] tabular-nums",
                            "bg-[color-mix(in_oklch,var(--tool-accent)_14%,transparent)] text-(--tool-accent)",
                        )}
                    >
                        {format.number(matches.length)}
                    </span>
                ) : undefined
            }
        >
            {matches.length === 0 ? (
                <p className="text-muted-foreground px-1 py-2 text-[0.75rem] leading-[1.6]">
                    {blocked ? tMatches("blocked") : tMatches("noMatches")}
                </p>
            ) : (
                <>
                    <ul className="min-w-0">
                        {matches.map((match, index) => (
                            <MatchRow
                                key={`${match.start}-${match.end}-${index}`}
                                match={match}
                                ordinal={index + 1}
                            />
                        ))}
                    </ul>
                    {truncated && (
                        <p className="text-brand-amber pt-2 text-[0.6875rem] leading-normal">
                            {tMatches("truncated", { count: format.number(matches.length) })}
                        </p>
                    )}
                </>
            )}
        </SidePanel>
    );
}
