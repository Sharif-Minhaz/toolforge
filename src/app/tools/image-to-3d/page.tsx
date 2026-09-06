import { IconChevronRight, IconCube3dSphere, IconPrinter, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getImageTo3dFaqEntries,
    ImageTo3dArticle,
} from "@/modules/image-to-3d/components/image-to-3d-article";
import { ImageTo3dWorkbench } from "@/modules/image-to-3d/components/image-to-3d-workbench";
import { DEFAULT_OPTIONS } from "@/modules/image-to-3d/domain/constants";
import { modelSearchParamsSchema } from "@/modules/image-to-3d/validation/model-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { isRemoteImageImportConfigured } from "@/modules/tools/repository/remote-image-quota";

const TOOL_PATH = "/tools/image-to-3d";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("imageTo3d.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("image-to-3d")?.keywords,
    });
}

type ImageTo3dPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImageTo3dToolPage({ searchParams }: ImageTo3dPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("imageTo3d.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getImageTo3dFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    // Parsed on the server and handed down, so a shared link opens on the
    // settings it names rather than on the defaults plus a flicker.
    const parsed = modelSearchParamsSchema.safeParse(params);
    const named = parsed.success ? parsed.data : undefined;

    const initialOptions = {
        source: named?.src ?? DEFAULT_OPTIONS.source,
        invert: named?.invert ?? DEFAULT_OPTIONS.invert,
        smoothing: named?.smooth ?? DEFAULT_OPTIONS.smoothing,
        resolution: named?.res ?? DEFAULT_OPTIONS.resolution,
        shape: named?.shape ?? DEFAULT_OPTIONS.shape,
        width: named?.width ?? DEFAULT_OPTIONS.width,
        depth: named?.depth ?? DEFAULT_OPTIONS.depth,
        solid: named?.solid ?? DEFAULT_OPTIONS.solid,
        baseThickness: named?.base ?? DEFAULT_OPTIONS.baseThickness,
        detail: named?.detail ?? DEFAULT_OPTIONS.detail,
        format: named?.format ?? DEFAULT_OPTIONS.format,
    };

    // On by default: a photograph of an object is mostly not the object, and a
    // body inflated from the whole frame is a pillow rather than the thing in
    // it. What that costs — a one-time model download — is disclosed on the
    // control itself rather than only here.
    const initialCutout = named?.cut ?? true;

    const badges = [
        { label: t("badgeFormats"), Icon: IconCube3dSphere },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgePrintable"), Icon: IconPrinter },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("image-to-3d.name"),
                    description: tTools("image-to-3d.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("image-to-3d")?.keywords,
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
                    <ImageTo3dWorkbench
                        initialOptions={initialOptions}
                        initialCutout={initialCutout}
                        urlImportEnabled={isRemoteImageImportConfigured()}
                    />
                </FadeIn>

                <Reveal>
                    <ImageTo3dArticle />
                </Reveal>

                <RelatedTools toolId="image-to-3d" />
            </div>
        </>
    );
}
