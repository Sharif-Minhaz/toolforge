import { z } from "zod";

import { DEFAULT_SECRET_OPTIONS } from "@/modules/secret/domain/constants";
import { generateSecret } from "@/modules/secret/domain/generate";
import {
    secretByteLengthSchema,
    secretEncodingSchema,
    secretShapeSchema,
    variableNameSchema,
} from "@/modules/secret/validation/generation-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * Drawn with `crypto.getRandomValues`, on the server, and returned once.
 *
 * The same disclosure the password adapter carries, and for the same reason: a
 * key generated here travels through the caller's conversation and is retained
 * by whatever is holding it. That is a real difference from the page, where the
 * value never leaves the tab, and the description says so — the model relaying
 * it is the one in a position to warn the person who asked.
 *
 * The equivalent shell command is returned alongside the key precisely because
 * of that. A caller who should not be taking a production secret from a
 * conversation gets, in the same response, the line that produces one locally.
 */
export const secretGenerateTool = defineMcpTool({
    toolId: "secret",
    verb: "generate",
    title: "Generate a secret key",
    description:
        "Draw N random bytes from `crypto.getRandomValues` and return them as a base64url, base64, hex or base32 string — the `AUTH_SECRET` / signing-key / API-key shape, not a human password. Reports exact entropy (bytes x 8), which algorithms that key size fits, and the equivalent `openssl rand` pipeline. Note that the key travels through this conversation, so prefer the returned command for anything going to production.",
    kind: "offline",
    readOnly: false,
    inputSchema: z.object({
        byteLength: secretByteLengthSchema
            .default(DEFAULT_SECRET_OPTIONS.byteLength)
            .describe("Bytes of randomness. 32 is the size HMAC-SHA256 and AES-256 want"),
        encoding: secretEncodingSchema
            .default(DEFAULT_SECRET_OPTIONS.encoding)
            .describe("How the bytes are spelled. Changes the characters, never the entropy"),
        padded: z
            .boolean()
            .default(DEFAULT_SECRET_OPTIONS.padded)
            .describe("Keep `=` padding. Ignored by hex, which has no partial group"),
        shape: secretShapeSchema
            .default(DEFAULT_SECRET_OPTIONS.shape)
            .describe("`bare`, an `.env` assignment, or a shell `export` line"),
        variableName: variableNameSchema
            .default(DEFAULT_SECRET_OPTIONS.variableName)
            .describe("Used by the `env` and `export` shapes only"),
    }),
    run: (options) => {
        const result = generateSecret(options);

        if (!result.ok) {
            return refuseWithReason("Secret key generator", result.reason);
        }

        return succeed(`${result.byteLength} bytes — ${result.entropyBits} bits of entropy`, {
            // `formatted` as well as `secret`, because a caller that asked for
            // an `.env` line has no field to assemble one in.
            secret: result.secret,
            formatted: result.formatted,
            byteLength: result.byteLength,
            entropyBits: result.entropyBits,
            characterCount: result.characterCount,
            encoding: options.encoding,
            grade: result.grade,
            uses: [...result.uses],
            command: result.command,
        });
    },
});
