import {
    IconChevronRight,
    IconDeviceDesktopOff,
    IconStethoscope,
    IconWorldOff,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getMouseTesterFaqEntries,
    MouseTesterArticle,
} from "@/modules/mouse-tester/components/mouse-tester-article";
import { MouseTesterWorkbench } from "@/modules/mouse-tester/components/mouse-tester-workbench";
import { DEFAULT_FAULT_WINDOW_MS } from "@/modules/mouse-tester/domain/constants";
import { mouseTesterSearchParamsSchema } from "@/modules/mouse-tester/validation/settings";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/mouse-tester";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("mouseTester.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("mouse-tester")?.keywords,
    });
}

type MouseTesterPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MouseTesterPage({ searchParams }: MouseTesterPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("mouseTester.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getMouseTesterFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = mouseTesterSearchParamsSchema.safeParse(params);
    const shared = parsed.success ? parsed.data : undefined;

    const badges = [
        { label: t("badgeCapture"), Icon: IconDeviceDesktopOff },
        { label: t("badgeDiagnosis"), Icon: IconStethoscope },
        { label: t("badgeLocal"), Icon: IconWorldOff },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("mouse-tester.name"),
                    description: tTools("mouse-tester.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("mouse-tester")?.keywords,
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
                    <MouseTesterWorkbench
                        initialFaultWindow={shared?.window ?? DEFAULT_FAULT_WINDOW_MS}
                    />
                </FadeIn>

                <Reveal>
                    <MouseTesterArticle />
                </Reveal>

                <RelatedTools toolId="mouse-tester" />
            </div>
        </>
    );
}
