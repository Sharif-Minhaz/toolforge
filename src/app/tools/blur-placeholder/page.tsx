import { IconChevronRight, IconCpu, IconRuler2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    BlurPlaceholderArticle,
    getBlurPlaceholderFaqEntries,
} from "@/modules/blur-placeholder/components/blur-placeholder-article";
import { BlurPlaceholderWorkbench } from "@/modules/blur-placeholder/components/blur-placeholder-workbench";
import { DEFAULT_OPTIONS } from "@/modules/blur-placeholder/domain/constants";
import { placeholderSearchParamsSchema } from "@/modules/blur-placeholder/validation/placeholder-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/blur-placeholder";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("blurPlaceholder.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("blur-placeholder")?.keywords,
    });
}

type BlurPlaceholderPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BlurPlaceholderToolPage({ searchParams }: BlurPlaceholderPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("blurPlaceholder.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getBlurPlaceholderFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = placeholderSearchParamsSchema.safeParse(params);
    const named = parsed.success ? parsed.data : undefined;
    const initialHash = named?.hash ?? "";
    // A link carrying a hash is asking to see that hash, whatever else it says.
    const initialMode = initialHash.length > 0 ? "decode" : (named?.mode ?? "encode");
    const initialOptions = {
        componentX: named?.x ?? DEFAULT_OPTIONS.componentX,
        componentY: named?.y ?? DEFAULT_OPTIONS.componentY,
        punch: named?.punch ?? DEFAULT_OPTIONS.punch,
        edge: named?.edge ?? DEFAULT_OPTIONS.edge,
        ratio: named?.ratio ?? DEFAULT_OPTIONS.ratio,
    };

    const badges = [
        { label: t("badgeFormat"), Icon: IconRuler2 },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeCodec"), Icon: IconCpu },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("blur-placeholder.name"),
                    description: tTools("blur-placeholder.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("blur-placeholder")?.keywords,
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

                <FadeIn delay={0.06}>
                    <BlurPlaceholderWorkbench
                        urlImportEnabled={isRemoteImageImportConfigured()}
                        initialMode={initialMode}
                        initialOptions={initialOptions}
                        initialHash={initialHash}
                    />
                </FadeIn>

                <Reveal>
                    <BlurPlaceholderArticle />
                </Reveal>

                <RelatedTools toolId="blur-placeholder" />
            </div>
        </>
    );
}
