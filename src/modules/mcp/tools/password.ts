import { z } from "zod";

import { DEFAULT_PASSWORD_OPTIONS } from "@/modules/password/domain/constants";
import { estimateCrackTime } from "@/modules/password/domain/crack-time";
import { generatePassword } from "@/modules/password/domain/generate";
import {
    attackModelSchema,
    passwordLengthSchema,
    passwordModeSchema,
    passwordSeparatorSchema,
} from "@/modules/password/validation/generation-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * Generated with `crypto.getRandomValues`, on the server, and returned once.
 *
 * Worth being explicit about what that means over MCP, because it differs from
 * the page: a secret generated here travels through the caller's conversation
 * and is retained by whatever is holding that conversation. The description
 * says so, since the model relaying it is in a position to warn the person who
 * asked — and a tool that quietly weakens the site's own promise would be the
 * kind of limitation `CLAUDE.md` forbids disclosing only in an article.
 */
export const passwordGenerateTool = defineMcpTool({
    toolId: "password",
    verb: "generate",
    title: "Generate a password",
    description:
        "Generate a random password, a memorable passphrase, or a numeric PIN, with an entropy figure and an estimated time to crack under a named attacker model. Drawn from `crypto.getRandomValues`. Note that the result travels through this conversation, so treat it as a starting point to change rather than a final production secret.",
    kind: "offline",
    readOnly: false,
    inputSchema: z.object({
        mode: passwordModeSchema
            .default(DEFAULT_PASSWORD_OPTIONS.mode)
            .describe("`random` characters, `memorable` words, or a numeric `pin`"),
        length: passwordLengthSchema
            .default(DEFAULT_PASSWORD_OPTIONS.length)
            .describe("Characters in `random`, words in `memorable`, digits in `pin`"),
        uppercase: z.boolean().default(DEFAULT_PASSWORD_OPTIONS.uppercase),
        lowercase: z.boolean().default(DEFAULT_PASSWORD_OPTIONS.lowercase),
        numbers: z.boolean().default(DEFAULT_PASSWORD_OPTIONS.numbers),
        symbols: z.boolean().default(DEFAULT_PASSWORD_OPTIONS.symbols),
        excludeSimilar: z
            .boolean()
            .default(DEFAULT_PASSWORD_OPTIONS.excludeSimilar)
            .describe("Drop `iIlL1oO0|`, which read as each other in most fonts"),
        excludeAmbiguous: z
            .boolean()
            .default(DEFAULT_PASSWORD_OPTIONS.excludeAmbiguous)
            .describe("Drop brackets, quotes and slashes, which shells and CSVs mangle"),
        separator: passwordSeparatorSchema.default(DEFAULT_PASSWORD_OPTIONS.separator),
        capitalize: z.boolean().default(DEFAULT_PASSWORD_OPTIONS.capitalize),
        includeNumber: z.boolean().default(DEFAULT_PASSWORD_OPTIONS.includeNumber),
        attack: attackModelSchema
            .default(DEFAULT_PASSWORD_OPTIONS.attack)
            .describe("Which attacker the crack-time estimate assumes"),
    }),
    run: (options) => {
        const result = generatePassword(options);

        if (!result.ok) {
            return refuseWithReason("Password generator", result.reason);
        }

        const crackTime = estimateCrackTime(result.entropyBits, options.attack);

        return succeed(`${result.strength} — ${Math.round(result.entropyBits)} bits of entropy`, {
            password: result.password,
            entropyBits: result.entropyBits,
            poolSize: result.poolSize,
            strength: result.strength,
            composition: { ...result.composition },
            crackTime: { ...crackTime, attack: options.attack },
        });
    },
});
