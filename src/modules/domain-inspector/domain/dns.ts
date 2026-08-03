import type { DnsRecord, DnsRecordType, MailPosture } from "../types";

/**
 * Turning a DoH JSON answer into rows a person can read.
 *
 * Pure: the repository does the fetching and the schema check, and hands the
 * already-typed answer list here. That split is what makes every quirk below —
 * the quoting rules, the trailing dots, the two numbers hiding in an MX record
 * — testable without a network.
 */

/** One entry of the `Answer` array, after the repository has validated it. */
export type DohAnswer = {
    readonly name: string;
    readonly type: number;
    readonly TTL: number;
    readonly data: string;
};

/** RCODEs worth telling apart; everything else is reported as a failed lookup. */
export const DNS_STATUS_NOERROR = 0;
export const DNS_STATUS_NXDOMAIN = 3;

/** A presentation-format name carries a root dot that means nothing on screen. */
export function stripRootDot(name: string): string {
    return name.replace(/\.$/, "");
}

/**
 * A TXT record longer than 255 octets is published as several character
 * strings, and the JSON API hands them back space-separated and each quoted.
 * The wire meaning is their concatenation with nothing between them — which is
 * exactly the difference between reading an SPF record and mangling it.
 */
export function unquoteTxt(data: string): string {
    const parts = data.match(/"(?:\\.|[^"\\])*"/g);

    if (parts === null) {
        return data;
    }

    return parts.map((part) => part.slice(1, -1).replace(/\\(.)/g, "$1")).join("");
}

/** `10 mail.example.com.` → preference and exchange, kept apart. */
function splitPriority(data: string): { priority: number; value: string } | null {
    const matched = /^(\d+)\s+(.+)$/.exec(data);

    return matched === null
        ? null
        : { priority: Number(matched[1]), value: stripRootDot(matched[2]) };
}

/**
 * Answers arrive mixed: a query for `A` on a name behind a CNAME returns the
 * CNAME too. Filtering by the numeric type is what keeps each panel row
 * honest about which question it answers.
 */
export function toDnsRecords(
    type: DnsRecordType,
    typeCode: number,
    answers: readonly DohAnswer[],
): readonly DnsRecord[] {
    return answers
        .filter((answer) => answer.type === typeCode)
        .map((answer) => {
            const name = stripRootDot(answer.name);
            const ttl = Number.isFinite(answer.TTL) ? Math.max(0, Math.trunc(answer.TTL)) : 0;

            if (type === "TXT") {
                return { name, ttl, value: unquoteTxt(answer.data) };
            }

            if (type === "MX") {
                const split = splitPriority(answer.data);

                return split === null
                    ? { name, ttl, value: answer.data }
                    : { name, ttl, value: split.value, priority: split.priority };
            }

            if (type === "NS" || type === "CNAME") {
                return { name, ttl, value: stripRootDot(answer.data) };
            }

            return { name, ttl, value: answer.data };
        });
}

/** Every TXT value that begins an SPF policy, in publication order. */
export function findSpf(records: readonly DnsRecord[]): string | null {
    return records.find((record) => /^v=spf1\b/i.test(record.value))?.value ?? null;
}

export function findDmarc(records: readonly DnsRecord[]): string | null {
    return records.find((record) => /^v=DMARC1\b/i.test(record.value))?.value ?? null;
}

export function hasMtaSts(records: readonly DnsRecord[]): boolean {
    return records.some((record) => /^v=STSv1\b/i.test(record.value));
}

export function buildMailPosture(
    apexTxt: readonly DnsRecord[],
    dmarcTxt: readonly DnsRecord[],
    mtaStsTxt: readonly DnsRecord[],
): MailPosture {
    return {
        spf: findSpf(apexTxt),
        dmarc: findDmarc(dmarcTxt),
        mtaSts: hasMtaSts(mtaStsTxt),
    };
}

/**
 * Cymru's origin zone answers one TXT string of pipe-separated fields:
 * `15169 | 8.8.8.0/24 | US | arin | 1992-12-01`. The AS-name zone answers the
 * same shape with the name last.
 */
export type CymruOrigin = {
    readonly asn: number | null;
    readonly prefix: string | null;
    readonly country: string | null;
    readonly registry: string | null;
};

export function parseCymruOrigin(value: string): CymruOrigin | null {
    const fields = value.split("|").map((field) => field.trim());

    if (fields.length < 4) {
        return null;
    }

    // A prefix announced by more than one AS lists them space-separated; the
    // first is enough to name the network without implying the others do not
    // exist.
    const asn = Number.parseInt(fields[0].split(/\s+/)[0], 10);

    return {
        asn: Number.isInteger(asn) ? asn : null,
        prefix: fields[1] || null,
        country: fields[2] || null,
        registry: fields[3] || null,
    };
}

/** `15169 | US | arin | 2000-03-30 | GOOGLE, US` → the operator's name. */
export function parseCymruAsName(value: string): string | null {
    const fields = value.split("|").map((field) => field.trim());

    return fields.length >= 5 && fields[4].length > 0 ? fields[4] : null;
}
