import { IconArrowLeft } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getServerDetail } from "@/modules/mock-server/actions/servers";
import { EndpointWorkbench } from "@/modules/mock-server/components/endpoint-workbench";
import { MockUrl } from "@/modules/mock-server/components/mock-url";
import { ServerPausePanel } from "@/modules/mock-server/components/server-pause-panel";
import { SITE_URL } from "@/modules/seo/domain/site";

/** Same reasoning as the workspace page: this is somebody's work, not content. */
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

type ServerPageProps = {
    params: Promise<{ workspaceId: string; serverId: string }>;
};

export default async function ServerPage({ params }: ServerPageProps) {
    const [{ workspaceId, serverId }, t, tEndpoints] = await Promise.all([
        params,
        getTranslations("mockServer.workspace"),
        getTranslations("mockServer.endpoints"),
    ]);

    const server = await getServerDetail(workspaceId, serverId);

    if (server === null) {
        return (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
                <Link
                    href={`/mock/${workspaceId}`}
                    className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-xs transition-colors"
                >
                    <IconArrowLeft className="size-3.5" aria-hidden="true" />
                    {t("back")}
                </Link>
                <p className="border-border/70 text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm leading-relaxed">
                    {t("notFound")}
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <FadeIn>
                <header className="flex flex-col gap-3">
                    <Link
                        href={`/mock/${workspaceId}`}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded-lg text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <IconArrowLeft className="size-3.5" aria-hidden="true" />
                        {t("back")}
                    </Link>

                    <h1 className="text-foreground text-2xl leading-[1.2] font-semibold text-balance sm:text-3xl">
                        {server.name}
                    </h1>

                    <MockUrl origin={SITE_URL} serverKey={server.key} className="max-w-2xl" />

                    <p className="text-muted-foreground max-w-[68ch] text-xs leading-relaxed">
                        {tEndpoints("pathHelp")}
                    </p>
                </header>
            </FadeIn>

            {/* Above the route list, not below it: somebody whose calls have
                started failing needs to see that the server is off before they
                start reading routes for the mistake. */}
            <Reveal>
                <ServerPausePanel serverId={server.id} isPaused={server.isPaused} />
            </Reveal>

            <Reveal>
                <EndpointWorkbench
                    serverId={server.id}
                    serverKey={server.key}
                    origin={SITE_URL}
                    endpoints={server.endpoints}
                />
            </Reveal>
        </div>
    );
}
