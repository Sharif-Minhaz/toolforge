import { getLocale, getTranslations } from "next-intl/server";

import { RESULT_TRAY } from "@/modules/tools/components/workbench-step";
import { countryDescriber } from "@/modules/tools/domain/countries";
import type { HostRouting } from "@/modules/tools/types/network";
import { DetailList } from "./detail-list";

/**
 * Who announces the reader's address: reverse name, ASN, operator, prefix,
 * registry and the country the block was allocated to.
 *
 * `routing` is `null` for an address that is not public — a private or
 * loopback address has no route announcement to look up, and asking would
 * only spend a query on a guaranteed miss.
 */
export async function NetworkPanel({ routing }: { routing: HostRouting | null }) {
    const [t, tReport, locale] = await Promise.all([
        getTranslations("myIp.network"),
        getTranslations("myIp.report"),
        getLocale(),
    ]);
    const facts = routing === null ? null : routingFacts(routing, locale);
    const missing = (key: "notFound" | "lookupFailed") => (
        <span className="text-muted-foreground font-sans italic">{t(key)}</span>
    );

    return (
        <section aria-labelledby="my-ip-network-title" className={RESULT_TRAY}>
            <h2 id="my-ip-network-title" className="text-sm font-semibold">
                {t("title")}
            </h2>
            {facts === null || facts.every(({ value, failed }) => value === null && !failed) ? (
                <p className="text-muted-foreground text-xs leading-5">
                    {t(facts === null ? "notPublic" : "empty")}
                </p>
            ) : (
                <DetailList
                    copyLabel={(label) => tReport("copyValue", { label })}
                    items={facts.map(({ key, value, failed }) => ({
                        key,
                        label: t(key),
                        value: value ?? missing(failed ? "lookupFailed" : "notFound"),
                        copyValue: value,
                    }))}
                />
            )}
        </section>
    );
}

function routingFacts(routing: HostRouting, locale: string) {
    const country = countryDescriber(locale)(routing.country);
    const countryText =
        routing.country === null
            ? null
            : [country.flag, country.name, `(${routing.country.toUpperCase()})`]
                  .filter((part) => part !== null)
                  .join(" ");

    // Only the reverse name can tell "the network publishes none" apart from
    // "no resolver answered"; the Cymru rows come from a zone that answers.
    return [
        { key: "reverse", value: routing.reverse, failed: routing.reverseFailed },
        { key: "asn", value: routing.asn === null ? null : `AS${routing.asn}`, failed: false },
        { key: "asName", value: routing.asName, failed: false },
        { key: "prefix", value: routing.prefix, failed: false },
        { key: "registry", value: routing.registry?.toUpperCase() ?? null, failed: false },
        { key: "country", value: countryText, failed: false },
    ] as const;
}
