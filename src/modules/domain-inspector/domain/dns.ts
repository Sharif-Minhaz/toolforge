import { stripRootDot, unquoteTxt, type DohAnswer } from "@/modules/tools/domain/dns";
import type { DnsRecord, DnsRecordType, MailPosture } from "../types";

/**
 * Turning a DoH JSON answer into the rows this tool's panels render.
 *
 * The transport-level reading — quoting, root dots, Cymru's pipe fields —
 * moved to `tools/domain/dns.ts` when the IP & Route Globe needed the same
 * answers. What stayed is the part that is only true here: which record types
 * this tool asks for, and what it concludes from them.
 */

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
