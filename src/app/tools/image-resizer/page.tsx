import { IconChevronRight, IconCpu, IconId, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getImageResizerFaqEntries,
    ImageResizerArticle,
} from "@/modules/image-resizer/components/image-resizer-article";
import { ImageResizerWorkbench } from "@/modules/image-resizer/components/image-resizer-workbench";
import {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_OPTIONS,
} from "@/modules/image-resizer/domain/constants";
import { findPreset, presetDpi } from "@/modules/image-resizer/domain/presets";
import type { ResizeOptions } from "@/modules/image-resizer/types";
import { resizeSearchParamsSchema } from "@/modules/image-resizer/validation/resize-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";

const TOOL_PATH = "/tools/image-resizer";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("imageResizer.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("image-resizer")?.keywords,
    });
}

type ImageResizerPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImageResizerToolPage({ searchParams }: ImageResizerPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("imageResizer.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getImageResizerFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = resizeSearchParamsSchema.safeParse(params);
    const query = parsed.success ? parsed.data : {};
    const presetId = query.preset ?? DEFAULT_OPTIONS.presetId;
    const preset = findPreset(presetId);

    const initialOptions: ResizeOptions = {
        ...DEFAULT_OPTIONS,
        // A link that names a preset means the preset mode, even when it left
        // `mode` out — the alternative is a link that silently ignores half of
        // itself.
        mode: query.mode ?? (query.preset === undefined ? DEFAULT_OPTIONS.mode : "preset"),
        width: query.w ?? DEFAULT_OPTIONS.width,
        height: query.h ?? DEFAULT_OPTIONS.height,
        unit: query.unit ?? DEFAULT_OPTIONS.unit,
        // The preset's own resolution wins over the default but not over one
        // the link asked for.
        dpi: query.dpi ?? (preset === null ? null : presetDpi(preset.size)) ?? DEFAULT_OPTIONS.dpi,
        percentage: query.percent ?? DEFAULT_OPTIONS.percentage,
        presetId,
        fit: query.fit ?? preset?.fit ?? DEFAULT_OPTIONS.fit,
        format: query.format ?? DEFAULT_OPTIONS.format,
        quality: query.quality ?? DEFAULT_OPTIONS.quality,
        backgroundColor: query.bg ?? DEFAULT_BACKGROUND_COLOR,
    };

    const badges = [
        { label: t("badgeCodecs"), Icon: IconCpu },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgePassport"), Icon: IconId },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("image-resizer.name"),
                    description: tTools("image-resizer.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("image-resizer")?.keywords,
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
                    <ImageResizerWorkbench
                        initialOptions={initialOptions}
                        // Read on the server, because whether this deployment has
                        // a database and a salt is not something the browser can
                        // know — and a control that cannot work is worse than an
                        // absent one.
                        urlImportEnabled={isRemoteImageImportConfigured()}
                    />
                </FadeIn>

                <Reveal>
                    <ImageResizerArticle />
                </Reveal>

                <RelatedTools toolId="image-resizer" />
            </div>
        </>
    );
}
