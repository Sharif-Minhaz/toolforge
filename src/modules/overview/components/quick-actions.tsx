import {
    IconArrowRight,
    IconBinary,
    IconBolt,
    IconBraces,
    IconKey,
    IconStack2,
    IconTextScan2,
} from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "./section-heading";

export async function QuickActions() {
    const t = await getTranslations("overview.quickActions");

    const actions = [
        {
            key: "uuidSingle",
            href: "/tools/uuid",
            title: t("uuidSingle.title"),
            description: t("uuidSingle.description"),
            Icon: IconBolt,
            accent: "[--tool-accent:var(--brand-violet)]",
        },
        {
            key: "uuidBulk",
            href: "/tools/uuid?quantity=100",
            title: t("uuidBulk.title"),
            description: t("uuidBulk.description"),
            Icon: IconStack2,
            accent: "[--tool-accent:var(--brand-cyan)]",
        },
        {
            key: "base64Decode",
            href: "/tools/base64?mode=decode",
            title: t("base64Decode.title"),
            description: t("base64Decode.description"),
            Icon: IconBinary,
            accent: "[--tool-accent:var(--brand-emerald)]",
        },
        {
            key: "jwtDecode",
            href: "/tools/jwt",
            title: t("jwtDecode.title"),
            description: t("jwtDecode.description"),
            Icon: IconKey,
            accent: "[--tool-accent:var(--brand-rose)]",
        },
        {
            key: "jsonBeautify",
            href: "/tools/json",
            title: t("jsonBeautify.title"),
            description: t("jsonBeautify.description"),
            Icon: IconBraces,
            accent: "[--tool-accent:var(--brand-violet)]",
        },
        {
            key: "aiTextDetector",
            href: "/tools/ai-text-detector",
            title: t("aiTextDetector.title"),
            description: t("aiTextDetector.description"),
            Icon: IconTextScan2,
            accent: "[--tool-accent:var(--brand-amber)]",
        },
    ];

    return (
        <section className="flex flex-col gap-4">
            <SectionHeading title={t("title")} description={t("description")} />

            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {actions.map((action, index) => (
                    <Reveal key={action.key} as="li" delay={staggerDelay(index)} className="h-full">
                        <Link
                            href={action.href}
                            className={`group/action bg-card ring-border/70 hover:ring-border focus-visible:ring-ring relative flex h-full items-start gap-3 overflow-hidden rounded-2xl p-4 ring-1 transition-all duration-200 ring-inset hover:-translate-y-0.5 hover:shadow-[0_8px_28px_-14px_oklch(0_0_0/0.35)] focus-visible:ring-2 focus-visible:outline-none ${action.accent}`}
                        >
                            <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_oklch,var(--tool-accent)_16%,transparent),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover/action:opacity-100"
                            />
                            <span className="relative grid size-9 shrink-0 place-items-center rounded-[0.6rem] bg-[color-mix(in_oklch,var(--tool-accent)_13%,transparent)] text-[--tool-accent] ring-1 ring-[color-mix(in_oklch,var(--tool-accent)_20%,transparent)] ring-inset">
                                <action.Icon className="size-4.5" stroke={1.8} aria-hidden="true" />
                            </span>
                            <span className="relative flex min-w-0 flex-1 flex-col gap-1">
                                <span className="text-[0.9375rem] font-medium tracking-tight">
                                    {action.title}
                                </span>
                                <span className="text-muted-foreground text-[0.8125rem] leading-relaxed">
                                    {action.description}
                                </span>
                            </span>
                            <IconArrowRight
                                className="text-muted-foreground relative mt-1 size-4 shrink-0 transition-transform duration-200 group-hover/action:translate-x-0.5"
                                stroke={1.9}
                                aria-hidden="true"
                            />
                        </Link>
                    </Reveal>
                ))}
            </ul>
        </section>
    );
}
