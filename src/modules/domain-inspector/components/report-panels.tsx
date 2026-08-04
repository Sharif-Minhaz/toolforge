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
import type { ReactNode } from "react";

import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { CountryChip } from "./country-chip";
import { Chip, GroupLabel, PanelBody, PanelCard, Row, Rows, type ChipTone } from "./panel-card";
import { PropagationCard } from "./propagation-card";
import { SignalStrip } from "./signal-strip";
import { summarizeReadings, type ReadingId, type ReadingTone } from "../domain/summary";
import {
    TECHNOLOGY_CATEGORIES,
    type CertificateReport,
    type DnsRecord,
    type DnsReport,
    type DomainBreakdown,
    type DomainRegistration,
    type DomainReport,
    type HostAddress,
    type HttpReport,
    type SecurityGrade,
    type TechnologyMatch,
} from "../types";

/**
 * The seven result panels, and the layout that holds them.
 *
 * Presentational and stateless: everything arrives from the server action in
 * one object. Values that came off the wire — hostnames, EPP codes, cipher
 * suites, SPDX identifiers — are set in the mono face and never translated,
 * because they are data. Only the words around them come from the catalogue.
 */

const ICON = "size-4";

/**
 * Past this a value wraps onto a second line, and two wrapped values sitting
 * flush against each other stop reading as two values. Those get a tinted
 * block so each stays one object.
 */
const LONG_VALUE = 44;

const VALUE = "font-mono text-[0.8125rem] leading-relaxed wrap-anywhere";

function useAbsent() {
    return useTranslations("domainInspector.common")("absent");
}

export function DomainReportView({ report }: { report: DomainReport }) {
    const readings = summarizeReadings(report);
    const toneOf = (id: ReadingId): ReadingTone =>
        readings.find((reading) => reading.id === id)?.tone ?? "idle";

    const panels: readonly { readonly id: string; readonly node: ReactNode }[] = [
        { id: "dns", node: <DnsPanel dns={report.dns} /> },
        {
            id: "registration",
            node: <RegistrationPanel registration={report.registration} tone={toneOf("expiry")} />,
        },
        {
            id: "certificate",
            node: (
                <CertificatePanel certificate={report.certificate} tone={toneOf("certificate")} />
            ),
        },
        { id: "hosting", node: <HostingPanel hosting={report.hosting} /> },
        { id: "http", node: <HttpPanel http={report.http} /> },
        { id: "technologies", node: <TechnologiesPanel technologies={report.technologies} /> },
        { id: "overview", node: <OverviewPanel breakdown={report.breakdown} /> },
    ];

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <SignalStrip report={report} />

            {/*
             * Full width, above the columns. It is the answer to the question
             * most people arrive with — "is my change live yet" — and it holds
             * a map, which a half-width multicol track would shrink to a stamp.
             */}
            <PropagationCard propagation={report.propagation} />

            {/*
             * Columns rather than a grid. Seven panels of very different
             * heights in a two-column grid leaves ragged holes under the short
             * ones; multicol packs them, and each panel is independent so
             * reading down a column loses nothing.
             */}
            <div className="min-w-0 xl:columns-2 xl:gap-4">
                {panels.map((panel, index) => (
                    <Reveal
                        key={panel.id}
                        delay={staggerDelay(index)}
                        className="mb-4 block break-inside-avoid last:mb-0 xl:last:mb-4"
                    >
                        {panel.node}
                    </Reveal>
                ))}
            </div>
        </div>
    );
}

function OverviewPanel({ breakdown }: { breakdown: DomainBreakdown }) {
    const t = useTranslations("domainInspector.overview");
    const format = useFormatter();
    const absent = useAbsent();

    return (
        <PanelCard title={t("title")} icon={<IconListTree className={ICON} stroke={1.8} />}>
            <Rows label={t("title")}>
                <Row label={t("hostname")}>{breakdown.hostname}</Row>
                {breakdown.punycoded && <Row label={t("unicode")}>{breakdown.unicode}</Row>}
                {breakdown.isIp ? (
                    <Row label={t("kind")}>{t("kindIp")}</Row>
                ) : (
                    <>
                        <Row label={t("subdomain")}>{breakdown.subdomain ?? absent}</Row>
                        <Row label={t("registrable")}>{breakdown.registrableDomain ?? absent}</Row>
                        <Row label={t("suffix")}>{breakdown.publicSuffix ?? absent}</Row>
                        <Row label={t("labels")}>{format.number(breakdown.labels.length)}</Row>
                    </>
                )}
            </Rows>
        </PanelCard>
    );
}

