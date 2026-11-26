"use client";

import {
    IconCalendarEvent,
    IconCamera,
    IconExternalLink,
    IconHash,
    IconMapPin,
    IconMessage,
    IconPhoto,
    IconShieldCheck,
    IconUser,
    IconAppWindow,
    type IconProps,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ComponentType } from "react";

import type { PhotoFacts, PrivacyFinding } from "../types";

const FINDING_ICONS: Readonly<Record<PrivacyFinding, ComponentType<IconProps>>> = {
    location: IconMapPin,
    people: IconUser,
    serial: IconHash,
    thumbnail: IconPhoto,
    time: IconCalendarEvent,
    device: IconCamera,
    software: IconAppWindow,
    comment: IconMessage,
};

/** Six decimals of a degree is about 11 cm — already more than the GPS chip knows. */
const COORDINATE_DIGITS = 6;

type PrivacyFindingsProps = {
    findings: readonly PrivacyFinding[];
    facts: PhotoFacts;
};

/**
 * What in the photo identifies somebody, worst first, each with the value it
 * found — the reader decides whether to share a photo on what it says, not on
 * a count of tags.
 */
export function PrivacyFindings({ findings, facts }: PrivacyFindingsProps) {
    const t = useTranslations("photoExif.workbench");
    const formatter = useFormatter();

    if (findings.length === 0) {
        return (
            <p className="text-success flex items-start gap-2 text-sm leading-[1.5]">
                <IconShieldCheck
                    className="mt-0.5 size-4 shrink-0"
                    stroke={1.9}
                    aria-hidden="true"
                />
                {t("nothingFound")}
            </p>
        );
    }

    function detail(finding: PrivacyFinding): string | null {
        switch (finding) {
            case "location":
                return facts.location === null
                    ? null
                    : `${formatter.number(facts.location.latitude, { maximumFractionDigits: COORDINATE_DIGITS })}, ${formatter.number(facts.location.longitude, { maximumFractionDigits: COORDINATE_DIGITS })}`;
            case "people":
                return facts.people.join(", ");
            case "serial":
                return facts.serialNumbers.join(", ");
            case "time":
                return facts.takenAt;
            case "device":
                return [facts.make, facts.model].filter((part) => part !== null).join(" ");
            case "software":
                return facts.software;
            case "thumbnail":
            case "comment":
                return null;
        }
    }

    return (
        <ul className="flex flex-col gap-2">
            {findings.map((finding) => {
                const Icon = FINDING_ICONS[finding];
                const value = detail(finding);
                const severe =
                    finding === "location" || finding === "people" || finding === "serial";

                return (
                    <li
                        key={finding}
                        className="bg-card ring-border/70 flex min-w-0 items-start gap-3 rounded-lg p-3 ring-1 ring-inset"
                    >
                        <span
                            className={
                                severe
                                    ? "bg-destructive/10 text-destructive flex size-8 shrink-0 items-center justify-center rounded-lg"
                                    : "bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg"
                            }
                        >
                            <Icon className="size-4" stroke={1.8} aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-[0.8125rem] leading-[1.3] font-medium">
                                {t(`findings.${finding}`)}
                            </span>
                            {value !== null && value.length > 0 && (
                                <span className="font-mono text-xs break-all">{value}</span>
                            )}
                            {finding === "location" &&
                                facts.location !== null &&
                                facts.location.altitude !== null && (
                                    <span className="text-muted-foreground text-xs">
                                        {t("altitude", {
                                            altitude: formatter.number(facts.location.altitude, {
                                                maximumFractionDigits: 1,
                                            }),
                                        })}
                                    </span>
                                )}
                            <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                {t(`findingHints.${finding}`)}
                            </span>
                            {finding === "location" && facts.location !== null && (
                                <span className="mt-1 flex flex-col gap-0.5">
                                    <a
                                        href={`https://www.openstreetmap.org/?mlat=${facts.location.latitude.toFixed(COORDINATE_DIGITS)}&mlon=${facts.location.longitude.toFixed(COORDINATE_DIGITS)}#map=17/${facts.location.latitude.toFixed(COORDINATE_DIGITS)}/${facts.location.longitude.toFixed(COORDINATE_DIGITS)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary focus-visible:ring-ring inline-flex w-fit items-center gap-1 rounded text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                                    >
                                        {t("openMap")}
                                        <IconExternalLink
                                            className="size-3.5"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                    </a>
                                    <span className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {t("openMapHint")}
                                    </span>
                                </span>
                            )}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
