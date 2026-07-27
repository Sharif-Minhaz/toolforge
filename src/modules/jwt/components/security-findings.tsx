"use client";

import {
    IconAlertTriangle,
    IconInfoCircle,
    IconShieldCheck,
    IconShieldX,
    type IconProps,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import type { JwtFinding, JwtFindingSeverity } from "../types";

const SEVERITY_ICON: Record<JwtFindingSeverity, ComponentType<IconProps>> = {
    critical: IconShieldX,
    warning: IconAlertTriangle,
    info: IconInfoCircle,
};

const SEVERITY_SURFACE: Record<JwtFindingSeverity, string> = {
    critical: "text-destructive ring-destructive/30 bg-destructive/8",
    warning: "text-brand-amber ring-brand-amber/30 bg-brand-amber/8",
    info: "text-muted-foreground ring-border/70 bg-muted/40",
};

type SecurityFindingsProps = {
    findings: readonly JwtFinding[];
};

/**
 * What is worth knowing about a token that could be read without a key. An
 * empty list is stated rather than hidden: "nothing to flag" is an answer the
 * reader came for.
 */
export function SecurityFindings({ findings }: SecurityFindingsProps) {
    const t = useTranslations("jwt.findings");

    if (findings.length === 0) {
        return (
            <p className="text-muted-foreground ring-border/70 bg-muted/40 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[0.8125rem] leading-normal ring-1 ring-inset">
                <IconShieldCheck
                    className="mt-px size-4 shrink-0 text-[var(--color-success)]"
                    stroke={1.9}
                    aria-hidden="true"
                />
                {t("none")}
            </p>
        );
    }

    return (
        <ul className="flex flex-col gap-2">
            {findings.map((finding) => {
                const Icon = SEVERITY_ICON[finding.severity];

                return (
                    <li
                        key={finding.code}
                        className={cn(
                            "flex items-start gap-2 rounded-xl px-3 py-2.5 text-[0.8125rem] leading-normal ring-1 ring-inset",
                            SEVERITY_SURFACE[finding.severity],
                        )}
                    >
                        <Icon className="mt-px size-4 shrink-0" stroke={1.9} aria-hidden="true" />
                        <span className="flex min-w-0 flex-col gap-1">
                            <span className="font-medium">
                                <span className="sr-only">
                                    {t(`severity.${finding.severity}`)}:{" "}
                                </span>
                                {t(`${finding.code}.title`)}
                            </span>
                            <span className="text-muted-foreground">
                                {t(`${finding.code}.detail`)}
                            </span>
                            {finding.subjects.length > 0 && (
                                <span className="text-muted-foreground font-mono text-[0.6875rem] break-all">
                                    {finding.subjects.join(", ")}
                                </span>
                            )}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
