import {
    IconArrowRight,
    IconBinary,
    IconBolt,
    IconBraces,
    IconFileTypePdf,
    IconKey,
    IconTransform,
} from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { KEYCAP_ICON } from "@/modules/tools/components/tool-accent";
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
        },
        {
            key: "base64Decode",
            href: "/tools/base64?mode=decode",
            title: t("base64Decode.title"),
            description: t("base64Decode.description"),
            Icon: IconBinary,
        },
        {
            key: "jwtDecode",
            href: "/tools/jwt",
            title: t("jwtDecode.title"),
            description: t("jwtDecode.description"),
            Icon: IconKey,
        },
        {
            key: "jsonBeautify",
            href: "/tools/json",
            title: t("jsonBeautify.title"),
            description: t("jsonBeautify.description"),
            Icon: IconBraces,
        },
        {
            key: "faviconPack",
            href: "/tools/image-converter?target=favicon",
            title: t("faviconPack.title"),
            description: t("faviconPack.description"),
            Icon: IconTransform,
        },
        // The list is capped at six. The HTML / Markdown converter made way for
        // this one at popularity 85 against 86, being the lowest-popularity tool
        // that was represented here — the same trade the Background Remover made
        // for it, the text-case converter before that, the secret generator
        // before that, the passport-photo preset before that, RSA before that,
        // AES before that, and the Domain Inspector before that.
        //
        // The Image to 3D Model shipped without taking a slot, which
        // is the same rule reaching the opposite answer rather than an
        // oversight: at popularity 74 it is the lowest of the seven candidates,
        // so adding it and then dropping the lowest leaves this list where it
        // was. It reaches the front page through the featured and recent grids
        // instead. Raise its popularity when the traffic says so, and it takes
        // pdf-converter's place here. Text to Speech arrived at 70 and stayed
        // out for the same reason, as did the Mouse Tester at 72, the
        // Keyboard Tester at 73, Image to Text at 76, What Is My IP at 82, the
        // Number to Words converter at 76 and the Bijoy ↔ Unicode Converter at
        // 80.
        {
            key: "wordToPdf",
            href: "/tools/pdf-converter",
            title: t("wordToPdf.title"),
            description: t("wordToPdf.description"),
            Icon: IconFileTypePdf,
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
                            className={`group/action bg-card ring-border/70 hover:ring-border focus-visible:ring-ring relative flex h-full items-start gap-3 overflow-hidden rounded-2xl p-4 ring-1 transition duration-200 ring-inset focus-visible:ring-2 focus-visible:outline-none`}
                        >
                            <span
                                className={cn(
                                    KEYCAP_ICON,
                                    "group-hover/action:text-primary size-10",
                                )}
                            >
                                <action.Icon className="size-5" stroke={1.8} aria-hidden="true" />
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
