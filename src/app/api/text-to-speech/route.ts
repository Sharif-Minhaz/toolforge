import { handleSpeechRequest } from "@/modules/text-to-speech/repository/handle-speech";

/**
 * The Text to Speech stream. Plumbing on purpose: the gates, the stream and
 * the reasoning live in `handleSpeechRequest`, the same split the MCP route
 * uses.
 */

/** Every response is one reader's audio. Nothing here caches. */
export const dynamic = "force-dynamic";

/**
 * Ten thousand Bangla characters took 122 seconds when this was measured, and
 * single pieces varied from 11 to 32 seconds, so the slowest plausible run is
 * about 224. The platform's default limit would cut long scripts off
 * mid-sentence; five minutes covers the slow case. A run that still overruns
 * ends without its `done` frame and the page reports it as interrupted, never
 * as a finished file.
 */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
    return handleSpeechRequest(request);
}
