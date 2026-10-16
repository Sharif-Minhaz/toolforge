import { handleSpeechRequest } from "@/modules/text-to-speech/repository/handle-speech";

/**
 * The Text to Speech stream. Plumbing on purpose: the gates, the stream and
 * the reasoning live in `handleSpeechRequest`, the same split the MCP route
 * uses.
 */

/** Every response is one reader's audio. Nothing here caches. */
export const dynamic = "force-dynamic";

/**
 * Five thousand Bangla characters took seventy-two seconds to speak when this
 * was measured, so the platform's default limit would cut the longest scripts
 * off mid-sentence. Five minutes leaves room for a slow day at the service.
 */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
    return handleSpeechRequest(request);
}
