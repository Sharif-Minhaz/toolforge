import { IconChevronRight, IconClock, IconWorld, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { DEFAULT_INPUT_TIME_ZONE, DEFAULT_UNIT } from "@/modules/timestamp/domain/constants";
import {
    getTimestampFaqEntries,
    TimestampArticle,
} from "@/modules/timestamp/components/timestamp-article";
import { TimestampWorkbench } from "@/modules/timestamp/components/timestamp-workbench";
import { timestampSearchParamsSchema } from "@/modules/timestamp/validation/timestamp-options";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/timestamp";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("timestamp.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("timestamp")?.keywords,
    });
}

type TimestampPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimestampToolPage({ searchParams }: TimestampPageProps) {
    // Read once, at the top, and passed down as a prop — so the server-rendered
    // first paint and the hydration pass read the same instant.
    const now = new Date();

    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("timestamp.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getTimestampFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = timestampSearchParamsSchema.safeParse(params);
    const data = parsed.success ? parsed.data : undefined;

    const badges = [
        { label: t("badgeFormats"), Icon: IconClock },
        { label: t("badgeZones"), Icon: IconWorld },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("timestamp.name"),
                    description: tTools("timestamp.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("timestamp")?.keywords,
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
                                className="bg-card/70 text-muted-foreground ring-border/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-[1.3] font-medium ring-1 ring-inset"
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

                <FadeIn delay={0.06}>
                    <TimestampWorkbench
                        initialInput={data?.t ?? ""}
                        initialUnit={data?.unit ?? DEFAULT_UNIT}
                        initialInputTimeZone={data?.in ?? DEFAULT_INPUT_TIME_ZONE}
                        initialPinnedTimeZones={data?.tz ?? []}
                        initialNowMs={now.getTime()}
                    />
                </FadeIn>

                <Reveal>
                    <TimestampArticle />
                </Reveal>

                <RelatedTools toolId="timestamp" />
            </div>
        </>
    );
}
