import {
    IconChevronRight,
    IconShieldCheck,
    IconTransform,
    IconWorldOff,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { BsonArticle, getBsonFaqEntries } from "@/modules/bson/components/bson-article";
import { BsonWorkbench } from "@/modules/bson/components/bson-workbench";
import { BsonWorkbenchSkeleton } from "@/modules/bson/components/bson-workbench-skeleton";
import {
    DEFAULT_CONVERSION_OPTIONS,
    DEFAULT_SOURCE_FORMAT,
    DEFAULT_TARGET_FORMAT,
} from "@/modules/bson/domain/constants";
import { bsonSearchParamsSchema } from "@/modules/bson/validation/conversion-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

const TOOL_PATH = "/tools/bson";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("bson.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("bson")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type BsonPageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function BsonToolPage({ params, searchParams }: BsonPageProps) {
    await enterLocale(params);
    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("bson.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getBsonFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeLossless"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeFormats"), Icon: IconTransform },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("bson.name"),
                    description: tTools("bson.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("bson")?.keywords,
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
                        <p className="text-muted-foreground text-[0.9375rem] leading-7 sm:text-base">
                            {t("subtitle")}
                        </p>
                    </div>

                    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
                            >
                                <Icon className="size-3.5" stroke={1.9} aria-hidden="true" />
                                {label}
                            </li>
                        ))}
                    </ul>
                </FadeIn>

                <FadeIn delay={0.06}>
                    <Suspense fallback={<BsonWorkbenchSkeleton />}>
                        <BsonWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <BsonArticle />
                </Reveal>

                <RelatedTools toolId="bson" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options, so a shared
 * link opens on the document it carries. Everything around it is prerendered.
 */
async function BsonWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = bsonSearchParamsSchema.safeParse(await searchParams);
    const link = parsed.success ? parsed.data : undefined;

    const source = link?.from ?? DEFAULT_SOURCE_FORMAT;
    // A link naming the same format on both sides has no conversion in it, so
    // the target falls back rather than opening on a reformat nobody asked for.
    const requestedTarget = link?.to ?? DEFAULT_TARGET_FORMAT;
    const target =
        requestedTarget === source
            ? ((["json", "toon", "bson"] as const).find((format) => format !== source) ??
              DEFAULT_TARGET_FORMAT)
            : requestedTarget;

    const options = {
        bsonEncoding: link?.encoding ?? DEFAULT_CONVERSION_OPTIONS.bsonEncoding,
        ejsonMode: link?.ejson ?? DEFAULT_CONVERSION_OPTIONS.ejsonMode,
        jsonIndent: link?.jsonIndent ?? DEFAULT_CONVERSION_OPTIONS.jsonIndent,
        toonDelimiter: link?.delimiter ?? DEFAULT_CONVERSION_OPTIONS.toonDelimiter,
        toonIndent: link?.toonIndent ?? DEFAULT_CONVERSION_OPTIONS.toonIndent,
        toonStrict: DEFAULT_CONVERSION_OPTIONS.toonStrict,
    };

    return (
        <BsonWorkbench
            initialSource={source}
            initialTarget={target}
            initialInput={link?.input ?? ""}
            initialOptions={options}
        />
    );
}
