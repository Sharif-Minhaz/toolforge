"use client";

import {
    IconAlertTriangle,
    IconCircleCheck,
    IconCircleDashed,
    IconHourglass,
    IconX,
    type IconProps,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, type ComponentType } from "react";

import { cn } from "@/lib/utils";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import {
    HOLD_TEST_MS,
    MIN_PRESSES_FOR_VERDICT,
    MIN_WHEEL_NOTCHES_FOR_VERDICT,
} from "../domain/constants";
import type { ControlDiagnosis, SessionDiagnosis } from "../domain/diagnosis";
import { MOUSE_BUTTONS, type HoldResult, type Verdict } from "../types";

/**
 * The part no button counter has: a verdict per control, in words, with how
 * much more testing it needs before it can be called healthy.
 */

const VERDICT_TONE: Record<Verdict, StatusTone> = {
    untested: "idle",
    testing: "idle",
    healthy: "success",
    suspect: "warning",
    faulty: "error",
};

const VERDICT_ICON: Record<Verdict, ComponentType<IconProps>> = {
    untested: IconCircleDashed,
    testing: IconHourglass,
    healthy: IconCircleCheck,
    suspect: IconAlertTriangle,
    faulty: IconX,
};

const VERDICT_CLASS: Record<Verdict, string> = {
    untested: "text-muted-foreground",
    testing: "text-muted-foreground",
    healthy: "text-success",
    suspect: "text-syntax-number",
    faulty: "text-destructive",
};

const HOLD_VERDICT: Record<HoldResult, Verdict> = {
    notRun: "untested",
    passed: "healthy",
    dropped: "faulty",
};

export function DiagnosisPanel({ diagnosis }: { diagnosis: SessionDiagnosis }) {
    const titleId = useId();
    const t = useTranslations("mouseTester.diagnosis");
    const tButtons = useTranslations("mouseTester.buttons");
    const tVerdicts = useTranslations("mouseTester.verdicts");
    const formatter = useFormatter();

    const rows = [
        ...MOUSE_BUTTONS.map((button) => ({
            key: button,
            label: tButtons(button),
            result: diagnosis.buttons[button],
        })),
        { key: "wheel", label: t("wheel"), result: diagnosis.wheel },
    ];

    function usage(result: ControlDiagnosis): string {
        return result.verdict === "testing"
            ? t("usesOf", {
                  uses: formatter.number(result.uses),
                  needed: formatter.number(result.uses + result.remaining),
              })
            : formatter.number(result.uses);
    }

    return (
        <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2">
            <h3 id={titleId} className="text-sm font-medium">
                {t("title")}
            </h3>

            <StatusStrip
                tone={VERDICT_TONE[diagnosis.overall]}
                message={t(`overall.${diagnosis.overall}`, {
                    presses: formatter.number(MIN_PRESSES_FOR_VERDICT),
                    notches: formatter.number(MIN_WHEEL_NOTCHES_FOR_VERDICT),
                })}
            />

            <div className="ring-border/70 overflow-x-auto rounded-xl ring-1 ring-inset">
                <table className="w-full border-collapse text-left text-[0.8125rem]">
                    <caption className="sr-only">{t("caption")}</caption>
                    <thead>
                        <tr className="bg-muted/50 text-muted-foreground text-[0.6875rem]">
                            <th scope="col" className="px-3 py-2 font-medium">
                                {t("colControl")}
                            </th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">
                                {t("colUses")}
                            </th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">
                                {t("colFaults")}
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                                {t("colVerdict")}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-border/60 divide-y">
                        {rows.map(({ key, label, result }) => (
                            <tr key={key}>
                                <th scope="row" className="px-3 py-1.5 font-medium">
                                    {label}
                                </th>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                    {usage(result)}
                                </td>
                                <td
                                    className={cn(
                                        "px-3 py-1.5 text-right font-mono tabular-nums",
                                        result.faults > 0 && "text-destructive",
                                    )}
                                >
                                    {formatter.number(result.faults)}
                                </td>
                                <td className="px-3 py-1.5">
                                    <VerdictLabel verdict={result.verdict}>
                                        {tVerdicts(result.verdict)}
                                    </VerdictLabel>
                                </td>
                            </tr>
                        ))}
                        <tr>
                            <th scope="row" className="px-3 py-1.5 font-medium">
                                {t("holdRow")}
                            </th>
                            <td
                                colSpan={2}
                                className="text-muted-foreground px-3 py-1.5 text-right"
                            >
                                {t(`holdDetail.${diagnosis.hold}`, {
                                    seconds: formatter.number(HOLD_TEST_MS / 1000),
                                })}
                            </td>
                            <td className="px-3 py-1.5">
                                <VerdictLabel verdict={HOLD_VERDICT[diagnosis.hold]}>
                                    {t(`hold.${diagnosis.hold}`)}
                                </VerdictLabel>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function VerdictLabel({ verdict, children }: { verdict: Verdict; children: string }) {
    const Icon = VERDICT_ICON[verdict];

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 text-[0.75rem] font-medium whitespace-nowrap",
                VERDICT_CLASS[verdict],
            )}
        >
            <Icon className="size-3.5 shrink-0" stroke={2} aria-hidden="true" />
            {children}
        </span>
    );
}
