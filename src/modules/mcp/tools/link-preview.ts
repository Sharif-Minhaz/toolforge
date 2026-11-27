import { z } from "zod";

import { analyzePreview } from "@/modules/link-preview/domain/analyze";
import { MAX_PASTED_HTML_LENGTH, MAX_URL_LENGTH } from "@/modules/link-preview/domain/constants";
import { readPreviewTags } from "@/modules/link-preview/domain/tags";
import type {
    ImageProbe,
    PageFacts,
    PreviewAnalysis,
    PreviewTags,
} from "@/modules/link-preview/types";
import { previewUrlSchema } from "@/modules/link-preview/validation/preview-request";
import { checkPublicUrl } from "@/modules/tools/domain/public-url";

import { defineMcpTool } from "../domain/define-tool";
import { toJsonValue } from "../domain/json-safe";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * The Link Preview debugger, in its two modes.
 *
 * **What comes back is the analysis, not the picture.** The page carries each
 * fetched `og:image` as a data URL so the cards can draw it without the
 * reader's browser touching the site; a model has no use for eight megabytes
 * of base64 and every use for the measurement. `dataUrl` is stripped and the
 * type, byte count and pixel size are kept.
 *
 * `inspect` is `kind: "network"`, behind `MCP_ACCESS_TOKEN`. The page has no
 * Turnstile to replace; the quota inside `runPreviewInspection` is spent on
 * this path exactly as on the page, under one literal caller key shared by
 * every MCP client, which is the conservative reading.
 *
 * `parse` is offline and the same `analyzePreview` the paste mode runs, so
 * an assistant that already has a page's markup — or is writing a template —
 * can check it without the server reaching anything.
 */

type McpImage =
    Omit<Extract<ImageProbe, { ok: true }>, "dataUrl"> | Extract<ImageProbe, { ok: false }>;

function withoutPixels(probe: ImageProbe): McpImage {
    if (!probe.ok) {
        return probe;
    }

    return {
        ok: true,
        url: probe.url,
        type: probe.type,
        bytes: probe.bytes,
        width: probe.width,
        height: probe.height,
    };
}

function report(
    analysis: PreviewAnalysis,
    tags: PreviewTags,
    page: PageFacts | null,
    images: readonly ImageProbe[],
) {
    return {
        page,
        cards: analysis.cards.map((card) => ({
            ...card,
            image:
                card.image === null
                    ? null
                    : {
                          ...card.image,
                          probe: card.image.probe === null ? null : withoutPixels(card.image.probe),
                      },
        })),
        findings: analysis.findings,
        tags: {
            document: tags.document,
            og: tags.og,
            twitter: tags.twitter,
        },
        images: images.map(withoutPixels),
    };
}

function summarize(analysis: PreviewAnalysis, subject: string): string {
    const errors = analysis.findings.filter((entry) => entry.severity === "error").length;
    const warnings = analysis.findings.filter((entry) => entry.severity === "warning").length;

    return `${subject}: ${errors} error(s), ${warnings} warning(s), ${analysis.findings.length - errors - warnings} note(s) across ${analysis.cards.length} platforms.`;
}

export const linkPreviewInspectTool = defineMcpTool({
    toolId: "link-preview",
    verb: "inspect",
    title: "Check how a link previews",
    description:
        "Fetch a public URL the way link-preview crawlers do and report how it would render as a card on Facebook, X, LinkedIn, WhatsApp, Slack, Discord, Telegram and Google search: which title, description and picture each platform picks and from which tag, whether it draws the large or small card, and every problem found — missing or duplicated Open Graph tags, a relative or http og:image, a picture too small, too large or in an undocumented format, text over a platform's limit (Discord counts UTF-8 bytes), og:url disagreeing with the canonical, a head past WhatsApp's 300 KB. The og:image and twitter:image are fetched and measured. Each finding says whether the rule behind it is official or community-reported. Makes outbound requests from the ToolForge server, so it requires the MCP access token. Private and link-local addresses are refused.",
    kind: "network",
    inputSchema: z.object({
        url: previewUrlSchema.describe("An absolute http or https address"),
    }),
    run: async ({ url }) => {
        const checked = checkPublicUrl(url);

        if (!checked.ok) {
            return refuseWithReason("Link preview", checked.reason);
        }

        // Imported at the point of use: `inspect.ts` is `server-only`, and a
        // static import would put that marker in the registry's import graph,
        // which the tests load outside a server runtime.
        const { runPreviewInspection } = await import("@/modules/link-preview/repository/inspect");

        const result = await runPreviewInspection({
            url: checked.url.toString(),
            callerKey: "mcp",
        });

        if (!result.ok) {
            return refuseWithReason("Link preview", result.reason, {
                url: checked.url.toString(),
                ...(result.allowance === undefined
                    ? {}
                    : { retryAfter: result.allowance.resetsAt }),
            });
        }

        const analysis = analyzePreview({
            tags: result.tags,
            pageUrl: new URL(result.page.finalUrl),
            page: result.page,
            images: result.images,
        });

        return succeed(
            summarize(analysis, result.page.finalUrl),
            toJsonValue(report(analysis, result.tags, result.page, result.images)),
        );
    },
});

export const linkPreviewParseTool = defineMcpTool({
    toolId: "link-preview",
    verb: "parse",
    title: "Check preview tags in HTML",
    description:
        "Read the Open Graph, Twitter Card and HTML preview tags out of markup you already have — a page's <head>, a template, a saved document — and report how each platform would render the card and every problem found, with the same rules as toolforge_link_preview_inspect. Nothing is fetched: pictures are reported as unmeasured, and sizes come from og:image:width and og:image:height when declared. Pass `pageUrl` so relative addresses resolve.",
    kind: "offline",
    inputSchema: z.object({
        html: z
            .string()
            .min(1)
            .max(MAX_PASTED_HTML_LENGTH)
            .describe("The markup; the head is enough"),
        pageUrl: z
            .string()
            .max(MAX_URL_LENGTH)
            .default("")
            .describe(
                "The page's own address, to resolve relative og:image and canonical URLs. Empty means none",
            ),
    }),
    run: ({ html, pageUrl }) => {
        let base: URL | null = null;

        if (pageUrl.trim().length > 0) {
            const checked = checkPublicUrl(pageUrl);

            if (!checked.ok) {
                return refuseWithReason("Link preview", checked.reason);
            }

            base = checked.url;
        }

        const tags = readPreviewTags(html);
        const analysis = analyzePreview({ tags, pageUrl: base, page: null, images: [] });

        return succeed(
            summarize(analysis, "Pasted markup"),
            toJsonValue(report(analysis, tags, null, [])),
        );
    },
});
