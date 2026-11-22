import { IconChevronRight } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

import { FadeIn } from "@/components/motion/reveal";
import { SITE_URL } from "@/modules/seo/domain/site";
import { isValidEditToken } from "@/modules/short-links/domain/slug";
import { linkBases } from "@/modules/short-links/domain/target";
import { toLinkView } from "@/modules/short-links/domain/view";
import { findShortLinkByEditToken } from "@/modules/short-links/repository/links";
import { ShortLinkEditor } from "@/modules/shortener/components/short-link-editor";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";

/**
 * The page whoever created a short link keeps. The token in the path is the
 * credential, which is why nothing here may be indexed, cached, or linked to.
 */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const t = await getTranslations("shortener.edit");

    return {
        title: t("metaTitle"),
        description: t("metaDescription"),
        robots: { index: false, follow: false, nocache: true },
    };
}

type EditPageProps = {
    params: Promise<{ locale: string; token: string }>;
};

export default async function ShortLinkEditPage({ params }: EditPageProps) {
    await enterLocale(params);
    const [t, tNav, { token }, requestHeaders] = await Promise.all([
        getTranslations("shortener.edit"),
        getTranslations("nav"),
        params,
        headers(),
    ]);
    const bases = linkBases("shortener", SITE_URL, requestHeaders.get("host"));

    // Checked before the query, so a mangled link never reaches the database.
    const found = isValidEditToken(token)
        ? await findShortLinkByEditToken(token)
        : ({ ok: false, reason: "not_found" } as const);

    return (
        <div className="flex flex-col gap-8">
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
                        <li>
                            <Link
                                href="/tools/shortener"
                                className="hover:text-foreground focus-visible:ring-ring rounded transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
                            >
                                {t("breadcrumb")}
                            </Link>
                        </li>
                        <li aria-hidden="true">
                            <IconChevronRight className="size-3.5" stroke={2} />
                        </li>
                        <li className="text-foreground">{t("eyebrow")}</li>
                    </ol>
                </nav>

                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
            </FadeIn>

            <FadeIn delay={0.06}>
                {found.ok ? (
                    <ShortLinkEditor
                        editToken={token}
                        editUrl={`${bases.edit}/${token}`}
                        link={toLinkView(found.value, bases.redirect)}
                    />
                ) : (
                    <div className="bg-card ring-border/70 flex flex-col gap-3 rounded-xl p-5 ring-1 ring-inset sm:p-6">
                        <p className="text-[0.9375rem] font-medium">
                            {found.reason === "not_configured"
                                ? t("notConfiguredTitle")
                                : t("notFoundTitle")}
                        </p>
                        <p className="text-muted-foreground max-w-[60ch] text-[0.8125rem] leading-relaxed">
                            {found.reason === "not_configured"
                                ? t("notConfiguredBody")
                                : t("notFoundBody")}
                        </p>
                        <Link
                            href="/tools/shortener"
                            className="text-primary hover:text-primary/80 focus-visible:ring-ring w-fit rounded text-[0.8125rem] font-medium focus-visible:ring-2 focus-visible:outline-none"
                        >
                            {t("backToTool")}
                        </Link>
                    </div>
                )}
            </FadeIn>
        </div>
    );
}