/** One TTL for the whole set when they agree, which they nearly always do. */
function sharedTtl(records: readonly DnsRecord[]): number | null {
    const [first] = records;

    return first !== undefined && records.every((record) => record.ttl === first.ttl)
        ? first.ttl
        : null;
}

function DnsPanel({ dns }: { dns: DomainReport["dns"] }) {
    const t = useTranslations("domainInspector.dns");
    const tResolvers = useTranslations("domainInspector.resolvers");

    return (
        <PanelCard
            title={t("title")}
            icon={<IconWorldSearch className={ICON} stroke={1.8} />}
            meta={dns.ok ? tResolvers(dns.data.resolver) : undefined}
        >
            <PanelBody result={dns}>
                {(data: DnsReport) => {
                    const answered = data.sets.filter((set) => set.records.length > 0);
                    const silent = data.sets.filter((set) => set.records.length === 0);

                    return (
                        <div className="flex min-w-0 flex-col py-2">
                            <div className="flex flex-wrap items-center gap-1.5 pb-3">
                                <Chip tone={data.authenticated ? "good" : "neutral"}>
                                    {data.authenticated
                                        ? t("dnssecValidated")
                                        : t("dnssecUnsigned")}
                                </Chip>
                                <Chip tone={data.mail.spf === null ? "warn" : "good"}>
                                    {t("spf")}
                                </Chip>
                                <Chip tone={data.mail.dmarc === null ? "warn" : "good"}>
                                    {t("dmarc")}
                                </Chip>
                                {data.mail.mtaSts && <Chip tone="good">{t("mtaSts")}</Chip>}
                            </div>

                            {/*
                             * One hairline-separated block per record type. The
                             * previous version ran every record of every type
                             * into a single column, so a three-line TXT record
                             * and the SOA under it read as one paragraph.
                             */}
                            <ul className="divide-border/50 min-w-0 divide-y border-t">
                                {answered.map((set) => {
                                    const ttl = sharedTtl(set.records);

                                    return (
                                        <li
                                            key={set.type}
                                            className="flex min-w-0 flex-col gap-1.5 py-2.5"
                                        >
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className="text-muted-foreground font-mono text-[0.6875rem] leading-normal font-medium tracking-widest">
                                                    {set.type}
                                                </span>
                                                {/*
                                                 * A TTL per row repeated one
                                                 * number down a whole column. It
                                                 * earns a place only where the
                                                 * records actually disagree.
                                                 */}
                                                {ttl !== null && (
                                                    <span className="text-muted-foreground/60 shrink-0 font-mono text-[0.625rem] tabular-nums">
                                                        {ttl}
                                                    </span>
                                                )}
                                            </div>

                                            <ul className="flex min-w-0 flex-col gap-1">
                                                {set.records.map((record, index) => (
                                                    <li
                                                        key={`${record.value}-${index}`}
                                                        className="flex min-w-0 items-baseline gap-2"
                                                    >
                                                        {record.priority !== undefined && (
                                                            <span className="text-muted-foreground w-5 shrink-0 text-right font-mono text-[0.75rem] tabular-nums">
                                                                {record.priority}
                                                            </span>
                                                        )}
                                                        <span
                                                            className={cn(
                                                                "min-w-0 flex-1",
                                                                VALUE,
                                                                record.value.length > LONG_VALUE &&
                                                                    "bg-muted/45 rounded-md px-2 py-1",
                                                            )}
                                                        >
                                                            {record.value}
                                                        </span>
                                                        {ttl === null && (
                                                            <span className="text-muted-foreground/60 shrink-0 font-mono text-[0.625rem] tabular-nums">
                                                                {record.ttl}
                                                            </span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    );
                                })}
                            </ul>

                            {silent.length > 0 && (
                                // One line rather than nine empty blocks: "no
                                // CAA" is worth knowing and not worth a block.
                                <p className="border-border/50 text-muted-foreground border-t py-2.5 text-[0.6875rem] leading-relaxed">
                                    {t("noRecords")}{" "}
                                    <span className="font-mono">
                                        {silent.map((set) => set.type).join(" · ")}
                                    </span>
                                </p>
                            )}

                            {(data.mail.spf !== null || data.mail.dmarc !== null) && (
                                <Rows label={t("mailPolicies")}>
                                    {data.mail.spf !== null && (
                                        <Row label={t("spfRecord")} stacked>
                                            <span className="bg-muted/45 block rounded-md px-2 py-1">
                                                {data.mail.spf}
                                            </span>
                                        </Row>
                                    )}
                                    {data.mail.dmarc !== null && (
                                        <Row label={t("dmarcRecord")} stacked>
                                            <span className="bg-muted/45 block rounded-md px-2 py-1">
                                                {data.mail.dmarc}
                                            </span>
                                        </Row>
                                    )}
                                </Rows>
                            )}
                        </div>
                    );
                }}
            </PanelBody>
        </PanelCard>
    );
}

function RegistrationPanel({
    registration,
    tone,
}: {
    registration: DomainReport["registration"];
    tone: ReadingTone;
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
                    <div className="flex min-w-0 flex-col py-2">
                        <div className="flex flex-wrap items-center gap-1.5 pb-3">
                            {data.daysUntilExpiry !== null && (
                                <Chip tone={tone}>
                                    {data.daysUntilExpiry < 0
                                        ? t("lapsed", { days: Math.abs(data.daysUntilExpiry) })
                                        : t("expiresIn", { days: data.daysUntilExpiry })}
                                </Chip>
                            )}
                            <Chip tone={data.dnssec ? "good" : "neutral"}>
                                {data.dnssec ? t("dnssecSigned") : t("dnssecUnsigned")}
                            </Chip>
                        </div>

                        {/*
                         * Broken into named runs. Fourteen rows under one
                         * heading is a list nobody finishes; who / when / where
                         * is three short lists somebody scans.
                         */}
                        <Rows label={t("title")}>
                            <Row label={t("registrar")}>{data.registrar ?? absent}</Row>
                            {data.registrarIanaId !== null && (
                                <Row label={t("ianaId")}>{data.registrarIanaId}</Row>
                            )}
                            <Row label={t("abuse")}>{data.abuseEmail ?? absent}</Row>
                            <Row label={t("country")}>
                                {data.registrantCountry === null ? (
                                    absent
                                ) : (
                                    <CountryChip code={data.registrantCountry} />
                                )}
                            </Row>
                        </Rows>

                        <GroupLabel>{t("dates")}</GroupLabel>
                        <Rows label={t("dates")}>
                            <Row label={t("created")}>{date(data.registeredAt)}</Row>
                            <Row label={t("expires")}>{date(data.expiresAt)}</Row>
                            <Row label={t("updated")}>{date(data.updatedAt)}</Row>
                        </Rows>

                        {data.nameservers.length > 0 && (
                            <>
                                <GroupLabel>{t("nameservers")}</GroupLabel>
                                <ul className="flex min-w-0 flex-col gap-0.5 pb-2">
                                    {data.nameservers.map((nameserver) => (
                                        <li key={nameserver} className={cn("min-w-0", VALUE)}>
                                            {nameserver}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {data.statuses.length > 0 && (
                            <>
                                <GroupLabel>{t("statuses")}</GroupLabel>
                                <ul className="flex flex-wrap gap-1.5 pb-2">
                                    {data.statuses.map((status) => (
                                        <li key={status}>
                                            <Chip>{status}</Chip>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        {data.source !== null && (
                            <Rows label={t("source")}>
                                <Row label={t("source")}>{data.source}</Row>
                            </Rows>
                        )}
                    </div>
                )}
            </PanelBody>
        </PanelCard>
    );
}

function HostingPanel({ hosting }: { hosting: DomainReport["hosting"] }) {
    const t = useTranslations("domainInspector.hosting");
    const absent = useAbsent();

    return (
        <PanelCard title={t("title")} icon={<IconServer2 className={ICON} stroke={1.8} />}>
            <PanelBody result={hosting}>
                {(data: readonly HostAddress[]) => (
                    <ul className="divide-border/50 min-w-0 divide-y">
                        {data.map((address) => (
                            <li key={address.ip} className="flex min-w-0 flex-col gap-1.5 py-3">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <span className={cn("min-w-0", VALUE)}>{address.ip}</span>
                                    <Chip>IPv{address.version}</Chip>
                                    {address.country !== null && (
                                        <CountryChip code={address.country} />
                                    )}
                                </div>

                                {/*
                                 * One column, not two. A reverse name is forty
                                 * characters and the two-column grid broke it
                                 * across three lines, mid-word.
                                 */}
                                <Rows label={address.ip}>
                                    <Row label={t("asn")}>
                                        {address.asn === null
                                            ? absent
                                            : `AS${address.asn}${address.asName === null ? "" : ` · ${address.asName}`}`}
                                    </Row>
                                    <Row label={t("prefix")}>{address.prefix ?? absent}</Row>
                                    <Row label={t("reverse")}>{address.reverse ?? absent}</Row>
                                    <Row label={t("org")}>{address.org ?? absent}</Row>
                                </Rows>
                            </li>
                        ))}
                    </ul>
                )}
            </PanelBody>
        </PanelCard>
    );
}

function CertificatePanel({
    certificate,
    tone,
}: {
    certificate: DomainReport["certificate"];
    tone: ReadingTone;
}) {
    const t = useTranslations("domainInspector.certificate");
    const format = useFormatter();
    const absent = useAbsent();

    return (
        <PanelCard title={t("title")} icon={<IconCertificate className={ICON} stroke={1.8} />}>
            <PanelBody result={certificate}>
                {(data: CertificateReport) => (
                    <div className="flex min-w-0 flex-col py-2">
                        <div className="flex flex-wrap items-center gap-1.5 pb-3">
                            <Chip tone={tone}>
                                {data.expired
                                    ? t("expired")
                                    : data.daysRemaining === null
                                      ? absent
                                      : t("daysLeft", { days: data.daysRemaining })}
                            </Chip>
                            <Chip tone={data.matchesHost ? "good" : "bad"}>
                                {data.matchesHost ? t("nameMatches") : t("nameMismatch")}
                            </Chip>
                            {data.protocol !== null && <Chip>{data.protocol}</Chip>}
                        </div>

                        <Rows label={t("title")}>
                            <Row label={t("subject")}>{data.subject ?? absent}</Row>
                            <Row label={t("issuer")}>{data.issuerOrg ?? data.issuer ?? absent}</Row>
                            <Row label={t("validFrom")}>
                                {data.validFrom === null
                                    ? absent
                                    : format.dateTime(new Date(data.validFrom), {
                                          dateStyle: "medium",
                                      })}
                            </Row>
                            <Row label={t("validTo")}>
                                {data.validTo === null
                                    ? absent
                                    : format.dateTime(new Date(data.validTo), {
                                          dateStyle: "medium",
                                      })}
                            </Row>
                            <Row label={t("key")}>{data.keyType ?? absent}</Row>
                            <Row label={t("cipher")}>{data.cipher ?? absent}</Row>
                        </Rows>

                        {data.chain.length > 0 && (
                            <>
                                <GroupLabel>{t("chain")}</GroupLabel>
                                {/*
                                 * Drawn as a ladder, because that is what a
                                 * chain is: each rung signed by the one below.
                                 */}
                                <ol className="flex min-w-0 flex-col pb-2">
                                    {data.chain.map((link, index) => (
                                        <li
                                            key={`${link}-${index}`}
                                            className="flex min-w-0 items-start gap-2.5"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="relative flex w-2 shrink-0 justify-center self-stretch"
                                            >
                                                <span
                                                    className={cn(
                                                        "bg-border/70 absolute w-px",
                                                        index === 0 && "top-2.5 bottom-0",
                                                        index > 0 &&
                                                            index < data.chain.length - 1 &&
                                                            "inset-y-0",
                                                        index === data.chain.length - 1 &&
                                                            index > 0 &&
                                                            "top-0 h-2.5",
                                                    )}
                                                />
                                                <span className="bg-muted-foreground/50 relative mt-2 size-1.5 rounded-full" />
                                            </span>
                                            <span className="min-w-0 py-1 font-mono text-[0.75rem] leading-relaxed wrap-anywhere">
                                                {link}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            </>
                        )}

                        <Rows label={t("fingerprint")}>
                            <Row label={t("serial")} stacked>
                                {data.serialNumber ?? absent}
                            </Row>
                            <Row label={t("fingerprint")} stacked>
                                {data.fingerprint ?? absent}
                            </Row>
                            {data.altNames.length > 0 && (
                                <Row label={t("altNames")} stacked>
                                    {data.altNames.join(", ")}
                                </Row>
                            )}
                        </Rows>
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

function HttpPanel({ http }: { http: DomainReport["http"] }) {
    const t = useTranslations("domainInspector.http");
    const tGrades = useTranslations("domainInspector.grades");
    const tHeaders = useTranslations("domainInspector.securityHeaders");
    const absent = useAbsent();

    return (
        <PanelCard title={t("title")} icon={<IconCloudNetwork className={ICON} stroke={1.8} />}>
            <PanelBody result={http}>
                {(data: HttpReport) => (
                    <div className="flex min-w-0 flex-col py-2">
                        <div className="flex flex-wrap items-center gap-1.5 pb-3">
                            <Chip tone={data.status < 400 ? "good" : "bad"}>
                                HTTP {data.status}
                            </Chip>
                            <Chip tone={GRADE_TONE[data.grade]}>
                                {tHeaders("chip", { grade: tGrades(data.grade) })}
                            </Chip>
                            {data.hops.length > 1 && (
                                <Chip>{t("redirects", { count: data.hops.length - 1 })}</Chip>
                            )}
                        </div>

                        <Rows label={t("title")}>
                            <Row label={t("finalUrl")} stacked>
                                {data.finalUrl}
                            </Row>
                            <Row label={t("server")}>{data.server ?? absent}</Row>
                            <Row label={t("poweredBy")}>{data.poweredBy ?? absent}</Row>
                            <Row label={t("pageTitle")} stacked>
                                {data.title ?? absent}
                            </Row>
                            {data.declaredLicense !== null && (
                                <Row label={t("declaredLicense")} stacked>
                                    {data.declaredLicense.name ??
                                        data.declaredLicense.url ??
                                        absent}
                                </Row>
                            )}
                        </Rows>

                        <GroupLabel>{t("securityHeaders")}</GroupLabel>
                        {/*
                         * One column. Two columns of twenty-four-character
                         * header names inside a half-width panel truncated
                         * every one of them.
                         */}
                        <ul className="divide-border/40 min-w-0 divide-y pb-2">
                            {data.securityHeaders.map((header) => (
                                <li
                                    key={header.name}
                                    className="flex min-w-0 items-baseline gap-2 py-1.5 text-[0.75rem] leading-relaxed"
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            "size-1.5 shrink-0 rounded-full",
                                            header.value === null
                                                ? "bg-border"
                                                : "bg-[color-mix(in_oklch,var(--brand-emerald)_65%,transparent)]",
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            "min-w-0 flex-1 font-mono wrap-anywhere",
                                            header.value === null && "text-muted-foreground",
                                        )}
                                    >
                                        {header.name}
                                    </span>
                                    <span className="text-muted-foreground/70 shrink-0 text-[0.6875rem]">
                                        {header.value === null
                                            ? tHeaders("missing")
                                            : tHeaders("present")}
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

function TechnologiesPanel({ technologies }: { technologies: DomainReport["technologies"] }) {
    const t = useTranslations("domainInspector.technologies");
    const tCategories = useTranslations("domainInspector.techCategories");
    const tEvidence = useTranslations("domainInspector.evidence");
    const format = useFormatter();

    return (
        <PanelCard
            title={t("title")}
            icon={<IconStack2 className={ICON} stroke={1.8} />}
            meta={technologies.ok ? format.number(technologies.data.length) : undefined}
        >
            <PanelBody result={technologies}>
                {(data: readonly TechnologyMatch[]) => {
                    if (data.length === 0) {
                        return (
                            <p className="text-muted-foreground py-3 text-[0.8125rem] leading-normal">
                                {t("none")}
                            </p>
                        );
                    }

                    // Grouped by category rather than listed flat: "what serves
                    // it" and "what it is written in" are different questions,
                    // and the answer to each is two or three entries long.
                    const groups = TECHNOLOGY_CATEGORIES.map((category) => ({
                        category,
                        matches: data.filter((match) => match.category === category),
                    })).filter((group) => group.matches.length > 0);

                    return (
                        <div className="divide-border/50 min-w-0 divide-y">
                            {groups.map((group) => (
                                <section
                                    key={group.category}
                                    className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 py-2.5"
                                >
                                    <h4 className="text-muted-foreground pt-px text-[0.625rem] leading-normal tracking-[0.14em] uppercase">
                                        {tCategories(group.category)}
                                    </h4>
                                    <ul className="flex min-w-0 flex-col gap-2">
                                        {group.matches.map((match) => (
                                            <li key={match.id} className="flex min-w-0 flex-col">
                                                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                    <span className="min-w-0 text-[0.8125rem] leading-relaxed font-medium">
                                                        {match.name}
                                                    </span>
                                                    {match.version !== null && (
                                                        <span className="text-muted-foreground shrink-0 font-mono text-[0.6875rem]">
                                                            {match.version}
                                                        </span>
                                                    )}
                                                    <span className="ml-auto shrink-0">
                                                        {match.licenseUrl === null ? (
                                                            <Chip>{match.license}</Chip>
                                                        ) : (
                                                            <a
                                                                href={match.licenseUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer nofollow"
                                                                className="focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none"
                                                                title={t("license")}
                                                            >
                                                                <Chip tone="good">
                                                                    {match.license}
                                                                </Chip>
                                                            </a>
                                                        )}
                                                    </span>
                                                </div>
                                                <p className="text-muted-foreground/80 min-w-0 truncate text-[0.6875rem] leading-relaxed">
                                                    {tEvidence(match.evidence.source)}
                                                    {match.evidence.key !== null && (
                                                        <span className="ml-1 font-mono">
                                                            {match.evidence.key}
                                                        </span>
                                                    )}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    );
                }}
            </PanelBody>
        </PanelCard>
    );
}
