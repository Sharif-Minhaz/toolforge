import { describe, expect, test } from "bun:test";

import { diagnose } from "@/modules/mouse-tester/domain/diagnosis";
import { summarizeStages } from "@/modules/mouse-tester/domain/dpi";
import { buildReport, table, type ReportText } from "@/modules/mouse-tester/domain/report";
import { createSession } from "@/modules/mouse-tester/domain/session";

const TEXT: ReportText = {
    title: "Mouse test report",
    summary: ["Fault window: 50 ms"],
    controlsHeading: "Controls",
    columns: ["Control", "Uses", "Faults", "Verdict"],
    control: (control) => control,
    verdict: (verdict) => verdict,
    count: (value) => String(value),
    hold: (result) => `Hold: ${result}`,
    polling: (summary) => (summary === null ? "Polling: not measured" : "Polling: measured"),
    overall: (verdict) => `Overall: ${verdict}`,
    faultsHeading: "Faults",
    noFaults: "None",
    fault: (fault) => `${fault.kind} ${fault.control} at ${fault.at} ms (${fault.gap} ms)`,
    truncated: null,
    dpiHeading: "DPI",
    dpiNone: "Not measured",
    dpiStage: (stage) =>
        `Stage ${stage.stage}: ${Math.round(stage.dpi)}${stage.unchanged ? " unchanged" : ""}`,
};

describe("buildReport", () => {
    test("lists every control and every fault", () => {
        const session = createSession();
        const report = buildReport(
            {
                diagnosis: diagnose({
                    ...session,
                    buttons: {
                        ...session.buttons,
                        left: { ...session.buttons.left, presses: 12, chatter: 1 },
                    },
                }),
                faults: [{ kind: "chatter", control: "left", at: 1200, gap: 4 }],
                polling: null,
                dpi: summarizeStages([
                    { stage: 1, dpi: 1600 },
                    { stage: 2, dpi: 1610 },
                ]),
            },
            TEXT,
        );

        expect(report).toContain("Mouse test report\n=================\n");
        expect(report).toContain("Overall: faulty");
        expect(report).toContain("left     12    1       faulty");
        expect(report).toContain("wheel    0     0       untested");
        expect(report).toContain("chatter left at 1200 ms (4 ms)");
        expect(report).not.toContain("None");
        expect(report).toContain("DPI\n---\nStage 1: 1600\nStage 2: 1610 unchanged");
    });

    test("says so when nothing went wrong", () => {
        const report = buildReport(
            { diagnosis: diagnose(createSession()), faults: [], polling: null, dpi: [] },
            TEXT,
        );

        expect(report).toContain("Faults\n------\nNone");
        expect(report).toContain("DPI\n---\nNot measured");
    });
});

describe("table", () => {
    test("pads by code point, not by UTF-16 unit", () => {
        expect(
            table([
                ["😀", "a"],
                ["ab", "b"],
            ]),
        ).toEqual(["😀   a", "ab  b"]);
    });
});
