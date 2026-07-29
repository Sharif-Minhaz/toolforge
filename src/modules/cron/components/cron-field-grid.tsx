"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { describeField } from "../domain/describe";
import type { CronExpression, CronFieldName } from "../types";
import { useCronSentence } from "./use-cron-sentence";

/** Columns to show, by how many the source actually wrote. */
const VISIBLE_FIELDS: Readonly<Record<number, readonly CronFieldName[]>> = {
    5: ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"],
    6: ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek"],
    7: ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek", "year"],
};

type CronFieldGridProps = {
    expression: CronExpression;
    pending: boolean;
};

/**
 * One card per column, in the order the line was written. A macro is shown as
 * the five fields it stands for, because the whole reason to ask is to find out
 * what `@weekly` actually does.
 */
export function CronFieldGrid({ expression, pending }: CronFieldGridProps) {
    const t = useTranslations("cron.workbench");
    const { renderPhrase } = useCronSentence();
    const fields = VISIBLE_FIELDS[expression.macro === undefined ? expression.fieldCount : 5];

    if (fields === undefined) {
        return null;
    }

    return (
        <ul
            className={cn(
                "grid gap-2 transition-opacity duration-200 sm:grid-cols-3 lg:grid-cols-5",
                pending && "opacity-55",
            )}
        >
            {fields.map((name) => (
                <li
                    key={name}
                    className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5 ring-1 ring-inset"
                >
                    <span className="text-muted-foreground text-[0.625rem] leading-[1.4] font-medium tracking-wide uppercase">
                        {t(`fields.${name}`)}
                    </span>
                    <span className="text-primary truncate font-mono text-sm">
                        {expression.fields[name].raw}
                    </span>
                    <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                        {renderPhrase(name, describeField(expression.fields[name]))}
                    </span>
                </li>
            ))}
        </ul>
    );
}
