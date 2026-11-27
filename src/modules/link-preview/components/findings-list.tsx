"use client";

import {
    IconAlertTriangle,
    IconCircleCheck,
    IconCircleX,
    IconInfoCircle,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useByteLabel } from "@/modules/tools/components/byte-size";

import type { PreviewPlatform } from "../domain/platforms";
import type { Finding, FindingSeverity, ImageProbeFailure } from "../types";

/**
 * The findings, worst first, each as a sentence.
 *
 * Severity is carried by an icon *and* a word, never by colour alone. A
 * finding that rests on a community measurement rather than a platform's own
 * documentation says so in its own line, because "WhatsApp refuses this" and
 * "people report WhatsApp refuses this" are different things to act on.
 */

const ICONS = {
    error: IconCircleX,
    warning: IconAlertTriangle,
    info: IconInfoCircle,
} as const;

const TONES: Readonly<Record<FindingSeverity, string>> = {
    error: "text-destructive",
    warning: "text-brand-amber",
    info: "text-muted-foreground",
};

/** The `values` keys that hold a byte count, formatted rather than printed raw. */
const BYTE_VALUES = ["bytes", "limit"] as const;

type FindingsListProps = {
    findings: readonly Finding[];
    platformName: (platform: PreviewPlatform) => string;
};

export function FindingsList({ findings, platformName }: FindingsListProps) {
    const t = useTranslations("linkPreview.workbench");
    const tFindings = useTranslations("linkPreview.findings");
    const tSeverity = useTranslations("linkPreview.severity");
    const tImage = useTranslations("linkPreview.imageFailures");
    const tSources = useTranslations("linkPreview.sources");
    const format = useFormatter();
    const byteLabel = useByteLabel();

    if (findings.length === 0) {
        return (
            <p className="text-muted-foreground flex items-center gap-2 text-[0.8125rem]">
                <IconCircleCheck className="size-4 shrink-0" stroke={1.8} aria-hidden="true" />
                {t("findingsEmpty")}
            </p>
        );
    }

    function describe(entry: Finding): string {
        const values: Record<string, string | number> = { ...entry.values };

        // Byte counts are only bytes when the limit is in bytes; a title's
        // `limit` of 70 is a count of characters and stays a number.
        const isByteFinding =
            entry.code === "image_too_large" || entry.code === "head_beyond_limit";

        if (isByteFinding) {
            for (const key of BYTE_VALUES) {
                const raw = values[key];

                if (typeof raw === "number") {
                    values[key] = byteLabel(raw);
                }
            }
        }

        for (const [key, raw] of Object.entries(values)) {
            if (
                typeof raw === "number" &&
                !(isByteFinding && (BYTE_VALUES as readonly string[]).includes(key))
            ) {
                values[key] = format.number(raw);
            }
        }

        if (typeof entry.values.reason === "string") {
            values.reason = tImage(entry.values.reason as ImageProbeFailure);
        }

        if (entry.values.source === "og:image" || entry.values.source === "twitter:image") {
            values.source = tSources(entry.values.source);
        }

        values.platform = entry.platform === null ? "" : platformName(entry.platform);

        return tFindings(entry.code, values);
    }

    return (
        <ul className="divide-border/70 flex flex-col divide-y">
            {findings.map((entry, index) => {
                const Icon = ICONS[entry.severity];

                return (
                    <li
                        key={`${entry.code}-${entry.platform ?? "all"}-${index}`}
                        className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0"
                    >
                        <Icon
                            className={cn("mt-0.5 size-4 shrink-0", TONES[entry.severity])}
                            stroke={1.9}
                            aria-hidden="true"
                        />
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <p className="text-[0.8125rem] leading-relaxed wrap-break-word">
                                <span className={cn("font-medium", TONES[entry.severity])}>
                                    {tSeverity(entry.severity)}
                                </span>
                                {entry.platform !== null && (
                                    <span className="text-muted-foreground">
                                        {` · ${platformName(entry.platform)}`}
                                    </span>
                                )}
                                {" — "}
                                {describe(entry)}
                            </p>
                            {entry.provenance === "reported" && (
                                <p className="text-muted-foreground text-[0.6875rem]">
                                    {t("ruleReported")}
                                </p>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
