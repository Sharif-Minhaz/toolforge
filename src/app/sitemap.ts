import type { MetadataRoute } from "next";

import { getAvailableTools } from "@/modules/tools/domain/tool-catalog";
import { absoluteUrl } from "@/modules/seo/domain/site";

/**
 * Only shipped tools are listed. A planned tool has no route yet, and pointing
 * a crawler at a 404 costs crawl budget and trust.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const tools = getAvailableTools().map((tool) => ({
        url: absoluteUrl(tool.href),
        lastModified: new Date(tool.addedOn),
        changeFrequency: "monthly" as const,
        priority: 0.8,
    }));

    return [
        {
            url: absoluteUrl("/"),
            lastModified: new Date(),
            changeFrequency: "weekly" as const,
            priority: 1,
        },
        {
            // The MCP guide is content rather than a tool, so it is listed by
            // hand — `getAvailableTools()` does not know about it and should
            // not, since it is deliberately absent from every tool grid.
            url: absoluteUrl("/mcp"),
            lastModified: new Date(),
            changeFrequency: "monthly" as const,
            priority: 0.7,
        },
        ...tools,
    ];
}
