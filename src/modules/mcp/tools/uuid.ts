import { z } from "zod";

import { DEFAULT_UUID_QUANTITY, DEFAULT_UUID_VERSION } from "@/modules/uuid/domain/constants";
import { generateUuids, readUuidVariant, readUuidVersion } from "@/modules/uuid/domain/generate";
import {
    uuidQuantitySchema,
    uuidVersionSchema,
} from "@/modules/uuid/validation/generation-options";

import { defineMcpTool } from "../domain/define-tool";
import { succeed } from "../domain/result";

/**
 * RFC 9562 identifiers, from the same generator the page uses.
 *
 * The schema reuses the tool's own `uuidVersionSchema` and `uuidQuantitySchema`
 * rather than restating `1 | 4 | 7` and `1…500`, so a ceiling that moves in the
 * domain layer moves here in the same edit. That is the pattern for every
 * adapter in this directory: reuse the validation the page already has, add the
 * defaults an argument-free call needs.
 */
export const uuidGenerateTool = defineMcpTool({
    toolId: "uuid",
    verb: "generate",
    title: "Generate UUIDs",
    description:
        "Generate RFC 9562 UUIDs. Version 4 is random (the default choice for an id with no ordering); version 7 is time-ordered and sorts by creation time, which is what you want for a database key; version 1 is the legacy time-and-node layout. Returns the identifiers in generation order.",
    kind: "offline",
    inputSchema: z.object({
        version: uuidVersionSchema
            .default(DEFAULT_UUID_VERSION)
            .describe("4 = random, 7 = time-ordered, 1 = legacy time-based"),
        quantity: uuidQuantitySchema.default(DEFAULT_UUID_QUANTITY).describe("How many to emit"),
    }),
    run: ({ version, quantity }) => {
        const uuids = generateUuids({ version, quantity });
        const [first] = uuids;

        return succeed(`${uuids.length} UUID${uuids.length === 1 ? "" : "s"} (v${version})`, {
            uuids,
            version,
            quantity: uuids.length,
            // Read back off the first one rather than asserted, so the
            // report describes what was actually emitted.
            variant: first === undefined ? null : readUuidVariant(first),
            readVersion: first === undefined ? null : readUuidVersion(first),
        });
    },
});
