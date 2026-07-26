/**
 * Absolute origin used for canonical URLs, Open Graph tags, and JSON-LD.
 * Falls back to localhost so builds work without deployment config.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const SITE_NAME = "ToolForge";

export function absoluteUrl(path: string): string {
    return new URL(path, SITE_URL).toString();
}
