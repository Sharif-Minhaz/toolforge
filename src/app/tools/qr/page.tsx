import { IconChevronRight, IconQrcode, IconScan, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getQrFaqEntries, QrArticle } from "@/modules/qr/components/qr-article";
import { QrWorkbench } from "@/modules/qr/components/qr-workbench";
import {
    DEFAULT_DRAFT,
    DEFAULT_OPTIONS,
    DEFAULT_PAYLOAD_KIND,
} from "@/modules/qr/domain/constants";
import { isDynamicQrConfigured } from "@/modules/qr/repository/dynamic-config";
import { qrSearchParamsSchema } from "@/modules/qr/validation/qr-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/qr";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("qr.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("qr")?.keywords,
    });
}

type QrPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QrToolPage({ searchParams }: QrPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("qr.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getQrFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = qrSearchParamsSchema.safeParse(params);
    const shared = parsed.success ? parsed.data : {};

    const kind = shared.kind ?? DEFAULT_PAYLOAD_KIND;
    // A shared link fills the field belonging to the kind it named, so
    // `?kind=text&text=hello` opens on the text form already filled in.
    const draft =
        shared.text === undefined
            ? DEFAULT_DRAFT
            : kind === "text"
              ? { ...DEFAULT_DRAFT, text: shared.text }
              : kind === "url"
                ? { ...DEFAULT_DRAFT, url: shared.text }
                : DEFAULT_DRAFT;

    const options = {
        ...DEFAULT_OPTIONS,
        level: shared.level ?? DEFAULT_OPTIONS.level,
        dotStyle: shared.dots ?? DEFAULT_OPTIONS.dotStyle,
        eyeStyle: shared.eyes ?? DEFAULT_OPTIONS.eyeStyle,
        foreground: shared.fg ?? DEFAULT_OPTIONS.foreground,
        background: shared.bg ?? DEFAULT_OPTIONS.background,
    };

    // Read on the server and handed down, so the island never touches
    // `process.env` and an unconfigured deployment says so rather than offering
    // a control that could never work.
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;
    const dynamicStorageReady = isDynamicQrConfigured();

    // Set by the redirect route when a scanned short link names no live code.
    const missingCode = params.code === "missing";

    const badges = [
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeTypes"), Icon: IconQrcode },
        { label: t("badgeReader"), Icon: IconScan },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("qr.name"),
                    description: tTools("qr.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("qr")?.keywords,
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

                {missingCode && (
                    <FadeIn delay={0.03}>
                        <p
                            role="status"
                            className="border-brand-amber/40 bg-brand-amber/8 text-brand-amber rounded-xl border px-4 py-3 text-[0.8125rem] leading-relaxed"
                        >
                            {t("missingCode")}
                        </p>
                    </FadeIn>
                )}

                <FadeIn delay={0.06}>
                    <QrWorkbench
                        initialKind={kind}
                        initialDraft={draft}
                        initialOptions={options}
                        turnstileSiteKey={turnstileSiteKey}
                        dynamicStorageReady={dynamicStorageReady}
                    />
                </FadeIn>

                <Reveal>
                    <QrArticle />
                </Reveal>
            </div>
        </>
    );
}
