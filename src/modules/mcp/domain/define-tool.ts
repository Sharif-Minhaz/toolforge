import { z } from "zod";

import type { JsonValue } from "@/modules/tools/types/json-document";

import type { McpInputSchema, McpTool, McpToolKind, McpToolOutcome, McpToolOwner } from "../types";
import { buildMcpToolName } from "./tool-name";

/**
 * The one way a ToolForge tool becomes an MCP tool.
 *
 * Every adapter under `tools/` goes through here, which buys three things that
 * are otherwise repeated thirty times and forgotten once:
 *
 * - **The name is built, never written.** `buildMcpToolName` owns the format,
 *   so a tool cannot ship as `toolforge-jwt-decode` because somebody typed a
 *   hyphen.
 * - **Arguments are parsed here as well as by the client.** The SDK validates
 *   against the schema it published, and so does this, because the handler's
 *   argument type is a promise this function makes and `unknown` is what
 *   actually arrives. Two parses of a small object cost nothing measurable.
 * - **An unknown argument is refused, not dropped.** Zod's default object
 *   strips a key it does not recognise, which turns a caller's mistake into a
 *   silently different answer: asking the secret generator for `bytes: 64`
 *   when the field is `byteLength` returned a 32-byte secret and said nothing.
 *   A model guessing a plausible name has no way to notice, and 256 bits
 *   instead of 512 is not a difference to leave to a typo. So every schema is
 *   rebuilt strict below, which both refuses the call by name and publishes
 *   `additionalProperties: false` so a client can see the constraint.
 * - **A thrown error becomes a named refusal.** A handler that throws is a
 *   defect, but the caller is a program in the middle of a conversation, and
 *   `internal_error` is a far better answer than a dropped connection. What the
 *   error *said* never reaches the caller — an engine's message is exactly the
 *   kind of host detail that must not cross this boundary. It is not lost
 *   either: `repository/server.ts` logs every `internal_error` it sees, because
 *   this layer is framework-free and has nowhere to write.
 */

export type McpToolDefinition<Schema extends McpInputSchema> = {
    /** Catalogue id — `uuid`, `rsa-encrypt`. Half of the tool's name. */
    readonly toolId: McpToolOwner;
    /** The operation — `generate`, `decode`, `convert`. The other half. */
    readonly verb: string;
    /** Short label a client may show instead of the raw name. */
    readonly title: string;
    /**
     * What the tool does, written for a model choosing between thirty of them.
     * States the input, the output, and the one thing that would otherwise be
     * guessed wrong.
     */
    readonly description: string;
    readonly kind: McpToolKind;
    /** False only when a call can change what a later call would see. */
    readonly readOnly?: boolean;
    readonly inputSchema: Schema;
    readonly run: (input: z.output<Schema>) => Promise<McpToolOutcome> | McpToolOutcome;
};

export function defineMcpTool<Schema extends McpInputSchema>(
    definition: McpToolDefinition<Schema>,
): McpTool {
    const { toolId, verb, title, description, kind, inputSchema, run } = definition;

    // Rebuilt from the authored shape rather than authored strict, so an
    // adapter cannot forget. Same fields, same defaults, same published schema
    // — the only difference is what happens to a key nobody declared.
    const schema = z.strictObject(inputSchema.shape);

    return {
        name: buildMcpToolName(toolId, verb),
        title,
        description,
        kind,
        toolId,
        readOnly: definition.readOnly ?? true,
        inputSchema: schema,
        run: async (rawArguments: unknown): Promise<McpToolOutcome> => {
            const parsed = schema.safeParse(rawArguments ?? {});

            if (!parsed.success) {
                return {
                    ok: false,
                    reason: "invalid_arguments",
                    summary: "The arguments did not match this tool's schema.",
                    data: { issues: describeIssues(parsed.error) },
                };
            }

            try {
                return await run(parsed.data as z.output<Schema>);
            } catch {
                return {
                    ok: false,
                    reason: "internal_error",
                    summary: "ToolForge could not complete this call.",
                };
            }
        },
    };
}

/**
 * Zod's own report, flattened to path and message.
 *
 * Zod writes its messages about the data, not about the machine running it, so
 * passing them through tells a model which argument to fix. The rest of the
 * issue object — codes, expected types, the input echoed back — is noise in a
 * context window.
 */
function describeIssues(error: z.ZodError): JsonValue {
    return error.issues.slice(0, 10).map((issue) => ({
        path: issue.path.map((segment) => String(segment)).join("."),
        message: issue.message,
    }));
}
