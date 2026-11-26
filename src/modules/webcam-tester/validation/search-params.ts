import { z } from "zod";

import { RESOLUTION_PRESETS } from "../types";

/**
 * `?resolution=full-hd&mirror=off` opens the tester asking for that size,
 * unmirrored. Each field falls back on its own, so one wrong value in a shared
 * link costs that value and not the page.
 */
export const webcamTesterSearchParamsSchema = z.object({
    resolution: z.enum(RESOLUTION_PRESETS).optional().catch(undefined),
    mirror: z.enum(["on", "off"]).optional().catch(undefined),
});
