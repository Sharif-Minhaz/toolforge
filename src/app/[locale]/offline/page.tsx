import { IconArrowLeft, IconWifiOff } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { enterLocale, type LocaleParams } from "@/i18n/route-locale";
import { cn } from "@/lib/utils";

/**
 * What the service worker answers an offline navigation with when the page is
 * not one it keeps — a tool that needs the server. Precached on install for
 * every visitor; never indexed.
 */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
    await enterLocale(params);
    const t = await getTranslations("pwa.offline.meta");

    return { title: t("title"), description: t("description"), robots: { index: false } };
}

export default async function OfflinePage({ params }: { params: LocaleParams }) {
    await enterLocale(params);
    const t = await getTranslations("pwa.offline");

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
            <p className="text-primary inline-flex items-center gap-1.5 text-sm font-medium">
                <IconWifiOff className="size-4" stroke={1.9} aria-hidden="true" />
                {t("eyebrow")}
            </p>
            <h1 className="max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("title")}
            </h1>
            <p className="text-muted-foreground max-w-md text-[0.9375rem] leading-7">
                {t("description")}
            </p>
            <Link href="/" className={cn(buttonVariants(), "h-10 px-4")}>
                <IconArrowLeft className="size-4" stroke={1.9} aria-hidden="true" />
                {t("cta")}
            </Link>
        </div>
    );
}
