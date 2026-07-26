import { IconCurrencyDollarOff, IconEyeOff, IconShieldLock, IconTool } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";

import { Reveal } from "@/components/motion/reveal";
import { getToolCatalogStats } from "@/modules/tools/domain/tool-catalog";

export async function StatGrid() {
    const t = await getTranslations("overview.stats");
    const stats = getToolCatalogStats();

    const tiles = [
        {
            key: "clientSide",
            value: t("clientSide.value"),
            label: t("clientSide.label"),
            hint: t("clientSide.hint"),
            Icon: IconShieldLock,
        },
        {
            key: "tracking",
            value: t("tracking.value"),
            label: t("tracking.label"),
            hint: t("tracking.hint"),
            Icon: IconEyeOff,
        },
        {
            key: "tools",
            value: t("tools.value", { count: stats.available }),
            label: t("tools.label"),
            hint: t("tools.hint", { planned: stats.planned }),
            Icon: IconTool,
        },
        {
            key: "cost",
            value: t("cost.value"),
            label: t("cost.label"),
            hint: t("cost.hint"),
            Icon: IconCurrencyDollarOff,
        },
    ];

    return (
        <section aria-label={t("title")}>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {tiles.map((tile, index) => (
                    <Reveal key={tile.key} delay={index * 0.04}>
                        <li className="bg-card ring-border/70 flex h-full flex-col gap-1 rounded-2xl p-4 ring-1 ring-inset">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-2xl font-semibold tracking-tight tabular-nums">
                                    {tile.value}
                                </span>
                                <tile.Icon
                                    className="text-muted-foreground/70 size-4"
                                    stroke={1.7}
                                    aria-hidden="true"
                                />
                            </div>
                            <span className="text-[0.8125rem] font-medium">{tile.label}</span>
                            <span className="text-muted-foreground text-xs leading-relaxed">
                                {tile.hint}
                            </span>
                        </li>
                    </Reveal>
                ))}
            </ul>
        </section>
    );
}
