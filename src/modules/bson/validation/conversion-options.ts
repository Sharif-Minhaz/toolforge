import { z } from "zod";

import { MAX_INPUT_LENGTH } from "../domain/constants";
import {
    BSON_ENCODINGS,
    DATA_FORMATS,
    EJSON_MODES,
    JSON_INDENTS,
    TOON_DELIMITERS,
    TOON_INDENTS,
} from "../types";

/**
 * One `.catch(undefined)` per field, so a link carrying one bad value opens on
 * that field's default instead of throwing the whole page away. A shared link
 * is the least supervised input this tool has.
 */
export const bsonSearchParamsSchema = z.object({
    from: z.enum(DATA_FORMATS).optional().catch(undefined),
    to: z.enum(DATA_FORMATS).optional().catch(undefined),
    input: z.string().max(MAX_INPUT_LENGTH).optional().catch(undefined),
    encoding: z.enum(BSON_ENCODINGS).optional().catch(undefined),
    ejson: z.enum(EJSON_MODES).optional().catch(undefined),
    jsonIndent: z.enum(JSON_INDENTS).optional().catch(undefined),
    delimiter: z.enum(TOON_DELIMITERS).optional().catch(undefined),
    toonIndent: z.enum(TOON_INDENTS).optional().catch(undefined),
});

export type BsonSearchParams = z.infer<typeof bsonSearchParamsSchema>;
