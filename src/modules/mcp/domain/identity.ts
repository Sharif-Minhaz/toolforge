import { absoluteUrl, SITE_URL } from "@/modules/seo/domain/site";

import { MCP_SERVER_NAME, MCP_SERVER_TITLE, MCP_SERVER_VERSION } from "./constants";

/**
 * How ToolForge introduces itself during the MCP handshake.
 *
 * A client shows this — the name, the mark, the link — in its connector list
 * and beside every tool call in a transcript, so it is the same identity
 * problem the site's own metadata solves and it reuses the same constants. A
 * connector with no icon renders as a grey placeholder next to the ones that
 * have one, which is a worse answer than it sounds: the icon is how somebody
 * scanning a list of connected servers finds ours.
 *
 * The images are the existing PWA icons rather than new files. Two sizes
 * because clients pick per surface — a 192 for a list row, a 512 for a detail
 * pane — and the `.ico` last for whatever still wants one.
 *
 * **Absolute URLs, not `data:`.** Inlining the 192 would add roughly 21 KB of
 * base64 to every handshake for an image most clients cache after the first
 * fetch. The cost of the link instead is that it resolves against
 * `NEXT_PUBLIC_SITE_URL`: unset, it points at localhost and a remote client
 * shows no icon. That is the same trade the Open Graph card already makes, and
 * the same variable fixes both.
 */

export type McpIcon = {
    readonly src: string;
    readonly mimeType: string;
    readonly sizes: readonly string[];
};

export const MCP_SERVER_ICONS: readonly McpIcon[] = [
    { src: absoluteUrl("/icon-192.png"), mimeType: "image/png", sizes: ["192x192"] },
    { src: absoluteUrl("/icon-512.png"), mimeType: "image/png", sizes: ["512x512"] },
    { src: absoluteUrl("/favicon.ico"), mimeType: "image/x-icon", sizes: ["any"] },
];

/**
 * `Implementation`, in the SDK's vocabulary — built here rather than inline at
 * the connection so a test can assert the icons resolve to absolute URLs
 * without standing up a transport.
 */
export function buildMcpIdentity(): {
    name: string;
    title: string;
    version: string;
    websiteUrl: string;
    description: string;
    // Mutable, and copied below, because the SDK's `Implementation` declares it
    // that way. Handing over the frozen module-level array would either not
    // type-check or leave the SDK holding something it believes it may edit.
    icons: { src: string; mimeType: string; sizes: string[] }[];
} {
    return {
        name: MCP_SERVER_NAME,
        title: MCP_SERVER_TITLE,
        version: MCP_SERVER_VERSION,
        websiteUrl: SITE_URL,
        description:
            "Developer utilities from ToolForge: encoding, hashing, encryption, formatting, text and network tools, run server-side over MCP.",
        icons: MCP_SERVER_ICONS.map((icon) => ({
            src: icon.src,
            mimeType: icon.mimeType,
            sizes: [...icon.sizes],
        })),
    };
}
