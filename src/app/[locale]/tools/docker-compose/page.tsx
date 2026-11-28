import { IconAlertTriangle, IconTerminal2, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import {
    DockerComposeArticle,
    getDockerComposeFaqEntries,
} from "@/modules/docker-compose/components/docker-compose-article";
import { DockerComposeWorkbench } from "@/modules/docker-compose/components/docker-compose-workbench";
import { DockerComposeWorkbenchSkeleton } from "@/modules/docker-compose/components/docker-compose-workbench-skeleton";
import {
    DEFAULT_DIRECTION,
    SAMPLE_COMPOSE,
    SAMPLE_RUN,
} from "@/modules/docker-compose/domain/constants";
import { dockerComposeSearchParamsSchema } from "@/modules/docker-compose/validation/docker-compose-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { ToolPageHeader } from "@/modules/tools/components/tool-page-header";

const TOOL_PATH = "/tools/docker-compose";

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const [t, locale] = await Promise.all([getTranslations("dockerCompose.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("docker-compose")?.keywords,
    });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type DockerComposePageProps = {
    params: LocaleParams;
    searchParams: SearchParams;
};

export default async function DockerComposeToolPage({
    params,
    searchParams,
}: DockerComposePageProps) {
    await enterLocale(params);
    const [t, tTools, faqs, locale] = await Promise.all([
        getTranslations("dockerCompose.hero"),
        getTranslations("tools"),
        getDockerComposeFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeShells"), Icon: IconTerminal2 },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeHonest"), Icon: IconAlertTriangle },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("docker-compose.name"),
                    description: tTools("docker-compose.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("docker-compose")?.keywords,
                    faqs,
                })}
            />

            <div className="flex flex-col gap-10 lg:gap-12">
                <ToolPageHeader
                    toolId="docker-compose"
                    eyebrow={t("eyebrow")}
                    title={t("title")}
                    subtitle={t("subtitle")}
                    badges={badges}
                />

                <FadeIn delay={0.06}>
                    <Suspense fallback={<DockerComposeWorkbenchSkeleton />}>
                        <DockerComposeWorkbenchSection searchParams={searchParams} />
                    </Suspense>
                </FadeIn>

                <Reveal>
                    <DockerComposeArticle />
                </Reveal>

                <RelatedTools toolId="docker-compose" />
            </div>
        </>
    );
}

/**
 * The request-time half of the page: reads the URL options, so a shared link
 * opens on the input it carries. Everything around it is prerendered.
 */
async function DockerComposeWorkbenchSection({ searchParams }: { searchParams: SearchParams }) {
    const parsed = dockerComposeSearchParamsSchema.safeParse(await searchParams);
    const read = parsed.success ? parsed.data : {};
    const direction = read.direction ?? DEFAULT_DIRECTION;

    // Passed down rather than chosen in the island, so the first paint already
    // holds a converted example instead of an empty box.
    const input = read.input ?? (direction === "runToCompose" ? SAMPLE_RUN : SAMPLE_COMPOSE);

    return <DockerComposeWorkbench initialDirection={direction} initialInput={input} />;
}
