import { IconTerminal2, IconTopologyStar3, IconWorldPin } from "@tabler/icons-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getMyIpFaqEntries, MyIpArticle } from "@/modules/my-ip/components/my-ip-article";
import { MyIpCommandLine } from "@/modules/my-ip/components/my-ip-command-line";
import { MyIpReport } from "@/modules/my-ip/components/my-ip-report";
import {
    MyIpWorkbenchSkeleton,
    NetworkPanelSkeleton,
} from "@/modules/my-ip/components/my-ip-workbench-skeleton";
import { NetworkPanel } from "@/modules/my-ip/components/network-panel";
import { readVisitorRequest } from "@/modules/my-ip/domain/request";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { describeRouting } from "@/modules/tools/repository/host-address";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/my-ip";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("myIp.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("my-ip")?.keywords,
    });
}

export default async function MyIpPage({ params }: { params: LocaleParams }) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("myIp.hero"),
        getTranslations("tools"),
        getMyIpFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeRequest"), Icon: IconWorldPin },
        { label: t("badgeRegistry"), Icon: IconTopologyStar3 },
        { label: t("badgeCli"), Icon: IconTerminal2 },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("my-ip.name"),
                    description: tTools("my-ip.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("my-ip")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="my-ip"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06} className="flex flex-col gap-4">
                    <Suspense fallback={<MyIpWorkbenchSkeleton />}>
                        <MyIpWorkbenchSection />
                    </Suspense>
                    <MyIpCommandLine />
                </FadeIn>

                <Reveal>
                    <MyIpArticle />
                </Reveal>

                <RelatedTools toolId="my-ip" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: the caller's address and headers, read
 * from this request. Everything around it is prerendered.
 */
async function MyIpWorkbenchSection() {
    const inbound = await headers();
    const request = readVisitorRequest(resolveRemoteIp(inbound), inbound);
    const publicIp = request.address?.scope === "public" ? request.address.ip : null;

    return (
        <MyIpReport
            request={request}
            network={
                publicIp === null ? (
                    <NetworkPanel routing={null} />
                ) : (
                    // DNS answers take a moment; the address does not wait for them.
                    <Suspense fallback={<NetworkPanelSkeleton />}>
                        <NetworkSection ip={publicIp} />
                    </Suspense>
                )
            }
        />
    );
}

/**
 * Looked up on every view without a quota, which is why it is the DNS half
 * only: the reader can only ever look up their own address, and the answers
 * come through a public resolver's cache rather than an RDAP registry that
 * meters this server. See `describeRouting`.
 */
async function NetworkSection({ ip }: { ip: string }) {
    return <NetworkPanel routing={await describeRouting(ip, "cloudflare")} />;
}
