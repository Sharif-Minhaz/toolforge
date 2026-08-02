import { IconChevronRight, IconContrast, IconPalette, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { ColorArticle, getColorFaqEntries } from "@/modules/color/components/color-article";
import { ColorWorkbench } from "@/modules/color/components/color-workbench";
import { DEFAULT_COLOR, DEFAULT_FORMAT_OPTIONS } from "@/modules/color/domain/constants";
import { parseColorOrNull } from "@/modules/color/domain/parse";
import { colorSearchParamsSchema } from "@/modules/color/validation/color-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/color";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("color.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("color")?.keywords,
    });
}

type ColorPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ColorToolPage({ searchParams }: ColorPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("color.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getColorFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = colorSearchParamsSchema.safeParse(params);
    const requested = parsed.success ? parsed.data.color : undefined;
    // A link naming something that is not a colour opens on the default rather
    // than failing the request.
    const color = (requested === undefined ? null : parseColorOrNull(requested)) ?? DEFAULT_COLOR;

    const options = {
        notation:
            (parsed.success ? parsed.data.notation : undefined) ?? DEFAULT_FORMAT_OPTIONS.notation,
        hexCasing:
            (parsed.success ? parsed.data.hexCase : undefined) ?? DEFAULT_FORMAT_OPTIONS.hexCasing,
    };

    const badges = [
        { label: t("badgeFormats"), Icon: IconPalette },
        { label: t("badgeContrast"), Icon: IconContrast },
        { label: t("badgeOffline"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("color.name"),
                    description: tTools("color.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("color")?.keywords,
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
                    <ColorWorkbench initialColor={color} initialOptions={options} />
                </FadeIn>

                <Reveal>
                    <ColorArticle />
                </Reveal>

                <RelatedTools toolId="color" />
            </div>
        </>
    );
}
