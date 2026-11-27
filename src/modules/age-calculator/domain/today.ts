import { getZonedFields } from "@/modules/tools/domain/zone";
import type { CivilDate } from "../types";
import { REFERENCE_TIME_ZONE } from "./constants";

/**
 * The calendar date in Dhaka at `epochMs`. The page calls this once on the
 * server, after reading the request, and passes the date down as a prop — so
 * the server render and the hydration pass agree on what "today" is, and a
 * reader at 11 pm in London still gets Bangladesh's date, not their own.
 */
export function todayInBangladesh(epochMs: number): CivilDate {
    const { year, month, day } = getZonedFields(epochMs, REFERENCE_TIME_ZONE);

    return { year, month, day };
}
