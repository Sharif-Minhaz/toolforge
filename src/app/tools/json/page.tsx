import { IconChevronRight, IconShieldCheck, IconTool, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getJsonFaqEntries, JsonArticle } from "@/modules/json/components/json-article";
import { JsonWorkbench } from "@/modules/json/components/json-workbench";
import { DEFAULT_FORMAT_OPTIONS, DEFAULT_JSON_MODE } from "@/modules/json/domain/constants";
import { jsonSearchParamsSchema } from "@/modules/json/validation/format-options";
import type { JsonFormatOptions } from "@/modules/json/types";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/json";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("json.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("json")?.keywords,
    });
}

type JsonPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JsonToolPage({ searchParams }: JsonPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("json.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getJsonFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = jsonSearchParamsSchema.safeParse(params);
    const link = parsed.success ? parsed.data : {};

    const mode = link.mode ?? DEFAULT_JSON_MODE;
    const text = link.text ?? "";
    const options: JsonFormatOptions = {
        indent: link.indent ?? DEFAULT_FORMAT_OPTIONS.indent,
        spec: link.spec ?? DEFAULT_FORMAT_OPTIONS.spec,
        repair: link.repair ?? DEFAULT_FORMAT_OPTIONS.repair,
        sortKeys: link.sortKeys ?? DEFAULT_FORMAT_OPTIONS.sortKeys,
        escapeUnicode: link.escapeUnicode ?? DEFAULT_FORMAT_OPTIONS.escapeUnicode,
    };

    const badges = [
        { label: t("badgeSpec"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeFiles"), Icon: IconTool },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("json.name"),
                    description: tTools("json.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("json")?.keywords,
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
                    <JsonWorkbench initialMode={mode} initialText={text} initialOptions={options} />
                </FadeIn>

                <Reveal>
                    <JsonArticle />
                </Reveal>
            </div>
        </>
    );
}
