import { IconChevronRight, IconShieldCheck, IconSparkles, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { getToolById } from "@/modules/tools/domain/tool-catalog";
import { DEFAULT_UUID_QUANTITY, DEFAULT_UUID_VERSION } from "@/modules/uuid/domain/constants";
import { generateUuids } from "@/modules/uuid/domain/generate";
import { getUuidFaqEntries, UuidArticle } from "@/modules/uuid/components/uuid-article";
import { UuidWorkbench } from "@/modules/uuid/components/uuid-workbench";
import { uuidSearchParamsSchema } from "@/modules/uuid/validation/generation-options";

const TOOL_PATH = "/tools/uuid";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("uuid.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("uuid")?.keywords,
    });
}

type UuidPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UuidToolPage({ searchParams }: UuidPageProps) {
    const [t, tTools, tNav, faqs, locale, params] = await Promise.all([
        getTranslations("uuid.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getUuidFaqEntries(),
        getLocale(),
        searchParams,
    ]);

    const parsed = uuidSearchParamsSchema.safeParse(params);
    const version = (parsed.success ? parsed.data.version : undefined) ?? DEFAULT_UUID_VERSION;
    const quantity = (parsed.success ? parsed.data.quantity : undefined) ?? DEFAULT_UUID_QUANTITY;

    // Generated on the server so the very first paint already carries a result
    // and hydration has nothing to reconcile.
    const initialUuids = generateUuids({ version, quantity });

    const badges = [
        { label: t("badgeRfc"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgeCrypto"), Icon: IconSparkles },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("uuid.name"),
                    description: tTools("uuid.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("uuid")?.keywords,
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
                    <UuidWorkbench
                        initialUuids={initialUuids}
                        initialVersion={version}
                        initialQuantity={quantity}
                    />
                </FadeIn>

                <Reveal>
                    <UuidArticle />
                </Reveal>
            </div>
        </>
    );
}
