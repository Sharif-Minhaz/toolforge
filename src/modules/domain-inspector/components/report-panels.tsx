"use client";

import {
    IconCertificate,
    IconCloudNetwork,
    IconFileCertificate,
    IconListTree,
    IconServer2,
    IconStack2,
    IconWorldSearch,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Fact, FactGrid, PanelBody, PanelCard, ScrollRow } from "./panel-card";
import type {
    CertificateReport,
    DnsReport,
    DomainBreakdown,
    DomainRegistration,
    DomainReport,
    HostAddress,
    HttpReport,
    SecurityGrade,
    TechnologyMatch,
} from "../types";

/**
 * The six result panels.
 *
 * Presentational and client-side, but they hold no state: everything they draw
 * arrived from the server action in one object. Values that came off the wire —
 * hostnames, EPP codes, cipher suites, SPDX identifiers — are rendered in the
 * mono face and are never translated, because they are data. Only the words
 * around them come from the catalogue.
 */

const ICON = "size-4";

function useAbsent() {
    const t = useTranslations("domainInspector.common");

    return t("absent");
}

export function OverviewPanel({ breakdown }: { breakdown: DomainBreakdown }) {
    const t = useTranslations("domainInspector.overview");
    const absent = useAbsent();

    return (
        <PanelCard title={t("title")} icon={<IconListTree className={ICON} stroke={1.8} />}>
            <FactGrid label={t("title")}>
                <Fact label={t("hostname")} wide>
                    {breakdown.hostname}
                </Fact>
                {breakdown.punycoded && <Fact label={t("unicode")}>{breakdown.unicode}</Fact>}
                {!breakdown.isIp && (
                    <>
                        <Fact label={t("subdomain")}>{breakdown.subdomain ?? absent}</Fact>
                        <Fact label={t("registrable")}>
                            {breakdown.registrableDomain ?? absent}
                        </Fact>
                        <Fact label={t("suffix")}>{breakdown.publicSuffix ?? absent}</Fact>
                        <Fact label={t("labels")}>{breakdown.labels.length}</Fact>
                    </>
                )}
                {breakdown.isIp && (
                    <Fact label={t("kind")} wide>
                        {t("kindIp")}
                    </Fact>
                )}
            </FactGrid>
        </PanelCard>
    );
}

export function DnsPanel({ dns }: { dns: DomainReport["dns"] }) {
    const t = useTranslations("domainInspector.dns");
    const tTypes = useTranslations("domainInspector.recordTypes");
    const tResolvers = useTranslations("domainInspector.resolvers");
    const absent = useAbsent();

    return (
        <PanelCard
            title={t("title")}
            icon={<IconWorldSearch className={ICON} stroke={1.8} />}
            meta={dns.ok ? tResolvers(dns.data.resolver) : undefined}
        >
            <PanelBody result={dns}>
                {(data: DnsReport) => (
                    <div className="flex min-w-0 flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Chip tone={data.authenticated ? "good" : "neutral"}>
                                {data.authenticated ? t("dnssecValidated") : t("dnssecUnsigned")}
                            </Chip>
                            <Chip tone={data.mail.spf === null ? "warn" : "good"}>{t("spf")}</Chip>
                            <Chip tone={data.mail.dmarc === null ? "warn" : "good"}>
                                {t("dmarc")}
                            </Chip>
                            {data.mail.mtaSts && <Chip tone="good">{t("mtaSts")}</Chip>}
                        </div>

                        <ScrollRow>
                            <table className="w-full min-w-140 border-collapse text-left text-[0.8125rem]">
                                <caption className="sr-only">{t("tableCaption")}</caption>
                                <thead>
                                    <tr className="text-muted-foreground">
                                        <th scope="col" className="py-1.5 pr-3 font-medium">
                                            {t("colType")}
                                        </th>
                                        <th scope="col" className="py-1.5 pr-3 font-medium">
                                            {t("colValue")}
                                        </th>
                                        <th scope="col" className="py-1.5 pr-3 font-medium">
                                            {t("colTtl")}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-border/60 divide-y">
                                    {data.sets.map((set) =>
                                        set.records.length === 0 ? (
                                            <tr key={set.type}>
                                                <th
                                                    scope="row"
                                                    className="text-primary py-1.5 pr-3 font-mono text-xs font-medium"
                                                >
                                                    {set.type}
                                                </th>
                                                <td
                                                    colSpan={2}
                                                    className="text-muted-foreground py-1.5 pr-3"
                                                >
                                                    {absent}
                                                </td>
                                            </tr>
                                        ) : (
                                            set.records.map((record, index) => (
                                                <tr key={`${set.type}-${index}`}>
                                                    <th
                                                        scope="row"
                                                        className="text-primary py-1.5 pr-3 font-mono text-xs font-medium whitespace-nowrap"
                                                    >
                                                        {index === 0 ? set.type : ""}
                                                        <span className="sr-only">
                                                            {tTypes(set.type)}
                                                        </span>
                                                    </th>
                                                    <td className="py-1.5 pr-3 font-mono break-all">
                                                        {record.priority !== undefined && (
                                                            <span className="text-muted-foreground mr-1.5 tabular-nums">
                                                                {record.priority}
                                                            </span>
                                                        )}
                                                        {record.value}
                                                    </td>
                                                    <td className="text-muted-foreground py-1.5 pr-3 font-mono tabular-nums">
                                                        {record.ttl}
                                                    </td>
                                                </tr>
                                            ))
                                        ),
                                    )}
                                </tbody>
                            </table>
                        </ScrollRow>

                        {data.mail.spf !== null && (
                            <Fact label={t("spfRecord")} wide>
                                {data.mail.spf}
                            </Fact>
                        )}
                        {data.mail.dmarc !== null && (
                            <Fact label={t("dmarcRecord")} wide>
                                {data.mail.dmarc}
                            </Fact>
                        )}
                    </div>
                )}
            </PanelBody>
        </PanelCard>
    );
}

