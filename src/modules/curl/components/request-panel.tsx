"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { HTTP_VERSION_LABELS } from "../domain/constants";
import type { HttpRequest, KeyValue, TransferOptions } from "../types";
import { CodeBlock, CODE_TEXT } from "@/modules/tools/components/code-block";

/**
 * The model both directions are built from, shown as it is. Not a second parse
 * of anything — this is the very object the output was written from, which is
 * what makes it worth reading when a converted snippet surprises you.
 */

/**
 * Transfer settings as the flags that set them. The flag names are proper
 * names, not copy: `--max-redirs` reads the same in every locale, and putting
 * it in the message catalogue would only invite it to be translated.
 */
function transferRows(transfer: TransferOptions, on: string): readonly KeyValue[] {
    const rows: KeyValue[] = [];
    const add = (key: string, value: string | number | boolean | null) => {
        if (value === null || value === false || value === "") {
            return;
        }

        rows.push({ key, value: value === true ? on : String(value) });
    };

    add("--location", transfer.followRedirects);
    add("--max-redirs", transfer.maxRedirects);
    add("--insecure", transfer.insecure);
    add("--compressed", transfer.compressed);
    add("--proxy", transfer.proxy);
    add("--proxy-user", transfer.proxyUser);
    add("--max-time", transfer.maxTimeSeconds);
    add("--connect-timeout", transfer.connectTimeoutSeconds);
    add("HTTP", HTTP_VERSION_LABELS[transfer.httpVersion]);
    add("--cert", transfer.clientCert);
    add("--key", transfer.clientKey);
    add("--cacert", transfer.caCert);
    add("--unix-socket", transfer.unixSocket);
    add("--interface", transfer.interfaceName);
    add("--retry", transfer.retry);
    add("--netrc", transfer.netrc);
    add("--cookie", transfer.cookieFile);
    add("--head", transfer.headOnly);
    add("--include", transfer.includeHeaders);
    add("--verbose", transfer.verbose);
    add("--silent", transfer.silent);
    add("--fail", transfer.failFast);
    add("--output", transfer.outputPath);

    for (const entry of transfer.resolve) {
        add("--resolve", entry);
    }

    // Set only when a `fetch` snippet named them; curl has no word for any.
    add("credentials", transfer.credentials);
    add("mode", transfer.mode);
    add("cache", transfer.cache);
    add("integrity", transfer.integrity);
    add("keepalive", transfer.keepalive);

    return rows;
}

type SectionProps = {
    title: string;
    children: ReactNode;
};

function Section({ title, children }: SectionProps) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <h3 className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
                {title}
            </h3>
            {children}
        </div>
    );
}

type PairsProps = {
    pairs: readonly KeyValue[];
    empty: string;
};

function Pairs({ pairs, empty }: PairsProps) {
    if (pairs.length === 0) {
        return <p className="text-muted-foreground/70 text-[0.8125rem]">{empty}</p>;
    }

    return (
        <dl className="ring-border/70 divide-border/60 divide-y rounded-xl ring-1 ring-inset">
            {pairs.map((pair, index) => (
                <div
                    key={`${pair.key}-${index}`}
                    className="grid grid-cols-1 gap-0.5 px-3 py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-3"
                >
                    <dt className="text-primary min-w-0 font-mono text-[0.75rem] leading-normal wrap-break-word">
                        {pair.key}
                    </dt>
                    <dd className="text-muted-foreground min-w-0 font-mono text-[0.75rem] leading-normal wrap-break-word">
                        {pair.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

type RequestPanelProps = {
    request: HttpRequest | null;
};

export function RequestPanel({ request }: RequestPanelProps) {
    const t = useTranslations("curl.request");
    const tBody = useTranslations("curl.request.bodyKinds");
    const tAuth = useTranslations("curl.request.authSchemes");

    if (request === null) {
        return <p className="text-muted-foreground text-[0.8125rem]">{t("empty")}</p>;
    }

    const body = request.body;

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <Section title={t("url")}>
                <p className="flex min-w-0 flex-wrap items-baseline gap-2">
                    <span className="bg-primary/10 text-primary ring-primary/20 rounded-lg px-2 py-0.5 font-mono text-[0.75rem] leading-normal font-medium ring-1 ring-inset">
                        {request.method}
                    </span>
                    <span className="min-w-0 font-mono text-[0.8125rem] leading-normal wrap-break-word">
                        {request.url}
                    </span>
                </p>
            </Section>

            <Section title={t("query")}>
                <Pairs pairs={request.query} empty={t("empty")} />
            </Section>

            <Section title={t("headers")}>
                <Pairs
                    pairs={request.headers.map((header) => ({
                        key: header.name,
                        value: header.value,
                    }))}
                    empty={t("empty")}
                />
            </Section>

            <Section title={t("cookies")}>
                <Pairs pairs={request.cookies} empty={t("empty")} />
            </Section>

            <Section title={t("auth")}>
                {request.auth === null ? (
                    <p className="text-muted-foreground/70 text-[0.8125rem]">{t("empty")}</p>
                ) : (
                    <p className="text-muted-foreground font-mono text-[0.75rem] leading-normal wrap-break-word">
                        {tAuth(request.auth.scheme)}
                        {" — "}
                        {request.auth.scheme === "bearer"
                            ? t("authToken")
                            : t("authUser", { user: request.auth.user })}
                    </p>
                )}
            </Section>

            <Section title={t("body")}>
                <div className="flex min-w-0 flex-col gap-2">
                    <p className="text-muted-foreground/70 text-[0.8125rem]">{tBody(body.kind)}</p>

                    {body.kind === "urlencoded" && <Pairs pairs={body.fields} empty={t("empty")} />}

                    {body.kind === "multipart" && (
                        <Pairs
                            pairs={body.parts.map((part) => ({
                                key: part.name,
                                value:
                                    part.filename === null
                                        ? part.value
                                        : t("partFile", { filename: part.filename }),
                            }))}
                            empty={t("empty")}
                        />
                    )}

                    {body.kind === "file" && (
                        <p className="text-muted-foreground font-mono text-[0.75rem] leading-normal wrap-break-word">
                            {t("fileBody", { path: body.path })}
                        </p>
                    )}

                    {body.kind === "json" && (
                        <CodeBlock code={body.text} language="javascript" className="max-h-56" />
                    )}

                    {/* Raw is left uncoloured on purpose: it may be XML, a
                        protobuf dump or anything else, and JavaScript rules
                        applied to it would invent structure that is not there. */}
                    {body.kind === "raw" && (
                        <div className="bg-muted/45 ring-border/70 max-h-56 min-w-0 overflow-auto rounded-xl ring-1 ring-inset">
                            <pre className={cn(CODE_TEXT, "text-muted-foreground p-3")}>
                                {body.text}
                            </pre>
                        </div>
                    )}
                </div>
            </Section>

            <Section title={t("transfer")}>
                <Pairs pairs={transferRows(request.transfer, t("enabled"))} empty={t("empty")} />
            </Section>
        </div>
    );
}
