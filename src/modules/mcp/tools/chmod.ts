import { z } from "zod";

import { DEFAULT_PATH } from "@/modules/chmod/domain/constants";
import { describeMode } from "@/modules/chmod/domain/mode";
import { parseMode } from "@/modules/chmod/domain/parse";
import { chmodPathSchema, modeInputSchema } from "@/modules/chmod/validation/chmod-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

export const chmodConvertTool = defineMcpTool({
    toolId: "chmod",
    verb: "convert",
    title: "Convert a Unix file mode",
    description:
        "Read a Unix permission mode written as octal (`755`, `0644`, `4755`) or as the `ls -l` string (`rwxr-xr-x`, `-rwsr-xr-x`, `drwxrwxrwt`), and return it in every form: octal, the nine-character symbolic string, the `u=rwx,g=rx,o=rx` assignment GNU chmod accepts, and a `chmod` command. Absolute modes only — relative expressions such as `u+x` and umask arithmetic are refused, not guessed.",
    kind: "offline",
    inputSchema: z.object({
        mode: modeInputSchema.describe(
            "Octal if it starts with a digit, otherwise an `ls -l` string; case matters (`s` ≠ `S`)",
        ),
        path: chmodPathSchema
            .default(DEFAULT_PATH)
            .describe("What the command names, inserted verbatim as a shell word"),
    }),
    run: ({ mode, path }) => {
        const parsed = parseMode(mode);

        if (!parsed.ok) {
            return refuseWithReason("Chmod calculator", parsed.reason, {
                position: parsed.position ?? null,
                expected: parsed.expected === undefined ? null : [...parsed.expected],
            });
        }

        const description = describeMode(parsed.mode, path);

        return succeed(`${description.octal} = ${description.symbolic}`, {
            octal: description.octal,
            symbolic: description.symbolic,
            assignment: description.assignment,
            command: description.command,
            worldWritable: description.worldWritable,
        });
    },
});
