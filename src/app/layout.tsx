import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_Bengali } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/layout/providers";
import { AnalyticsConsentBanner } from "@/modules/analytics/components/analytics-consent-banner";
import { AnalyticsScripts } from "@/modules/analytics/components/analytics-scripts";
import { getAnalyticsState } from "@/modules/analytics/presenters/analytics-state";
import { buildPageMetadata, SITE_ATTRIBUTION } from "@/modules/seo/domain/metadata";
import { SITE_REPOSITORY, SITE_URL } from "@/modules/seo/domain/site";
import { getToolKeywords } from "@/modules/tools/domain/tool-catalog";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

// Inter carries no Bengali glyphs; this sits directly behind it in the stack so
// the Bangla locale keeps the same optical weight instead of falling back to
// whatever the operating system happens to ship.
const notoSansBengali = Noto_Sans_Bengali({
    subsets: ["bengali"],
    variable: "--font-bengali",
    display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-jetbrains-mono",
    display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
    const [t, tApp, locale] = await Promise.all([
        getTranslations("overview.meta"),
        getTranslations("app"),
        getLocale(),
    ]);

    const shared = buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: "/",
        locale,
        keywords: getToolKeywords(),
    });

    return {
        ...shared,
        ...SITE_ATTRIBUTION,
        metadataBase: new URL(SITE_URL),
        // Child pages set a bare title; the template appends the brand so every
        // tab and every search result reads "<tool> | ToolForge".
        title: {
            default: t("title"),
            template: `%s | ${tApp("name")}`,
        },
        applicationName: tApp("name"),
        referrer: "origin-when-cross-origin",
        // Stops iOS Safari turning version numbers and ids into phone links.
        formatDetection: { telephone: false, address: false, email: false },
        robots: {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                "max-image-preview": "large",
                "max-snippet": -1,
                "max-video-preview": -1,
            },
        },
        other: { "github:repository": SITE_REPOSITORY },
    };
}

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
        { media: "(prefers-color-scheme: dark)", color: "#0c0d10" },
    ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    const [locale, messages, analytics] = await Promise.all([
        getLocale(),
        getMessages(),
        getAnalyticsState(),
    ]);

    // Only the strings the interactive shell actually renders. The long-form
    // article copy stays server-side instead of shipping in the RSC payload.
    const clientMessages = {
        common: messages.common,
        nav: messages.nav,
        theme: messages.theme,
        locale: messages.locale,
        units: messages.units,
        analytics: messages.analytics,
        uuid: {
            generator: messages.uuid.generator,
            versions: messages.uuid.versions,
            errors: messages.uuid.errors,
            toast: messages.uuid.toast,
        },
        base64: {
            workbench: messages.base64.workbench,
            errors: messages.base64.errors,
            toast: messages.base64.toast,
        },
        jwt: {
            workbench: messages.jwt.workbench,
            claims: messages.jwt.claims,
            headerParams: messages.jwt.headerParams,
            timeStates: messages.jwt.timeStates,
            findings: messages.jwt.findings,
            errors: messages.jwt.errors,
            toast: messages.jwt.toast,
        },
        hash: {
            workbench: messages.hash.workbench,
            errors: messages.hash.errors,
            toast: messages.hash.toast,
        },
        json: {
            workbench: messages.json.workbench,
            report: messages.json.report,
            errors: messages.json.errors,
            toast: messages.json.toast,
        },
        url: {
            workbench: messages.url.workbench,
            errors: messages.url.errors,
            toast: messages.url.toast,
        },
    };

    return (
        <html
            lang={locale}
            suppressHydrationWarning
            className={`${inter.variable} ${notoSansBengali.variable} ${jetBrainsMono.variable} h-full antialiased`}
        >
            <body className="min-h-full" suppressHydrationWarning>
                <Providers>
                    <NextIntlClientProvider locale={locale} messages={clientMessages}>
                        <AppShell>{children}</AppShell>
                        {analytics.isConsentPending ? <AnalyticsConsentBanner /> : null}
                    </NextIntlClientProvider>
                </Providers>
            </body>
            <AnalyticsScripts measurementId={analytics.measurementId} />
        </html>
    );
}
