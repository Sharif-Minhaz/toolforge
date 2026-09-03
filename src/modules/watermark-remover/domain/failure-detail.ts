/**
 * The engine's own words, for the log and never for the page.
 *
 * Shared by both offline halves. A reader gets the localised sentence for the
 * refusal's name; this is what makes "the clip could not be cleaned" into a bug
 * report somebody can act on, and swallowing it once already cost a debugging
 * round trip.
 */
export function describeEngineError(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
