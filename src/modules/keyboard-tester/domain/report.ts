import type { KeyboardProgress } from "./progress";
import type { GhostComboId } from "./combos";
import type { KeyChatterRecord, KeySession, RepeatReading } from "../types";

/**
 * The session as plain text for somebody else — a returns desk, a buyer, a
 * forum thread about a chattering switch. The layout is decided here; every
 * word, already localised and with its numbers formatted, comes from the
 * caller.
 */

export type KeyboardReportText = {
    readonly title: string;
    readonly summary: readonly string[];
    readonly tested: (progress: KeyboardProgress) => string;
    readonly untestedHeading: string;
    readonly allTested: string;
    readonly keyName: (code: string) => string;
    readonly chatterHeading: string;
    readonly noChatter: string;
    readonly chatterKey: (name: string, count: number) => string;
    readonly rollover: (peak: KeySession["peakHeld"]) => string;
    readonly combosHeading: string;
    readonly combo: (id: GhostComboId, passed: boolean) => string;
    readonly repeat: (reading: RepeatReading | null) => string;
    readonly eventsHeading: string;
    readonly event: (record: KeyChatterRecord, name: string) => string;
    readonly extraHeading: string;
};

export type KeyboardReportInput = {
    readonly session: KeySession;
    readonly progress: KeyboardProgress;
    readonly combos: readonly GhostComboId[];
};

function heading(text: string): string[] {
    return [text, "-".repeat([...text].length)];
}

export function buildKeyboardReport(
    { session, progress, combos }: KeyboardReportInput,
    text: KeyboardReportText,
): string {
    const lines = [
        text.title,
        "=".repeat([...text.title].length),
        "",
        ...text.summary,
        "",
        text.tested(progress),
        text.rollover(session.peakHeld),
        text.repeat(session.repeat),
        "",
        ...heading(text.untestedHeading),
        progress.untested.length === 0
            ? text.allTested
            : progress.untested.map(text.keyName).join(", "),
        "",
        ...heading(text.chatterHeading),
        ...(progress.chattering.length === 0
            ? [text.noChatter]
            : progress.chattering.map(({ code, count }) =>
                  text.chatterKey(text.keyName(code), count),
              )),
        "",
        ...heading(text.combosHeading),
        ...combos.map((id) => text.combo(id, session.combos.includes(id))),
        "",
        ...(progress.extra.length === 0
            ? []
            : [...heading(text.extraHeading), progress.extra.map(text.keyName).join(", "), ""]),
        ...(session.chatter.length === 0
            ? []
            : [
                  ...heading(text.eventsHeading),
                  ...session.chatter.map((record) => text.event(record, text.keyName(record.code))),
                  "",
              ]),
    ];

    return lines.join("\n");
}
