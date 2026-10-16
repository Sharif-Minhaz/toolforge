"use client";

import { useFormatter, useTranslations } from "next-intl";

import type { KeyboardReportText } from "../domain/report";

type ReportContext = {
    generated: Date;
    userAgent: string;
    board: string;
    family: string | null;
    faultWindowMs: number;
    nameOf: (code: string) => string;
};

/** The keyboard report's words in the reader's language; the layout is `domain/report.ts`. */
export function useKeyboardReportText(): (context: ReportContext) => KeyboardReportText {
    const t = useTranslations("keyboardTester.report");
    const tCombos = useTranslations("keyboardTester.combos");
    const formatter = useFormatter();

    const ms = (value: number) => t("ms", { value: formatter.number(Math.round(value)) });

    return (context) => ({
        title: t("title"),
        summary: [
            // UTC, so a reader in another zone sees the same instant.
            t("generated", { date: context.generated.toISOString() }),
            t("browser", { agent: context.userAgent }),
            t("board", { board: context.board }),
            t("layout", { family: context.family ?? t("layoutUnknown") }),
            t("window", { window: ms(context.faultWindowMs) }),
        ],
        tested: (progress) =>
            t("tested", {
                tested: formatter.number(progress.tested),
                total: formatter.number(progress.total),
            }),
        untestedHeading: t("untestedHeading"),
        allTested: t("allTested"),
        // The cap and the code, so the reader of the file can tell a German Z
        // from a US Y.
        keyName: (code) => `${context.nameOf(code)} (${code})`,
        chatterHeading: t("chatterHeading"),
        noChatter: t("noChatter"),
        chatterKey: (name, count) => t("chatterKey", { key: name, count: formatter.number(count) }),
        rollover: (peak) =>
            t("rollover", {
                others: formatter.number(peak.others),
                modifiers: formatter.number(peak.modifiers),
            }),
        combosHeading: t("combosHeading"),
        combo: (id, passed) => t("combo", { combo: tCombos(id), passed: passed ? "yes" : "no" }),
        repeat: (reading) =>
            reading === null
                ? t("repeatNone")
                : t("repeat", {
                      delay: formatter.number(Math.round(reading.delayMs)),
                      rate: formatter.number(reading.perSecond, { maximumFractionDigits: 1 }),
                  }),
        eventsHeading: t("eventsHeading"),
        event: (record, name) =>
            t("event", {
                at: formatter.number(record.at / 1000, {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                }),
                key: name,
                interval: ms(record.interval),
            }),
        extraHeading: t("extraHeading"),
    });
}
