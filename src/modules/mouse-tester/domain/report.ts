import type { SessionDiagnosis } from "./diagnosis";
import type { DpiStage } from "./dpi";
import {
    MOUSE_BUTTONS,
    type FaultRecord,
    type HoldResult,
    type MouseButton,
    type PollingSummary,
    type Verdict,
} from "../types";

/**
 * The session as a plain-text file somebody else reads — a seller's returns
 * desk, a warranty claim, the next owner of a used mouse.
 *
 * Plain text because it is the one format every support form accepts as an
 * attachment and every mail client shows inline. Every fault is listed with
 * when it happened and the measurement that tripped it, because "it double
 * clicks sometimes" is a claim and "11 presses under 50 ms, the shortest 4 ms"
 * is evidence.
 *
 * The words come from the caller, already localised and with their numbers
 * formatted, so this file decides only the layout and stays framework-free.
 */

export type ReportControl = MouseButton | "wheel";

export type ReportText = {
    readonly title: string;
    readonly summary: readonly string[];
    readonly controlsHeading: string;
    readonly columns: readonly [string, string, string, string];
    readonly control: (control: ReportControl) => string;
    readonly verdict: (verdict: Verdict) => string;
    readonly count: (value: number) => string;
    readonly hold: (result: HoldResult) => string;
    readonly polling: (summary: PollingSummary | null) => string;
    readonly overall: (verdict: Verdict) => string;
    readonly faultsHeading: string;
    readonly noFaults: string;
    readonly fault: (fault: FaultRecord) => string;
    readonly truncated: string | null;
    readonly dpiHeading: string;
    readonly dpiNone: string;
    readonly dpiStage: (stage: DpiStage) => string;
};

export type ReportInput = {
    readonly diagnosis: SessionDiagnosis;
    readonly faults: readonly FaultRecord[];
    readonly polling: PollingSummary | null;
    readonly dpi: readonly DpiStage[];
};

const CONTROLS: readonly ReportControl[] = [...MOUSE_BUTTONS, "wheel"];

export function buildReport(
    { diagnosis, faults, polling, dpi }: ReportInput,
    text: ReportText,
): string {
    const rows = CONTROLS.map((control) => {
        const result = control === "wheel" ? diagnosis.wheel : diagnosis.buttons[control];

        return [
            text.control(control),
            text.count(result.uses),
            text.count(result.faults),
            text.verdict(result.verdict),
        ] as const;
    });

    const lines = [
        text.title,
        "=".repeat(text.title.length),
        "",
        ...text.summary,
        "",
        text.overall(diagnosis.overall),
        text.hold(diagnosis.hold),
        text.polling(polling),
        "",
        text.controlsHeading,
        "-".repeat(text.controlsHeading.length),
        ...table([text.columns, ...rows]),
        "",
        text.faultsHeading,
        "-".repeat(text.faultsHeading.length),
        ...(faults.length === 0 ? [text.noFaults] : faults.map((fault) => text.fault(fault))),
        ...(text.truncated === null ? [] : [text.truncated]),
        "",
        text.dpiHeading,
        "-".repeat(text.dpiHeading.length),
        ...(dpi.length === 0 ? [text.dpiNone] : dpi.map((stage) => text.dpiStage(stage))),
        "",
    ];

    return lines.join("\n");
}

/**
 * Columns padded to their widest cell, counted in code points so a Bangla
 * label is not measured in UTF-16 units. A row is still only as aligned as the
 * reader's font is monospaced, which a text file cannot promise.
 */
export function table(rows: readonly (readonly string[])[]): string[] {
    const widths: number[] = [];

    for (const row of rows) {
        row.forEach((cell, index) => {
            widths[index] = Math.max(widths[index] ?? 0, [...cell].length);
        });
    }

    return rows.map((row) =>
        row
            .map((cell, index) =>
                index === row.length - 1
                    ? cell
                    : cell + " ".repeat(widths[index] - [...cell].length),
            )
            .join("  "),
    );
}
