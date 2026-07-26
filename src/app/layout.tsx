import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_Bengali } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/layout/providers";
import { SITE_URL } from "@/modules/seo/domain/site";
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
    const [t, tApp] = await Promise.all([getTranslations("overview.meta"), getTranslations("app")]);

    return {
        metadataBase: new URL(SITE_URL),
        title: {
            default: t("title"),
            template: `%s | ${tApp("name")}`,
        },
        description: t("description"),
        applicationName: tApp("name"),
        keywords: ["developer tools", "uuid generator", "online tools", "privacy first"],
        openGraph: {
            type: "website",
            siteName: tApp("name"),
            title: t("title"),
            description: t("description"),
            url: SITE_URL,
        },
        twitter: {
            card: "summary_large_image",
            title: t("title"),
            description: t("description"),
        },
        robots: {
            index: true,
            follow: true,
        },
    };
}

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
        { media: "(prefers-color-scheme: dark)", color: "#0c0d10" },
    ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

    // Only the strings the interactive shell actually renders. The long-form
    // article copy stays server-side instead of shipping in the RSC payload.
    const clientMessages = {
        common: messages.common,
        nav: messages.nav,
        theme: messages.theme,
        locale: messages.locale,
        uuid: {
            generator: messages.uuid.generator,
            versions: messages.uuid.versions,
            errors: messages.uuid.errors,
            toast: messages.uuid.toast,
        },
    };

    return (
        <html
            lang={locale}
            suppressHydrationWarning
            className={`${inter.variable} ${notoSansBengali.variable} ${jetBrainsMono.variable} h-full antialiased`}
        >
            <body className="min-h-full">
                <Providers>
                    <NextIntlClientProvider locale={locale} messages={clientMessages}>
                        <AppShell>{children}</AppShell>
                    </NextIntlClientProvider>
                </Providers>
            </body>
        </html>
    );
}
