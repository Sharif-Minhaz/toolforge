import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { canvasFont, fontStack } from "../domain/fonts";
import { REFERENCE_FONT_SIZE } from "../domain/constants";
import type { FaviconFont } from "../types";

/** The family list for `font`, with next/font's hashed names read off the page. */
export function resolveFontStack(font: FaviconFont): string {
    const style = getComputedStyle(document.documentElement);

    return fontStack(font, (name) => style.getPropertyValue(name));
}

/**
 * Waits until the faces `text` needs are loaded. A canvas draws a font that is
 * still downloading in the fallback, silently — and next/font loads each subset
 * only once a page uses it, so the Bangla face may not be there yet.
 *
 * A refusal is logged and drawing goes ahead: the fallback font is a worse
 * icon, not a broken one.
 */
export async function loadGlyphFont(stack: string, bold: boolean, text: string): Promise<void> {
    try {
        await document.fonts.load(canvasFont(stack, bold, REFERENCE_FONT_SIZE), text);
    } catch (caught) {
        logEvent("warn", "favicon_generator.font_load_failed", { error: describeError(caught) });
    }
}
