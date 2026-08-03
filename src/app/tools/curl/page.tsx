import {
    IconChevronRight,
    IconTerminal2,
    IconWorldOff,
    IconAlertTriangle,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { CurlArticle, getCurlFaqEntries } from "@/modules/curl/components/curl-article";
import { CurlWorkbench } from "@/modules/curl/components/curl-workbench";
import {
    DEFAULT_CODE_OPTIONS,
    DEFAULT_CURL_OPTIONS,
    DEFAULT_DIRECTION,
    SAMPLE_CURL,
    SAMPLE_FETCH,
} from "@/modules/curl/domain/constants";
import { runtimeApplies, styleApplies } from "@/modules/curl/domain/targets";
import { curlSearchParamsSchema } from "@/modules/curl/validation/curl-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/curl";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("curl.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("curl")?.keywords,
    });
}

type CurlPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CurlToolPage({ searchParams }: CurlPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("curl.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getCurlFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = curlSearchParamsSchema.safeParse(params);
    const read = parsed.success ? parsed.data : {};
    const direction = read.direction ?? DEFAULT_DIRECTION;
    const target = read.target ?? DEFAULT_CODE_OPTIONS.target;

    // A link may name an option the chosen target ignores. Opening on the
    // default is friendlier than opening on a control that is disabled and
    // disagrees with the output beside it.
    const runtime = runtimeApplies(target)
        ? (read.runtime ?? DEFAULT_CODE_OPTIONS.runtime)
        : DEFAULT_CODE_OPTIONS.runtime;
    const style = styleApplies(target)
        ? (read.style ?? DEFAULT_CODE_OPTIONS.style)
        : DEFAULT_CODE_OPTIONS.style;

    // Generated on the server and passed down, so the first paint already holds
    // a converted request rather than an empty box.
    const input = read.input ?? (direction === "curlToCode" ? SAMPLE_CURL : SAMPLE_FETCH);

    const badges = [
        { label: t("badgeShells"), Icon: IconTerminal2 },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeHonest"), Icon: IconAlertTriangle },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("curl.name"),
                    description: tTools("curl.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("curl")?.keywords,
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
                                <span className="leading-[1.3]">{label}</span>
                            </li>
                        ))}
                    </ul>
                </FadeIn>

                <FadeIn delay={0.06}>
                    <CurlWorkbench
                        initialDirection={direction}
                        initialInput={input}
                        initialTarget={target}
                        initialRuntime={runtime}
                        initialStyle={style}
                        initialShell={read.shell ?? DEFAULT_CURL_OPTIONS.shell}
                    />
                </FadeIn>

                <Reveal>
                    <CurlArticle />
                </Reveal>

                <RelatedTools toolId="curl" />
            </div>
        </>
    );
}
