import { IconChevronRight, IconClockPause, IconRadar2, IconShieldLock } from "@tabler/icons-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    getPortScannerFaqEntries,
    PortScannerArticle,
} from "@/modules/port-scanner/components/port-scanner-article";
import { PortScannerWorkbench } from "@/modules/port-scanner/components/port-scanner-workbench";
import { readScanQuota } from "@/modules/port-scanner/actions/scan-ports";
import { isQuotaConfigured } from "@/modules/port-scanner/repository/quota";
import { portScannerSearchParamsSchema } from "@/modules/port-scanner/validation/scan-request";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { classifyAddress } from "@/modules/tools/domain/ip";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

const TOOL_PATH = "/tools/port-scanner";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("portScanner.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("port-scanner")?.keywords,
    });
}

type PortScannerPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PortScannerPage({ searchParams }: PortScannerPageProps) {
    const [t, tTools, tNav, faqs, locale, params, inbound] = await Promise.all([
        getTranslations("portScanner.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getPortScannerFaqEntries(),
        getLocale(),
        searchParams,
        headers(),
    ]);

    const parsed = portScannerSearchParamsSchema.safeParse(params);
    const link = parsed.success ? parsed.data : undefined;

    const configured = isQuotaConfigured();

    // Read on the server so the count is right before the reader presses
    // anything — a "10 remaining" that turns out to be 0 on the first press is
    // worse than showing nothing at all.
    const quota = configured ? await readScanQuota() : null;

    // Offered as a prefill only when it is a public address. Behind a proxy
    // that strips the header, or on a private network, there is nothing honest
    // to show and the button simply does not appear.
    const remoteIp = resolveRemoteIp(inbound);
    const viewerAddress =
        remoteIp !== undefined && classifyAddress(remoteIp) === "public" ? remoteIp : null;

    const badges = [
        { label: t("badgeStates"), Icon: IconRadar2 },
        { label: t("badgeGuarded"), Icon: IconShieldLock },
        { label: t("badgeLimited"), Icon: IconClockPause },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("port-scanner.name"),
                    description: tTools("port-scanner.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("port-scanner")?.keywords,
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
                    <PortScannerWorkbench
                        initialHost={link?.host ?? viewerAddress ?? ""}
                        initialPreset={link?.preset ?? "top"}
                        viewerAddress={viewerAddress}
                        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null}
                        configured={configured}
                        initialQuota={quota}
                    />
                </FadeIn>

                <Reveal>
                    <PortScannerArticle />
                </Reveal>

                <RelatedTools toolId="port-scanner" />
            </div>
        </>
    );
}
