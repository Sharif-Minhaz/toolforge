import {
    IconChevronRight,
    IconFileTypeTxt,
    IconShieldCheck,
    IconWorldOff,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { Base64Article, getBase64FaqEntries } from "@/modules/base64/components/base64-article";
import { Base64Workbench } from "@/modules/base64/components/base64-workbench";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { isEncodable } from "@/modules/tools/domain/charsets";
import {
    DEFAULT_BASE64_MODE,
    DEFAULT_CHARSET,
    DEFAULT_ENCODE_OPTIONS,
} from "@/modules/base64/domain/constants";
import { base64SearchParamsSchema } from "@/modules/base64/validation/conversion-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/base64";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("base64.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("base64")?.keywords,
    });
}

type Base64PageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Base64ToolPage({ searchParams }: Base64PageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("base64.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getBase64FaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = base64SearchParamsSchema.safeParse(params);
    const mode = (parsed.success ? parsed.data.mode : undefined) ?? DEFAULT_BASE64_MODE;
    const text = (parsed.success ? parsed.data.text : undefined) ?? "";
    const alphabet =
        (parsed.success ? parsed.data.alphabet : undefined) ?? DEFAULT_ENCODE_OPTIONS.alphabet;
    const requestedCharset = (parsed.success ? parsed.data.charset : undefined) ?? DEFAULT_CHARSET;
    // A link may name a set that can only be read; encoding falls back to UTF-8
    // rather than opening on an error.
    const charset =
        mode === "encode" && !isEncodable(requestedCharset) ? DEFAULT_CHARSET : requestedCharset;

    const badges = [
        { label: t("badgeRfc"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeFiles"), Icon: IconFileTypeTxt },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("base64.name"),
                    description: tTools("base64.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("base64")?.keywords,
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
                    <Base64Workbench
                        initialMode={mode}
                        initialText={text}
                        initialAlphabet={alphabet}
                        initialCharset={charset}
                    />
                </FadeIn>

                <Reveal>
                    <Base64Article />
                </Reveal>

                <RelatedTools toolId="base64" />
            </div>
        </>
    );
}
