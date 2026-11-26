import { z } from "zod";

import { DEFAULT_PROCESSING } from "../domain/audio";
import type { Processing } from "../types";

const onOff = z.enum(["on", "off"]).optional().catch(undefined);

/**
 * `?noiseSuppression=off&autoGainControl=off` opens the tester asking for the
 * raw microphone. Each field falls back on its own, so one wrong value in a
 * shared link costs that value and not the page.
 */
export const micTesterSearchParamsSchema = z.object({
    echoCancellation: onOff,
    noiseSuppression: onOff,
    autoGainControl: onOff,
});

export function parseProcessing(searchParams: unknown): Processing {
    const parsed = micTesterSearchParamsSchema.safeParse(searchParams);
    const shared = parsed.success ? parsed.data : {};
    const read = (value: "on" | "off" | undefined, fallback: boolean) =>
        value === undefined ? fallback : value === "on";

    return {
        echoCancellation: read(shared.echoCancellation, DEFAULT_PROCESSING.echoCancellation),
        noiseSuppression: read(shared.noiseSuppression, DEFAULT_PROCESSING.noiseSuppression),
        autoGainControl: read(shared.autoGainControl, DEFAULT_PROCESSING.autoGainControl),
    };
}
