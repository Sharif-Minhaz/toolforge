import { z } from "zod";

import { MAX_SHARED_SQL_LENGTH } from "../domain/constants";
import { SQL_DIALECTS, SQL_INDENTS, SQL_KEYWORD_CASES, SQL_QUERY_GAPS } from "../types";

export const sqlDialectSchema = z.enum(SQL_DIALECTS);

export const sqlKeywordCaseSchema = z.enum(SQL_KEYWORD_CASES);

export const sqlIndentSchema = z.enum(SQL_INDENTS);

export const sqlQueryGapSchema = z.literal(SQL_QUERY_GAPS);

/**
 * Search-param shape for `/tools/sql-formatter?dialect=postgresql&sql=select+1`.
 * Each field catches on its own, so one malformed value degrades to the default
 * instead of throwing the whole page away.
 */
export const sqlFormatterSearchParamsSchema = z.object({
    sql: z.string().max(MAX_SHARED_SQL_LENGTH).optional().catch(undefined),
    dialect: sqlDialectSchema.optional().catch(undefined),
    keywordCase: sqlKeywordCaseSchema.optional().catch(undefined),
    indent: sqlIndentSchema.optional().catch(undefined),
    lines: z.coerce.number().pipe(sqlQueryGapSchema).optional().catch(undefined),
});
