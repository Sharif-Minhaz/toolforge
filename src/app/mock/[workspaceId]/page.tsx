import { IconArrowLeft } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getServers } from "@/modules/mock-server/actions/servers";
import { getWorkspaceOverview } from "@/modules/mock-server/actions/workspaces";
import { ServerGrid } from "@/modules/mock-server/components/server-grid";
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
    const [{ workspaceId }, t, tWorkspace] = await Promise.all([
        params,
        getTranslations("mockServer.workspace"),
        getTranslations("mockServer.hero"),
    ]);

    // Both reads run the ownership gate themselves, so a workspace this browser
    // does not hold comes back empty rather than 403 — and the page says so
    // instead of rendering an editor over nothing.
    const [overview, servers] = await Promise.all([
        getWorkspaceOverview(),
        getServers(workspaceId),
    ]);

    const workspace = overview.workspaces.find((candidate) => candidate.id === workspaceId);

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
