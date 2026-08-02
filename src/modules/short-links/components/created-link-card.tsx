"use client";

import { IconCircleCheck, IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { IconCopyButton } from "@/modules/tools/components/copy-button";
import type { ShortLinkCreatedView } from "../types";

type CreatedLinkCardProps = {
    link: ShortLinkCreatedView;
    onCopy: (value: string) => void;
};

/**
 * What a reader sees the moment a link exists, in either tool.
 *
 * The edit link still gets its own block rather than sitting beside the short
 * link as an equal: one is meant to be shared and the other is a credential,
 * and a layout that treats them alike is how somebody pastes the wrong one into
 * a group chat. The tone is a notice rather than an alarm, though — this
 * browser keeps a copy in the list below, so the reader is being informed, not
 * warned that they are about to lose something.
 */
export function CreatedLinkCard({ link, onCopy }: CreatedLinkCardProps) {
    const t = useTranslations("shortLinks.result");
    const [copied, setCopied] = useState<"short" | "edit" | null>(null);

    function copy(value: string, which: "short" | "edit") {
        onCopy(value);
        setCopied(which);
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-success)]/35 bg-[var(--color-success)]/8 p-3.5">
                <p className="flex items-center gap-1.5 text-[0.8125rem] leading-[1.3] font-medium text-[var(--color-success)]">
                    <IconCircleCheck className="size-4 shrink-0" stroke={1.9} aria-hidden="true" />
                    {t("shortUrlLabel")}
                </p>
                <div className="bg-background ring-border/70 flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 ring-inset">
                    <code className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]">
                        {link.shortUrl}
                    </code>
                    <IconCopyButton
                        copied={copied === "short"}
                        aria-label={t("copyShortUrl")}
                        onClick={() => copy(link.shortUrl, "short")}
                    />
                </div>
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {t("shortUrlHint")}
                </p>
            </div>

            <div className="ring-border/70 bg-card/60 flex flex-col gap-2 rounded-xl p-3.5 ring-1 ring-inset">
                <p className="text-muted-foreground flex items-start gap-1.5 text-[0.6875rem] leading-[1.4]">
                    <IconInfoCircle
                        className="text-primary mt-px size-3.5 shrink-0"
                        stroke={1.9}
                        aria-hidden="true"
                    />
                    <span>
                        <span className="text-foreground font-medium">{t("editUrlLabel")}</span>{" "}
                        {t("editUrlNote")}
                    </span>
                </p>
                <div className="bg-background ring-border/70 flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 ring-inset">
                    <code className="min-w-0 flex-1 truncate font-mono text-[0.75rem]">
                        {link.editUrl}
                    </code>
                    <IconCopyButton
                        copied={copied === "edit"}
                        aria-label={t("copyEditUrl")}
                        onClick={() => copy(link.editUrl, "edit")}
                    />
                </div>
            </div>
        </div>
    );
}
