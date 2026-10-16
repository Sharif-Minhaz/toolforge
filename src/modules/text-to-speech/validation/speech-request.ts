import { z } from "zod";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";

import type { SpeechVoiceId } from "../types";
import { MAX_SPEECH_CHARACTERS, PROSODY_MAX, PROSODY_MIN } from "../domain/constants";
import { isSpeechVoiceId } from "../domain/voices";

/**
 * The body the island posts to `/api/text-to-speech`.
 *
 * Shape only. Whether the text can actually be spoken — empty, a pause out of
 * range, too many pauses — is `planSpeech`'s verdict, which keeps its own
 * reason names; a refinement here would collapse all of them into
 * `invalid_request`.
 */

const prosodySchema = z.number().int().min(PROSODY_MIN).max(PROSODY_MAX);

export const speechRequestSchema = z.object({
    text: z.string().max(MAX_SPEECH_CHARACTERS),
    voice: z.custom<SpeechVoiceId>((value) => typeof value === "string" && isSpeechVoiceId(value)),
    settings: z.object({
        rate: prosodySchema,
        volume: prosodySchema,
        pitch: prosodySchema,
    }),
    token: z.string().min(1).max(MAX_TURNSTILE_TOKEN_LENGTH),
});

export type SpeechRequest = z.infer<typeof speechRequestSchema>;
