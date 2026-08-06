"use client";

import { IconInfoCircle, IconTool } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { JsonAdvisory, JsonRepair, JsonRepairCode } from "@/modules/tools/types/json-tree";

import { MAX_LISTED_ADVISORIES } from "../domain/constants";

/** First appearance wins, so the list reads in document order. */
function distinctRepairCodes(repairs: readonly JsonRepair[]): readonly JsonRepairCode[] {
    return [...new Set(repairs.map((repair) => repair.code))];
}

type NoticeBlockProps = {
    title: string;
    tone: "advisory" | "repair";
    children: ReactNode;
};

function NoticeBlock({ title, tone, children }: NoticeBlockProps) {
    const Icon = tone === "repair" ? IconTool : IconInfoCircle;

    return (
        <section className="bg-card/60 ring-border/70 flex flex-col gap-2 rounded-xl px-3 py-2.5 ring-1 ring-inset">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem] leading-[1.4] font-semibold tracking-[0.06em] uppercase">
                <Icon className="size-3.5 shrink-0" stroke={1.9} aria-hidden="true" />
                {title}
            </h3>
            {children}
        </section>
    );
}

function Bullet({ children }: { children: ReactNode }) {
    return (
        <li className="flex gap-2">
            <span aria-hidden="true">·</span>
            <span className="min-w-0">{children}</span>
        </li>
    );
}

type JsonNoticesProps = {
    advisories: readonly JsonAdvisory[];
    repairs: readonly JsonRepair[];
};

/**
 * Everything the formatter wants to mention but did not fail over: what repair
 * corrected on the way through, and what is valid yet still worth knowing.
 */
export function JsonNotices({ advisories, repairs }: JsonNoticesProps) {
    const t = useTranslations("json.report");

    // Line numbers and counts go through ICU's `{value, number}` and `#`, so
    // Bangla renders Bengali numerals rather than Western digits.
    function describe(advisory: JsonAdvisory): string {
        switch (advisory.code) {
            case "duplicate_key":
                return t("advisories.duplicate_key", {
                    line: advisory.line,
                    key: advisory.key ?? "",
                });
            case "unpaired_surrogate":
                return t("advisories.unpaired_surrogate", { line: advisory.line });
            case "precision_loss":
                return t("advisories.precision_loss", {
                    line: advisory.line,
                    literal: advisory.literal ?? "",
                });
        }
    }

    if (advisories.length === 0 && repairs.length === 0) {
        return null;
    }

    const listed = advisories.slice(0, MAX_LISTED_ADVISORIES);
    const hidden = advisories.length - listed.length;

    return (
        <div className="flex flex-col gap-2">
            {repairs.length > 0 && (
                <NoticeBlock title={t("repairsTitle")} tone="repair">
                    <p className="text-[0.8125rem] leading-6 font-medium">
                        {t("repairsSummary", { count: repairs.length })}
                    </p>
                    <ul className="text-muted-foreground flex flex-col gap-1 text-[0.8125rem] leading-6">
                        {distinctRepairCodes(repairs).map((code) => (
                            <Bullet key={code}>{t(`repairs.${code}`)}</Bullet>
                        ))}
                    </ul>
                </NoticeBlock>
            )}

            {advisories.length > 0 && (
                <NoticeBlock title={t("advisoriesTitle")} tone="advisory">
                    <ul className="text-muted-foreground flex flex-col gap-1.5 text-[0.8125rem] leading-6">
                        {listed.map((advisory, index) => (
                            <Bullet key={`${advisory.code}-${advisory.offset}-${index}`}>
                                {describe(advisory)}
                            </Bullet>
                        ))}
                        {hidden > 0 && <Bullet>{t("advisoriesMore", { count: hidden })}</Bullet>}
                    </ul>
                </NoticeBlock>
            )}
        </div>
    );
}
