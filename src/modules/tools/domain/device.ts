import type { Tool } from "../types";

/**
 * Whether the browser is on a phone, judged from what it says about itself.
 *
 * `navigator.userAgentData.mobile` is the browser's own answer where it gives
 * one (Chromium). Elsewhere the user-agent string decides: `Mobi` is the token
 * Mozilla's guidance names for exactly this question, and an Android phone, an
 * iPhone and an iPod all carry it or their own name. A tablet does not — and is
 * deliberately not a phone here, because a tablet with a keyboard case is a
 * keyboard worth testing.
 *
 * Its own file, like `network.ts`, so a client component can ask without
 * bundling the catalogue.
 */
const PHONE_USER_AGENT = /\bMobi|\biPhone\b|\biPod\b|\bWindows Phone\b/;

export function isPhone(userAgent: string, mobileHint: boolean | undefined): boolean {
    return mobileHint ?? PHONE_USER_AGENT.test(userAgent);
}

/** Whether a tool is left out of the lists on a phone. */
export function hiddenOnPhone(tool: Pick<Tool, "desktopOnly">): boolean {
    return tool.desktopOnly === true;
}
