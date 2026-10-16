import { describe, expect, test } from "bun:test";

import { buildLayout } from "@/modules/keyboard-tester/domain/layouts";
import { keyboardProgress } from "@/modules/keyboard-tester/domain/progress";
import {
    buildKeyboardReport,
    type KeyboardReportText,
} from "@/modules/keyboard-tester/domain/report";
import { applyKeyInput, createKeySession } from "@/modules/keyboard-tester/domain/session";
import type { KeyInput } from "@/modules/keyboard-tester/types";

const TEXT: KeyboardReportText = {
    title: "Keyboard report",
    summary: ["Board: 60%"],
    tested: (progress) => `Tested ${progress.tested} of ${progress.total}`,
    untestedHeading: "Not tested",
    allTested: "All",
    keyName: (code) => code,
    chatterHeading: "Chatter",
    noChatter: "None",
    chatterKey: (name, count) => `${name}: ${count}`,
    rollover: (peak) => `Rollover ${peak.total}`,
    combosHeading: "Chords",
    combo: (id, passed) => `${id} ${passed ? "ok" : "-"}`,
    repeat: () => "Repeat -",
    eventsHeading: "Events",
    event: (record, name) => `${record.at} ${name} ${record.interval}`,
    extraHeading: "Other keys",
};

describe("keyboardProgress and buildKeyboardReport", () => {
    test("report what was tested, what was not, and every chatter", () => {
        const layout = buildLayout("60", "ansi");
        const inputs: KeyInput[] = [
            { type: "down", code: "KeyE", time: 0, repeat: false },
            { type: "up", code: "KeyE", time: 8 },
            { type: "down", code: "KeyE", time: 20, repeat: false },
            { type: "up", code: "KeyE", time: 60 },
            { type: "down", code: "AudioVolumeUp", time: 100, repeat: false },
        ];
        const session = inputs.reduce(
            (current, input) => applyKeyInput(current, input, { faultWindowMs: 40 }),
            createKeySession(),
        );
        const progress = keyboardProgress(session, layout);

        expect(progress.tested).toBe(1);
        expect(progress.total).toBe(60);
        expect(progress.chattering).toEqual([{ code: "KeyE", count: 1 }]);
        expect(progress.extra).toEqual(["AudioVolumeUp"]);

        const report = buildKeyboardReport({ session, progress, combos: ["wasd"] }, TEXT);

        expect(report).toContain("Keyboard report\n===============\n");
        expect(report).toContain("Tested 1 of 60");
        expect(report).toContain("Chatter\n-------\nKeyE: 1");
        expect(report).toContain("wasd -");
        expect(report).toContain("Other keys\n----------\nAudioVolumeUp");
        expect(report).toContain("20 KeyE 20");
    });
});
