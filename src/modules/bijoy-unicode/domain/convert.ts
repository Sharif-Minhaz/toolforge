import { describeText } from "@/modules/tools/domain/text-stats";
import type { BijoyDirection, BijoyNotice, BijoyResult } from "../types";
import { MAX_BIJOY_INPUT_LENGTH } from "./constants";
import { containsBanglaLetter } from "./script";
import { unicodeToBijoy } from "./to-bijoy";
import { bijoyToUnicode } from "./to-unicode";

/**
 * The one entry point the page, the island and the MCP adapter all call.
 * Pure and deterministic, so the server-rendered pass already holds the result.
 */
export function convertBijoy(text: string, direction: BijoyDirection): BijoyResult {
    if (text.length > MAX_BIJOY_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const converted = direction === "to-unicode" ? bijoyToUnicode(text) : unicodeToBijoy(text);

    return {
        ok: true,
        text: converted,
        stats: describeText(converted),
        notice: noticeFor(text, direction),
    };
}

/**
 * The likeliest mistake in each direction, caught from the input alone: Bijoy
 * text is plain Latin as far as Unicode is concerned, so a single Bengali-block
 * letter means the text is already Unicode — and going the other way, the lack
 * of one means there was nothing to convert.
 */
function noticeFor(text: string, direction: BijoyDirection): BijoyNotice | null {
    if (text.trim().length === 0) {
        return null;
    }

    const hasBangla = containsBanglaLetter(text);

    if (direction === "to-unicode" && hasBangla) {
        return "already_unicode";
    }

    if (direction === "to-bijoy" && !hasBangla) {
        return "no_bangla";
    }

    return null;
}
