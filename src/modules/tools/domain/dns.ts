/**
 * Reading what a DoH resolver actually said.
 *
 * Pure: the repository does the fetching and the schema check, and hands the
 * already-typed answer list here. That split is what makes every quirk below —
 * the quoting rules, the trailing dots, the pipe-separated Cymru fields —
 * testable without a network.
 *
 * What lives here is what any caller of a resolver needs. Record types that
 * only one tool renders — MX preferences, SPF and DMARC policy — stay with that
 * tool, because reshaping an answer for a panel is presentation.
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

/** The PTR type code, kept here so the reverse-answer reader stays pure. */
const PTR_TYPE = 12;

/**
 * What an RCODE means for the caller: `null` when the resolver answered,
 * `nxdomain` when the name does not exist, `server_failure` for the rest.
 *
 * SERVFAIL and REFUSED used to come back as `no_records`, which panels word
 * as "nothing is published here". That is a claim about the zone, made when
 * the resolver could not reach the zone at all.
 */
export function dohStatusFailure(status: number): "nxdomain" | "server_failure" | null {
    if (status === DNS_STATUS_NOERROR) {
        return null;
    }

    return status === DNS_STATUS_NXDOMAIN ? "nxdomain" : "server_failure";
}

/**
 * A reverse lookup has three outcomes, not two. `absent` is a finding (the
 * network publishes no name for the address). `failed` is not (no answer was
 * had), and showing it as "not found" tells the reader something false.
 */
export type ReverseOutcome =
    | { readonly kind: "found"; readonly name: string }
    | { readonly kind: "absent" }
    | { readonly kind: "failed" };

type ReverseQueryResult =
    | { readonly ok: true; readonly answers: readonly DohAnswer[] }
    | { readonly ok: false; readonly reason: string };

export function readReverseAnswer(result: ReverseQueryResult): ReverseOutcome {
    if (!result.ok) {
        return result.reason === "nxdomain" || result.reason === "no_records"
            ? { kind: "absent" }
            : { kind: "failed" };
    }

    // A classless (RFC 2317) delegation answers with a CNAME first and the
    // PTR after it, so the first answer is not necessarily the name.
    const ptr = result.answers.find((answer) => answer.type === PTR_TYPE);

    return ptr === undefined ? { kind: "absent" } : { kind: "found", name: stripRootDot(ptr.data) };
}

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
