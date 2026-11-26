import { z } from "zod";

import { MAX_MCP_PHOTO_BYTES } from "../domain/constants";

export const stripOptionsSchema = z.object({
    keepColorProfile: z.boolean(),
    keepOrientation: z.boolean(),
});

/** A photo as Base64, sized so its decoded bytes cannot pass `MAX_MCP_PHOTO_BYTES` by much. */
export const photoBase64Schema = z.string().max(Math.ceil(MAX_MCP_PHOTO_BYTES / 3) * 4 + 4);
