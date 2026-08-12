import { z } from "zod";

import { MAX_REMOTE_IMAGE_URL_LENGTH } from "../domain/remote-image";

/**
 * What crosses the action boundary. Shape only — whether the string is a URL
 * this server may reach is `checkPublicUrl`'s question, and whether the address
 * behind it is one it may connect to is the address guard's.
 *
 * A short identity field, so it is capped rather than metered: a URL one
 * character over the ceiling is a paste accident, and refusing the keystroke
 * costs nothing. See `docs/patterns/input-limits.md`.
 */
export const remoteImageRequestSchema = z.object({
    url: z.string().trim().min(1).max(MAX_REMOTE_IMAGE_URL_LENGTH),
});

export type RemoteImageRequest = z.infer<typeof remoteImageRequestSchema>;
