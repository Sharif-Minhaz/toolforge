import { z } from "zod";

import { MOTION_SPEEDS } from "../types";

export const motionSpeedSchema = z.enum(MOTION_SPEEDS);

/** `?speed=fast` opens the motion test at that speed; anything else opens it at the default. */
export const refreshRateTesterSearchParamsSchema = z.object({
    speed: motionSpeedSchema.optional().catch(undefined),
});
