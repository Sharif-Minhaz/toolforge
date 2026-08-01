import { IconChevronRight } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn } from "@/components/motion/reveal";
import { DynamicQrEditor } from "@/modules/qr/components/dynamic-qr-editor";
import { toLinkView } from "@/modules/qr/domain/dynamic-view";
import { isValidEditToken } from "@/modules/qr/domain/short-code";
import { findQrLinkByEditToken } from "@/modules/qr/repository/qr-links";
import { SITE_URL } from "@/modules/seo/domain/site";

/**
 * The page whoever created a dynamic code keeps. The token in the path is the
 * credential, which is why nothing here may be indexed, cached, or linked to.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("qr.edit");

    return {
        title: t("metaTitle"),
        description: t("metaDescription"),
        robots: { index: false, follow: false, nocache: true },
    };
}

type EditPageProps = {
    params: Promise<{ token: string }>;
};

export default async function DynamicQrEditPage({ params }: EditPageProps) {
    const [t, tNav, { token }] = await Promise.all([
        getTranslations("qr.edit"),
        getTranslations("nav"),
        params,
    ]);

    // Checked before the query, so a mangled link never reaches the database.
    const found = isValidEditToken(token)
        ? await findQrLinkByEditToken(token)
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
                                href="/tools/qr"
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
                    <DynamicQrEditor editToken={token} link={toLinkView(found.value, SITE_URL)} />
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
                            href="/tools/qr"
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
