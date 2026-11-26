import {
    IconArrowLeft,
    IconArrowRight,
    IconHistory,
    IconVariable,
    IconFileImport,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getServers } from "@/modules/mock-server/actions/servers";
import { getWorkspaceOverview } from "@/modules/mock-server/actions/workspaces";
import { ServerGrid } from "@/modules/mock-server/components/server-grid";
import { MOCK_SERVICE } from "@/modules/mock-server/domain/constants";
import { SITE_URL } from "@/modules/seo/domain/site";
import { serviceBase } from "@/modules/tools/domain/service-hosts";
import { enterLocale } from "@/i18n/route-locale";

/**
 * One workspace's servers.
 *
 * `noindex`: a workspace id is a handle to somebody's work, and while owning it
 * still requires the cookie, an indexed URL is an invitation to try. The public
 * thing here is the mock endpoint, not the studio page in front of it.
 */
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

type WorkspacePageProps = {
    params: Promise<{ locale: string; workspaceId: string }>;
};

export default async function WorkspacePage({ params }: WorkspacePageProps) {
    await enterLocale(params);
    const [{ workspaceId }, t, tWorkspace, tLogs, tVars, tImport, requestHeaders] =
        await Promise.all([
            params,
            getTranslations("mockServer.workspace"),
            getTranslations("mockServer.hero"),
            getTranslations("mockServer.logs"),
            getTranslations("mockServer.variables"),
            getTranslations("mockServer.import"),
            headers(),
        ]);

    // Both reads run the ownership gate themselves, so a workspace this browser
    // does not hold comes back empty rather than 403 — and the page says so
    // instead of rendering an editor over nothing.
    const [overview, servers] = await Promise.all([
        getWorkspaceOverview(),
        getServers(workspaceId),
    ]);

    const workspace = overview.workspaces.find((candidate) => candidate.id === workspaceId);

    // One row of chips, told apart by icon and label. They were three stacked
    // links, which is three lines of header for what is a single row.
    const shortcuts = [
        {
            href: `/mock/${workspaceId}/logs`,
            label: tLogs("title"),
            Icon: IconHistory,
        },
        {
            href: `/mock/${workspaceId}/environments`,
            label: tVars("title"),
            Icon: IconVariable,
        },
        {
            href: `/mock/${workspaceId}/import`,
            label: tImport("title"),
            Icon: IconFileImport,
        },
    ] as const;

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <FadeIn>
                <header className="flex flex-col gap-3">
                    <Link
                        href="/mock"
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded-lg text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <IconArrowLeft className="size-3.5" aria-hidden="true" />
                        {t("back")}
                    </Link>

                    <p className="text-muted-foreground text-xs font-medium">{t("eyebrow")}</p>
                    <h1 className="text-foreground text-2xl leading-[1.2] font-semibold text-balance sm:text-3xl">
                        {workspace?.name ?? tWorkspace("title")}
                    </h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">{t("subtitle")}</p>

                    <nav aria-label={t("shortcuts")} className="mt-1 flex flex-wrap gap-2">
                        {shortcuts.map(({ href, label, Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                className="border-border/70 bg-card text-foreground focus-visible:ring-ring hover:border-border hover:bg-muted/40 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                            >
                                <Icon
                                    className="text-muted-foreground size-3.5 shrink-0"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {label}
                                <IconArrowRight
                                    className="text-muted-foreground size-3.5 shrink-0"
                                    aria-hidden="true"
                                />
                            </Link>
                        ))}
                    </nav>
                </header>
            </FadeIn>

            {workspace === undefined ? (
                <Reveal>
                    <p className="border-border/70 text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm leading-relaxed">
                        {t("notFound")}
                        <span className="text-muted-foreground/70 mt-1 block text-xs">
                            {t("notFoundHint")}
                        </span>
                    </p>
                </Reveal>
            ) : (
                <Reveal>
                    <ServerGrid
                        workspaceId={workspaceId}
                        servers={servers}
                        base={serviceBase(MOCK_SERVICE, SITE_URL, requestHeaders.get("host"))}
                    />
                </Reveal>
            )}
        </div>
    );
}
