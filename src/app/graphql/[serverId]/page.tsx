import { IconArrowLeft } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getServerDetail } from "@/modules/graphql-server/actions/servers";
import { ServerWorkbench } from "@/modules/graphql-server/components/server-workbench";

type PageProps = {
    params: Promise<{ serverId: string }>;
};

/**
 * A server's own page is **not indexable and carries no description**, and that
 * is deliberate rather than an omission. It is reachable only by whoever holds
 * the cookie, its title would be somebody's own name for their data, and a
 * crawler that reached it would get a 404 anyway — so the honest metadata is a
 * title and an explicit `noindex`.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("graphqlServer.meta");

    return {
        title: t("detailTitle"),
        robots: { index: false, follow: false },
    };
}

export default async function GraphqlServerDetailPage({ params }: PageProps) {
    const { serverId } = await params;
    const [t, detail] = await Promise.all([
        getTranslations("graphqlServer.workbench"),
        getServerDetail({ serverId }),
    ]);

    // `null` covers three cases — no such row, not owned by this browser, and no
    // database at all — and all three are one answer here. Distinguishing them
    // would tell whoever guessed an id which ids exist.
    if (detail === null) {
        notFound();
    }

    return (
        <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
            <FadeIn>
                <Link
                    href="/graphql"
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded-lg text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                    <IconArrowLeft className="size-3.5" stroke={1.9} aria-hidden="true" />
                    {t("back")}
                </Link>
            </FadeIn>

            <Reveal>
                <ServerWorkbench detail={detail} />
            </Reveal>
        </div>
    );
}
