import { IconChevronRight, IconLock, IconShieldCheck, IconWorldOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getHashFaqEntries, HashArticle } from "@/modules/hash/components/hash-article";
import { HashWorkbench } from "@/modules/hash/components/hash-workbench";
import {
    DEFAULT_HASH_MODE,
    DEFAULT_HASH_OPTIONS,
    SAMPLE_INPUT,
} from "@/modules/hash/domain/constants";
import { createSaltSeed } from "@/modules/hash/domain/salt";
import type { HashOptions } from "@/modules/hash/types";
import { hashSearchParamsSchema } from "@/modules/hash/validation/hash-options";
import { JsonLd } from "@/modules/seo/components/json-ld";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";
import { buildToolJsonLd } from "@/modules/seo/domain/structured-data";
import { RelatedTools } from "@/modules/tools/components/related-tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

const TOOL_PATH = "/tools/hash";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("hash.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: TOOL_PATH,
        locale,
        keywords: getToolById("hash")?.keywords,
    });
}

type HashPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * A link may name a cost or a memory size that belongs to a different family
 * than the algorithm it also names. Carrying the value is harmless — the panel
 * for it is simply not rendered — so each field falls back to its default
 * rather than the whole link being rejected.
 */
function resolveOptions(parsed: ReturnType<typeof hashSearchParamsSchema.safeParse>): HashOptions {
    if (!parsed.success) {
        return DEFAULT_HASH_OPTIONS;
    }

    return {
        ...DEFAULT_HASH_OPTIONS,
        algorithm: parsed.data.algorithm ?? DEFAULT_HASH_OPTIONS.algorithm,
        encoding: parsed.data.encoding ?? DEFAULT_HASH_OPTIONS.encoding,
        bcryptCost: parsed.data.cost ?? DEFAULT_HASH_OPTIONS.bcryptCost,
        argon2Memory: parsed.data.memory ?? DEFAULT_HASH_OPTIONS.argon2Memory,
        argon2Iterations: parsed.data.iterations ?? DEFAULT_HASH_OPTIONS.argon2Iterations,
    };
}

export default async function HashToolPage({ searchParams }: HashPageProps) {
    const parsed = hashSearchParamsSchema.safeParse(await searchParams);
    const mode = (parsed.success ? parsed.data.mode : undefined) ?? DEFAULT_HASH_MODE;
    const options = resolveOptions(parsed);

    // Salts are random. Drawing one here and handing it down as a prop keeps the
    // server pass and the first client render in agreement; a `useState`
    // initialiser would produce two different salts and break hydration.
    const saltSeed = createSaltSeed();

    const [t, tTools, tNav, faqs, locale] = await Promise.all([
        getTranslations("hash.hero"),
        getTranslations("tools"),
        getTranslations("nav"),
        getHashFaqEntries(),
        getLocale(),
    ]);

    const badges = [
        { label: t("badgeAlgorithms"), Icon: IconShieldCheck },
        { label: t("badgeOffline"), Icon: IconWorldOff },
        { label: t("badgePasswords"), Icon: IconLock },
    ];

    return (
        <>
            <JsonLd
                data={buildToolJsonLd({
                    name: tTools("hash.name"),
                    description: tTools("hash.description"),
                    path: TOOL_PATH,
                    locale,
                    keywords: getToolById("hash")?.keywords,
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
                    <HashWorkbench
                        initialMode={mode}
                        initialOptions={options}
                        initialText={SAMPLE_INPUT}
                        initialSaltSeed={saltSeed}
                    />
                </FadeIn>

                <Reveal>
                    <HashArticle />
                </Reveal>

                <RelatedTools toolId="hash" />
            </div>
        </>
    );
}