export function RegistrationPanel({
    registration,
}: {
    registration: DomainReport["registration"];
}) {
    const t = useTranslations("domainInspector.registration");
    const format = useFormatter();
    const absent = useAbsent();

    const date = (value: string | null) =>
        value === null ? absent : format.dateTime(new Date(value), { dateStyle: "medium" });

    return (
        <PanelCard title={t("title")} icon={<IconFileCertificate className={ICON} stroke={1.8} />}>
            <PanelBody result={registration}>
                {(data: DomainRegistration) => (
                    <div className="flex min-w-0 flex-col gap-3">
                        {data.daysUntilExpiry !== null && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Chip
                                    tone={
                                        data.daysUntilExpiry < 0
                                            ? "bad"
                                            : data.daysUntilExpiry < 30
                                              ? "warn"
                                              : "good"
                                    }
                                >
                                    {data.daysUntilExpiry < 0
                                        ? t("lapsed", {
                                              days: Math.abs(data.daysUntilExpiry),
                                          })
                                        : t("expiresIn", { days: data.daysUntilExpiry })}
                                </Chip>
                                <Chip tone={data.dnssec ? "good" : "neutral"}>
                                    {data.dnssec ? t("dnssecSigned") : t("dnssecUnsigned")}
                                </Chip>
                            </div>
                        )}

                        <FactGrid label={t("title")}>
                            <Fact label={t("registrar")} wide>
                                {data.registrar ?? absent}
                                {data.registrarIanaId !== null && (
                                    <span className="text-muted-foreground ml-2">
                                        IANA {data.registrarIanaId}
                                    </span>
                                )}
                            </Fact>
                            <Fact label={t("created")}>{date(data.registeredAt)}</Fact>
                            <Fact label={t("expires")}>{date(data.expiresAt)}</Fact>
                            <Fact label={t("updated")}>{date(data.updatedAt)}</Fact>
                            <Fact label={t("country")}>{data.registrantCountry ?? absent}</Fact>
                            <Fact label={t("abuse")} wide>
                                {data.abuseEmail ?? absent}
                            </Fact>
                            {data.nameservers.length > 0 && (
                                <Fact label={t("nameservers")} wide>
                                    {data.nameservers.join(", ")}
                                </Fact>
                            )}
                            {data.source !== null && (
                                <Fact label={t("source")} wide>
                                    {data.source}
                                </Fact>
                            )}
                        </FactGrid>

                        {data.statuses.length > 0 && (
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                    {t("statuses")}
                                </p>
                                <ul className="flex flex-wrap gap-1.5">
                                    {data.statuses.map((status) => (
                                        <li key={status}>
                                            <Chip tone="neutral">{status}</Chip>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </PanelBody>
        </PanelCard>
    );
}

export function HostingPanel({ hosting }: { hosting: DomainReport["hosting"] }) {
    const t = useTranslations("domainInspector.hosting");
    const absent = useAbsent();

    return (
        <PanelCard title={t("title")} icon={<IconServer2 className={ICON} stroke={1.8} />}>
            <PanelBody result={hosting}>
                {(data: readonly HostAddress[]) => (
                    <ul className="flex min-w-0 flex-col gap-2">
                        {data.map((address) => (
                            <li
                                key={address.ip}
                                className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-2 rounded-xl px-3 py-2.5 ring-1 ring-inset"
                            >
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <span className="min-w-0 font-mono text-[0.8125rem] break-all">
                                        {address.ip}
                                    </span>
                                    <Chip tone="neutral">IPv{address.version}</Chip>
                                    {address.country !== null && (
                                        <Chip tone="neutral">{address.country}</Chip>
                                    )}
                                </div>
                                <dl
                                    aria-label={address.ip}
                                    className="grid min-w-0 gap-x-4 gap-y-1 text-[0.75rem] sm:grid-cols-2"
                                >
                                    <HostFact label={t("asn")}>
                                        {address.asn === null
                                            ? absent
                                            : `AS${address.asn}${address.asName === null ? "" : ` · ${address.asName}`}`}
                                    </HostFact>
                                    <HostFact label={t("prefix")}>
                                        {address.prefix ?? absent}
                                    </HostFact>
                                    <HostFact label={t("reverse")}>
                                        {address.reverse ?? absent}
                                    </HostFact>
                                    <HostFact label={t("network")}>
                                        {address.network ?? absent}
                                    </HostFact>
                                    <HostFact label={t("org")}>{address.org ?? absent}</HostFact>
                                    <HostFact label={t("registry")}>
                                        {address.registry ?? absent}
                                    </HostFact>
                                </dl>
                            </li>
                        ))}
                    </ul>
                )}
            </PanelBody>
        </PanelCard>
    );
}

function HostFact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 gap-2">
            <dt className="text-muted-foreground shrink-0">{label}</dt>
            <dd className="min-w-0 font-mono break-all">{children}</dd>
        </div>
    );
}

export function CertificatePanel({ certificate }: { certificate: DomainReport["certificate"] }) {
    const t = useTranslations("domainInspector.certificate");
    const format = useFormatter();
    const absent = useAbsent();

    return (
        <PanelCard title={t("title")} icon={<IconCertificate className={ICON} stroke={1.8} />}>
            <PanelBody result={certificate}>
                {(data: CertificateReport) => (
                    <div className="flex min-w-0 flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Chip
                                tone={
                                    data.expired
                                        ? "bad"
                                        : (data.daysRemaining ?? 0) < 15
                                          ? "warn"
                                          : "good"
                                }
                            >
                                {data.expired
                                    ? t("expired")
                                    : data.daysRemaining === null
                                      ? absent
                                      : t("daysLeft", { days: data.daysRemaining })}
                            </Chip>
                            <Chip tone={data.matchesHost ? "good" : "bad"}>
                                {data.matchesHost ? t("nameMatches") : t("nameMismatch")}
                            </Chip>
                            {data.protocol !== null && <Chip tone="neutral">{data.protocol}</Chip>}
                        </div>

                        <FactGrid label={t("title")}>
                            <Fact label={t("subject")}>{data.subject ?? absent}</Fact>
                            <Fact label={t("issuer")}>
                                {data.issuerOrg ?? data.issuer ?? absent}
                            </Fact>
                            <Fact label={t("validFrom")}>
                                {data.validFrom === null
                                    ? absent
                                    : format.dateTime(new Date(data.validFrom), {
                                          dateStyle: "medium",
                                      })}
                            </Fact>
                            <Fact label={t("validTo")}>
                                {data.validTo === null
                                    ? absent
                                    : format.dateTime(new Date(data.validTo), {
                                          dateStyle: "medium",
                                      })}
                            </Fact>
                            <Fact label={t("key")}>{data.keyType ?? absent}</Fact>
                            <Fact label={t("cipher")}>{data.cipher ?? absent}</Fact>
                            <Fact label={t("serial")} wide>
                                {data.serialNumber ?? absent}
                            </Fact>
                            <Fact label={t("fingerprint")} wide>
                                {data.fingerprint ?? absent}
                            </Fact>
                            {data.chain.length > 0 && (
                                <Fact label={t("chain")} wide>
                                    {data.chain.join(" → ")}
                                </Fact>
                            )}
                            {data.altNames.length > 0 && (
                                <Fact label={t("altNames")} wide>
                                    {data.altNames.join(", ")}
                                </Fact>
                            )}
                        </FactGrid>
                    </div>
                )}
            </PanelBody>
        </PanelCard>
    );
}

const GRADE_TONE: Record<SecurityGrade, ChipTone> = {
    strong: "good",
    partial: "warn",
    weak: "bad",
};

export function HttpPanel({ http }: { http: DomainReport["http"] }) {
    const t = useTranslations("domainInspector.http");
    const tGrades = useTranslations("domainInspector.grades");
    const tHeaders = useTranslations("domainInspector.securityHeaders");
    const absent = useAbsent();

    return (
        <PanelCard title={t("title")} icon={<IconCloudNetwork className={ICON} stroke={1.8} />}>
            <PanelBody result={http}>
                {(data: HttpReport) => (
                    <div className="flex min-w-0 flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Chip tone={data.status < 400 ? "good" : "bad"}>
                                HTTP {data.status}
                            </Chip>
                            <Chip tone={GRADE_TONE[data.grade]}>{tGrades(data.grade)}</Chip>
                            {data.hops.length > 1 && (
                                <Chip tone="neutral">
                                    {t("redirects", { count: data.hops.length - 1 })}
                                </Chip>
                            )}
                        </div>

                        <FactGrid label={t("title")}>
                            <Fact label={t("finalUrl")} wide>
                                {data.finalUrl}
                            </Fact>
                            <Fact label={t("server")}>{data.server ?? absent}</Fact>
                            <Fact label={t("poweredBy")}>{data.poweredBy ?? absent}</Fact>
                            <Fact label={t("pageTitle")} wide>
                                {data.title ?? absent}
                            </Fact>
                            {data.declaredLicense !== null && (
                                <Fact label={t("declaredLicense")} wide>
                                    {data.declaredLicense.name ??
                                        data.declaredLicense.url ??
                                        absent}
                                </Fact>
                            )}
                        </FactGrid>

                        <ul className="grid min-w-0 gap-1.5 sm:grid-cols-2">
                            {data.securityHeaders.map((header) => (
                                <li
                                    key={header.name}
                                    className="flex min-w-0 items-start gap-2 text-[0.75rem]"
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            "mt-1.5 size-1.5 shrink-0 rounded-full",
                                            header.value === null
                                                ? "bg-muted-foreground/50"
                                                : "bg-[var(--brand-emerald)]",
                                        )}
                                    />
                                    <span className="min-w-0">
                                        <span className="font-mono">{header.name}</span>
                                        <span className="text-muted-foreground ml-1.5">
                                            {header.value === null
                                                ? tHeaders("missing")
                                                : tHeaders("present")}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </PanelBody>
        </PanelCard>
    );
}

export function TechnologiesPanel({
    technologies,
}: {
    technologies: DomainReport["technologies"];
}) {
    const t = useTranslations("domainInspector.technologies");
    const tCategories = useTranslations("domainInspector.techCategories");
    const tEvidence = useTranslations("domainInspector.evidence");

    return (
        <PanelCard
            title={t("title")}
            icon={<IconStack2 className={ICON} stroke={1.8} />}
            meta={technologies.ok ? String(technologies.data.length) : undefined}
        >
            <PanelBody result={technologies}>
                {(data: readonly TechnologyMatch[]) =>
                    data.length === 0 ? (
                        <p className="text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5 text-[0.8125rem] leading-[1.5]">
                            {t("none")}
                        </p>
                    ) : (
                        <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
                            {data.map((match) => (
                                <li
                                    key={match.id}
                                    className="bg-card/60 ring-border/70 flex min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5 ring-1 ring-inset"
                                >
                                    <div className="flex min-w-0 items-baseline gap-1.5">
                                        <span className="min-w-0 truncate text-[0.8125rem] leading-[1.3] font-medium">
                                            {match.name}
                                        </span>
                                        {match.version !== null && (
                                            <span className="text-muted-foreground shrink-0 font-mono text-[0.6875rem]">
                                                {match.version}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {tCategories(match.category)}
                                    </p>
                                    <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-[0.6875rem]">
                                        <span className="text-muted-foreground">
                                            {t("license")}
                                        </span>
                                        {match.licenseUrl === null ? (
                                            <span className="font-mono">{match.license}</span>
                                        ) : (
                                            <a
                                                href={match.licenseUrl}
                                                target="_blank"
                                                rel="noopener noreferrer nofollow"
                                                className="text-primary focus-visible:ring-ring rounded font-mono underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
                                            >
                                                {match.license}
                                            </a>
                                        )}
                                    </p>
                                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                                        {tEvidence(match.evidence.source)}
                                        {match.evidence.key !== null && (
                                            <span className="ml-1 font-mono break-all">
                                                {match.evidence.key}
                                            </span>
                                        )}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )
                }
            </PanelBody>
        </PanelCard>
    );
}

type ChipTone = "good" | "warn" | "bad" | "neutral";

const CHIP_TONES: Record<ChipTone, string> = {
    good: "text-foreground ring-[color-mix(in_oklch,var(--brand-emerald)_45%,transparent)] bg-[color-mix(in_oklch,var(--brand-emerald)_10%,transparent)]",
    warn: "text-foreground ring-[color-mix(in_oklch,var(--brand-amber)_45%,transparent)] bg-[color-mix(in_oklch,var(--brand-amber)_10%,transparent)]",
    bad: "text-foreground ring-[color-mix(in_oklch,var(--brand-rose)_45%,transparent)] bg-[color-mix(in_oklch,var(--brand-rose)_10%,transparent)]",
    neutral: "text-muted-foreground ring-border/70 bg-card/60",
};

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-lg px-2 py-0.5 font-mono text-[0.6875rem] leading-[1.4] ring-1 ring-inset",
                CHIP_TONES[tone],
            )}
        >
            {children}
        </span>
    );
}
