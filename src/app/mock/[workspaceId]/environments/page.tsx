import { IconArrowLeft } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getServers } from "@/modules/mock-server/actions/servers";
import { getVariables } from "@/modules/mock-server/actions/variables";
import { VariableTable } from "@/modules/mock-server/components/variable-table";

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

type EnvironmentsPageProps = {
    params: Promise<{ workspaceId: string }>;
};

export default async function EnvironmentsPage({ params }: EnvironmentsPageProps) {
    const [{ workspaceId }, t, tWorkspace] = await Promise.all([
        params,
        getTranslations("mockServer.variables"),
        getTranslations("mockServer.workspace"),
    ]);

    const [view, servers] = await Promise.all([getVariables(workspaceId), getServers(workspaceId)]);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <FadeIn>
                <header className="flex flex-col gap-3">
                    <Link
                        href={`/mock/${workspaceId}`}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded-lg text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <IconArrowLeft className="size-3.5" aria-hidden="true" />
                        {tWorkspace("back")}
                    </Link>

                    <h1 className="text-foreground text-2xl leading-[1.2] font-semibold text-balance sm:text-3xl">
                        {t("title")}
                    </h1>
                    <p className="text-muted-foreground max-w-[68ch] text-sm leading-relaxed">
                        {t("subtitle")}
                    </p>
                </header>
            </FadeIn>

            <Reveal>
                <VariableTable
                    workspaceId={workspaceId}
                    servers={servers}
                    initial={view.variables}
                    environments={view.environments}
                />
            </Reveal>
        </div>
    );
}
