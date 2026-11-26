import { z } from "zod";

import { CLI_FORMATS } from "../types";

/** `?format=` on `/api/ip`. Anything unrecognised answers as plain text, never an error. */
export const cliQuerySchema = z.object({
    format: z.enum(CLI_FORMATS).optional().catch(undefined),
});
