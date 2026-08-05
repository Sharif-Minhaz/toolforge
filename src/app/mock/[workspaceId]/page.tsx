import {
    IconArrowLeft,
    IconArrowRight,
    IconHistory,
    IconVariable,
    IconFileImport,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { getServers } from "@/modules/mock-server/actions/servers";
import { getWorkspaceOverview } from "@/modules/mock-server/actions/workspaces";
import { ServerGrid } from "@/modules/mock-server/components/server-grid";
import { TOOL_ACCENT_VARS } from "@/modules/tools/components/tool-accent";
import { SITE_URL } from "@/modules/seo/domain/site";

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
    params: Promise<{ workspaceId: string }>;
};

export default async function WorkspacePage({ params }: WorkspacePageProps) {
    const [{ workspaceId }, t, tWorkspace, tLogs, tVars, tImport] = await Promise.all([
        params,
        getTranslations("mockServer.workspace"),
        getTranslations("mockServer.hero"),
        getTranslations("mockServer.logs"),
        getTranslations("mockServer.variables"),
        getTranslations("mockServer.import"),
    ]);

    // Both reads run the ownership gate themselves, so a workspace this browser
    // does not hold comes back empty rather than 403 — and the page says so
    // instead of rendering an editor over nothing.
    const [overview, servers] = await Promise.all([
        getWorkspaceOverview(),
        getServers(workspaceId),
    ]);

    const workspace = overview.workspaces.find((candidate) => candidate.id === workspaceId);

    // One row, one hue each, so the three are told apart by colour before they
    // are read. They were three stacked links, which is three lines of header
    // for what is a single row of chips.
    const shortcuts = [
        {
            href: `/mock/${workspaceId}/logs`,
            label: tLogs("title"),
            Icon: IconHistory,
            accent: "cyan",
        },
        {
            href: `/mock/${workspaceId}/environments`,
            label: tVars("title"),
            Icon: IconVariable,
            accent: "amber",
        },
        {
            href: `/mock/${workspaceId}/import`,
            label: tImport("title"),
            Icon: IconFileImport,
            accent: "emerald",
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

                    <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
                        {t("eyebrow")}
                    </p>
                    <h1 className="text-foreground text-2xl leading-[1.2] font-semibold text-balance sm:text-3xl">
                        {workspace?.name ?? tWorkspace("title")}
                    </h1>
                    <p className="text-muted-foreground max-w-[68ch] text-sm leading-relaxed">
                        {t("subtitle")}
                    </p>

                    <nav aria-label={t("shortcuts")} className="mt-1 flex flex-wrap gap-2">
                        {shortcuts.map(({ href, label, Icon, accent }) => (
                            <Link
                                key={href}
                                href={href}
                                className={cn(
                                    // The hue tints the icon, the border and the
                                    // hover wash — never the label. A brand hue
                                    // measures under 4.5:1 at this size on a light
                                    // card, which is the whole reason the syntax
                                    // set exists; the label stays `text-foreground`
                                    // and the colour stays decoration.
                                    "border-border/70 bg-card text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--tool-accent)]/50 hover:bg-[var(--tool-accent)]/8 focus-visible:ring-2 focus-visible:outline-none",
                                    TOOL_ACCENT_VARS[accent],
                                )}
                            >
                                <Icon
                                    className="size-3.5 shrink-0 text-[var(--tool-accent)]"
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
                    <ServerGrid workspaceId={workspaceId} servers={servers} origin={SITE_URL} />
                </Reveal>
            )}
        </div>
    );
}
