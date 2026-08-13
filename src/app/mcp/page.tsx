import { IconChevronRight, IconLock, IconPlugConnected, IconWorldBolt } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getMcpFaqEntries,
    getMcpTocItems,
    McpArticle,
    McpIntroduction,
} from "@/modules/mcp/components/mcp-article";
import { McpConnection } from "@/modules/mcp/components/mcp-connection";
import { McpToolTable } from "@/modules/mcp/components/mcp-tool-table";
import { MCP_ENDPOINT_PATH, MCP_TOKEN_ENV } from "@/modules/mcp/domain/constants";
import { isMcpQuotaConfigured } from "@/modules/mcp/repository/rate-limit";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { absoluteUrl } from "@/modules/seo/domain/site";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { ArticleToc } from "@/modules/tools/components/article-toc";

const PAGE_PATH = "/mcp";

const KEYWORDS = [
    "mcp",
    "model context protocol",
    "mcp server",
    "claude mcp",
    "chatgpt connector",
    "claude connector",
    "developer tools mcp",
    "remote mcp server",
    "streamable http",
    "ai tools",
];

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("mcp.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: PAGE_PATH,
        locale,
        keywords: KEYWORDS,
    });
}

/**
 * The connection guide.
 *
 * A page rather than a tool: it has no workbench, it sits in the General
 * section of the rail beside Overview, and it is deliberately absent from the
 * tool catalogue — a grid of utilities is not where somebody looks for "how do
 * I connect this to my assistant".
 *
 * Server-rendered throughout, including the two configuration checks. Whether
 * this deployment can actually serve MCP is a fact about the host, and reading
 * it during render is the one way the page cannot promise something the
 * endpoint will refuse.
 */
export default async function McpPage() {
    const [t, tNav, tToc, tocItems, faqs, locale] = await Promise.all([
        getTranslations("mcp.hero"),
        getTranslations("nav"),
        getTranslations("mcp.toc"),
        getMcpTocItems(),
        getMcpFaqEntries(),
        getLocale(),
    ]);

    const tokenConfigured = (process.env[MCP_TOKEN_ENV] ?? "").trim().length > 0;
    const badges = [
        { label: t("badgeProtocol"), Icon: IconPlugConnected },
        { label: t("badgeServer"), Icon: IconWorldBolt },
        { label: t("badgeGated"), Icon: IconLock },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: t("title"),
                    description: t("subtitle"),
                    path: PAGE_PATH,
                    locale,
                    keywords: KEYWORDS,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <FadeIn className="flex flex-col gap-4">
                    <nav aria-label={tNav("breadcrumb")}>
                        <ol className="text-muted-foreground flex items-center gap-1 text-xs">
                            <li>
                                <Link
                                    href="/"
                                    className="hover:text-foreground focus-visible:ring-ring rounded transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                                >
                                    {tNav("overview")}
                                </Link>
                            </li>
                            <li aria-hidden="true">
                                <IconChevronRight className="size-3.5" stroke={2} />
                            </li>
                            <li className="text-foreground">{t("eyebrow")}</li>
                        </ol>
                    </nav>

                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            {t("title")}
                        </h1>
                        <p className="text-muted-foreground max-w-2xl text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset"
                            >
                                <Icon
                                    className="text-primary size-3.5"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {label}
                            </li>
                        ))}
                    </ul>
                </FadeIn>

                <Reveal>
                    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-12">
                        <aside className="hidden min-w-0 xl:order-2 xl:block">
                            <ArticleToc title={tToc("title")} items={tocItems} />
                        </aside>

                        <article className="flex min-w-0 flex-col gap-12 xl:order-1">
                            <McpIntroduction />
                            <McpConnection
                                endpoint={absoluteUrl(MCP_ENDPOINT_PATH)}
                                tokenConfigured={tokenConfigured}
                                quotaConfigured={isMcpQuotaConfigured()}
                            />
                            <McpToolTable />
                            <McpArticle />
                        </article>
                    </div>
                </Reveal>
            </div>
        </>
    );
}
