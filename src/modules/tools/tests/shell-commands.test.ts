import { describe, expect, test } from "bun:test";

import { tokenize, tokenizeCommands, wordText } from "@/modules/tools/domain/shell-tokenize";

function commandsOf(input: string, dialect: "posix" | "cmd" | "powershell" = "posix") {
    const result = tokenizeCommands(input, dialect);

    if (!result.ok) {
        throw new Error(`expected ${dialect} to tokenize: ${input}`);
    }

    return result.commands;
}

describe("tokenizeCommands", () => {
    test("ends a command at an unquoted line break, and only there", () => {
        const input = "docker run a \\\n  -e 'X=1\n2'\ndocker run b";

        expect(commandsOf(input).map((command) => command.map(wordText))).toEqual([
            ["docker", "run", "a", "-e", "X=1\n2"],
            ["docker", "run", "b"],
        ]);
    });

    test("does the same in cmd and PowerShell, after their own continuations", () => {
        expect(commandsOf("a ^\n b\nc", "cmd").map((command) => command.map(wordText))).toEqual([
            ["a", "b"],
            ["c"],
        ]);
        expect(
            commandsOf("a `\n b\nc", "powershell").map((command) => command.map(wordText)),
        ).toEqual([["a", "b"], ["c"]]);
    });

    test("marks which parts of a word a POSIX shell would still expand", () => {
        const [[word]] = commandsOf(`a'$b'"$c"\\$d$e`);

        expect(word).toEqual([
            { text: "a", expandable: true },
            { text: "$b", expandable: false },
            { text: "$c", expandable: true },
            { text: "$", expandable: false },
            { text: "d$e", expandable: true },
        ]);
    });

    test("keeps an empty quoted argument as a word", () => {
        expect(commandsOf("a '' \"\"")[0].map(wordText)).toEqual(["a", "", ""]);
    });

    test("never marks anything expandable outside POSIX", () => {
        for (const dialect of ["cmd", "powershell"] as const) {
            const segments = commandsOf('a "$b"', dialect).flat(2);

            expect(segments.every((segment) => !segment.expandable)).toBe(true);
        }
    });

    test("is what tokenize flattens, so a line break still reads as a space there", () => {
        expect(tokenize("a\nb", "posix")).toEqual({ ok: true, tokens: ["a", "b"] });
    });
});
