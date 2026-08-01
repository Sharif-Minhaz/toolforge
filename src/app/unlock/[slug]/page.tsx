import { IconLock } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FadeIn } from "@/components/motion/reveal";
import { LinkStateNotice } from "@/modules/short-links/components/link-state-notice";
import { UnlockForm } from "@/modules/short-links/components/unlock-form";
import { SHORTENER_REDIRECT_PREFIX } from "@/modules/short-links/domain/constants";
import { resolveShortLink } from "@/modules/short-links/repository/resolve";

/**
 * The gate in front of a password-protected short link.
 *
 * A page rather than a Route Handler, because unlike the redirect itself this
 * one does have something to render. It learns only whether the link is gated —
 * the destination stays on the server until the action hands it over.
 */

/** The answer depends on a window that may have closed a second ago. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("shortLinks.unlock");

    return {
        title: t("metaTitle"),
        description: t("metaDescription"),
        // Nothing about a private link belongs in an index, and the slug in the
        // path is the whole address.
        robots: { index: false, follow: false, nocache: true },
    };
}

export default async function UnlockPage({ params }: { params: Promise<{ slug: string }> }) {
    const [t, { slug }] = await Promise.all([getTranslations("shortLinks.unlock"), params]);

    const decision = await resolveShortLink(slug);

    // The password was removed while this gate was being opened. Hand the
    // visitor back to the redirect, which will now send them straight through.
    if (decision.kind === "redirect") {
        redirect(`${SHORTENER_REDIRECT_PREFIX}/${slug}`);
    }

    return (
        // Vertical centring and page padding belong to the standalone shell
        // frame; this only decides how wide the gate is.
        <div className="flex w-full max-w-md flex-col gap-6">
            {decision.kind === "password" ? (
                <FadeIn className="bg-card ring-border/70 flex flex-col gap-5 rounded-2xl p-6 ring-1 ring-inset sm:p-7">
                    <div className="flex flex-col gap-2">
                        <span className="bg-primary/12 text-primary flex size-9 items-center justify-center rounded-xl">
                            <IconLock className="size-4.5" stroke={1.8} aria-hidden="true" />
                        </span>
                        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
                        <p className="text-muted-foreground text-[0.875rem] leading-relaxed">
                            {t("description")}
                        </p>
                    </div>

                    <UnlockForm slug={slug} />
                </FadeIn>
            ) : (
                <FadeIn className="flex flex-col gap-4">
                    <LinkStateNotice state={decision.kind} />
                    <Link
                        href="/tools/shortener"
                        className="text-primary hover:text-primary/80 focus-visible:ring-ring w-fit rounded text-[0.8125rem] font-medium focus-visible:ring-2 focus-visible:outline-none"
                    >
                        {t("backToTool")}
                    </Link>
                </FadeIn>
            )}
        </div>
    );
}
