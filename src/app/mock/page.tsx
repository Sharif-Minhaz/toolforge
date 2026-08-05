import { IconCloudUpload, IconKey, IconServer2, IconShieldLock } from "@tabler/icons-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FadeIn, Reveal } from "@/components/motion/reveal";
import { getWorkspaceOverview } from "@/modules/mock-server/actions/workspaces";
import { WorkspaceLauncher } from "@/modules/mock-server/components/workspace-launcher";
import { buildPageMetadata } from "@/modules/seo/domain/metadata";

const SECTION_PATH = "/mock";

export async function generateMetadata(): Promise<Metadata> {
    const [t, locale] = await Promise.all([getTranslations("mockServer.meta"), getLocale()]);

    return buildPageMetadata({
        title: t("title"),
        description: t("description"),
        path: SECTION_PATH,
        locale,
        keywords: ["mock api", "mock server", "api mocking", "fake api", "rest mock", "stub api"],
    });
}

/**
 * The way in to the studio.
 *
 * Everything interactive is one island. The disclosure — this is the one part
 * of the site that does not run in your browser — is a server component, so it
 * never depends on JavaScript arriving. It sits *below* the launcher rather
 * than above it: the three badges in the header already carry the short form of
 * the same claim, and a full panel between the reader and the create form was
 * costing more space than the warning was buying. What it must not become is
 * optional, which is why it is plain page copy rather than a collapsed panel.
 */
export default async function MockStudioPage() {
    const [t, overview] = await Promise.all([
        getTranslations("mockServer.hero"),
        getWorkspaceOverview(),
    ]);

    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_KEY ?? null;

    const badges = [
        { label: t("badgeNoAccount"), Icon: IconServer2 },
        { label: t("badgeRecovery"), Icon: IconKey },
        { label: t("badgeThree"), Icon: IconShieldLock },
    ];

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
            <FadeIn>
                <header className="flex flex-col gap-3">
                    <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
                        {t("eyebrow")}
                    </p>
                    <h1 className="text-foreground text-2xl leading-[1.2] font-semibold text-balance sm:text-3xl">
                        {t("title")}
                    </h1>
                    <p className="text-muted-foreground max-w-[68ch] text-sm leading-relaxed">
                        {t("subtitle")}
                    </p>

                    <ul className="mt-1 flex flex-wrap gap-2">
                        {badges.map(({ label, Icon }) => (
                            <li
                                key={label}
                                className="border-border/70 bg-card text-muted-foreground flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.6875rem] leading-[1.3]"
                            >
                                <Icon
                                    className="size-3.5 shrink-0"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                                {label}
                            </li>
                        ))}
                    </ul>
                </header>
            </FadeIn>
            <Reveal>
                <WorkspaceLauncher overview={overview} turnstileSiteKey={turnstileSiteKey} />
            </Reveal>

            <Reveal>
                <section
                    aria-labelledby="disclosure-heading"
                    className="border-border/70 bg-muted/30 rounded-2xl border p-4"
                >
                    <h2
                        id="disclosure-heading"
                        className="text-foreground flex items-center gap-2 text-xs leading-[1.3] font-semibold"
                    >
                        <IconCloudUpload
                            className="text-muted-foreground size-4 shrink-0"
                            stroke={1.75}
                            aria-hidden="true"
                        />
                        {t("disclosureTitle")}
                    </h2>
                    <p className="text-muted-foreground mt-1.5 max-w-[68ch] text-xs leading-relaxed">
                        {t("disclosureBody")}
                    </p>
                </section>
            </Reveal>
        </div>
    );
}
