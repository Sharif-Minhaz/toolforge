"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, type ReactNode } from "react";

import { OptionSelect } from "@/modules/tools/components/option-controls";
import { SQL_DIALECT_NAMES } from "../domain/constants";
import { supportsKeywordCase } from "../domain/format";
import {
    SQL_DIALECTS,
    SQL_INDENTS,
    SQL_KEYWORD_CASES,
    SQL_QUERY_GAPS,
    type SqlDialect,
    type SqlFormatOptions,
    type SqlIndent,
    type SqlKeywordCase,
} from "../types";

const GAP_VALUES = SQL_QUERY_GAPS.map(String);

/** Proper names are data; only the generic dialect's name is translated. */
export function useDialectLabel(): (dialect: SqlDialect) => string {
    const t = useTranslations("sqlFormatter.workbench");

    return useCallback(
        (dialect) => (dialect === "sql" ? t("dialectStandard") : SQL_DIALECT_NAMES[dialect]),
        [t],
    );
}

type OptionsProps = {
    options: SqlFormatOptions;
    onChange: (patch: Partial<SqlFormatOptions>) => void;
};

/** The one choice every reader makes, so it stays outside the folded panel. */
export function DialectPicker({ options, onChange }: OptionsProps) {
    const t = useTranslations("sqlFormatter.workbench");
    const dialectLabel = useDialectLabel();

    const items = useMemo<Record<string, ReactNode>>(
        () => Object.fromEntries(SQL_DIALECTS.map((dialect) => [dialect, dialectLabel(dialect)])),
        [dialectLabel],
    );

    return (
        <div className="sm:max-w-xs">
            <OptionSelect<SqlDialect>
                label={t("dialectLabel")}
                value={options.dialect}
                items={items}
                values={SQL_DIALECTS}
                onChange={(dialect) => onChange({ dialect })}
            />
        </div>
    );
}

export function FormatOptions({ options, onChange }: OptionsProps) {
    const t = useTranslations("sqlFormatter.workbench");
    const caseLocked = !supportsKeywordCase(options.dialect);

    const caseItems = useMemo<Record<string, ReactNode>>(
        () =>
            Object.fromEntries(
                SQL_KEYWORD_CASES.map((value) => [value, t(`keywordCases.${value}`)]),
            ),
        [t],
    );

    const indentItems = useMemo<Record<string, ReactNode>>(
        () => Object.fromEntries(SQL_INDENTS.map((value) => [value, t(`indents.${value}`)])),
        [t],
    );

    const gapItems = useMemo<Record<string, ReactNode>>(
        () =>
            Object.fromEntries(
                SQL_QUERY_GAPS.map((count) => [String(count), t("lines", { count })]),
            ),
        [t],
    );

    return (
        <div className="grid gap-3 sm:grid-cols-3">
            <OptionSelect<SqlKeywordCase>
                label={t("keywordCaseLabel")}
                // Disabled rather than ignored: the reader is shown the case the
                // output will actually have, and told why it cannot change.
                hint={caseLocked ? t("keywordCaseLockedHint") : t("keywordCaseHint")}
                value={caseLocked ? "preserve" : options.keywordCase}
                items={caseItems}
                values={SQL_KEYWORD_CASES}
                disabled={caseLocked}
                onChange={(keywordCase) => onChange({ keywordCase })}
            />
            <OptionSelect<SqlIndent>
                label={t("indentLabel")}
                value={options.indent}
                items={indentItems}
                values={SQL_INDENTS}
                onChange={(indent) => onChange({ indent })}
            />
            <OptionSelect<string>
                label={t("linesLabel")}
                value={String(options.linesBetweenQueries)}
                items={gapItems}
                values={GAP_VALUES}
                onChange={(value) => {
                    const linesBetweenQueries = SQL_QUERY_GAPS.find((gap) => String(gap) === value);

                    if (linesBetweenQueries !== undefined) {
                        onChange({ linesBetweenQueries });
                    }
                }}
            />
        </div>
    );
}
