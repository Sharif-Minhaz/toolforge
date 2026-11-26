import { classifyAddress, detectIpVersion } from "@/modules/tools/domain/ip";
import {
    REQUEST_FIELDS,
    type RequestField,
    type VisitorAddress,
    type VisitorRequest,
} from "../types";

/** The one method of `Headers` this module reads, so tests can pass a plain map. */
export type HeaderSource = {
    get(name: string): string | null;
};

const FIELD_HEADERS: Readonly<Record<RequestField, string>> = {
    userAgent: "user-agent",
    language: "accept-language",
    encoding: "accept-encoding",
    referer: "referer",
    brands: "sec-ch-ua",
    platform: "sec-ch-ua-platform",
    mobile: "sec-ch-ua-mobile",
    doNotTrack: "dnt",
    globalPrivacyControl: "sec-gpc",
};

/**
 * What the server saw of one request: the address it came from and the
 * headers that describe the browser.
 *
 * The address is resolved by the caller from the proxy's forwarding headers,
 * which only the deployment knows how far to trust.
 */
export function readVisitorRequest(ip: string | undefined, headers: HeaderSource): VisitorRequest {
    return {
        address: ip === undefined ? null : describeVisitorAddress(ip),
        details: REQUEST_FIELDS.map((field) => {
            const header = FIELD_HEADERS[field];

            return { field, header, value: headers.get(header)?.trim() || null };
        }),
    };
}

function describeVisitorAddress(ip: string): VisitorAddress {
    return { ip, version: detectIpVersion(ip), scope: classifyAddress(ip) };
}

/** `curl …/api/ip` — the address and a newline, or `null` when there is none. */
export function toCliText(request: VisitorRequest): string | null {
    return request.address === null ? null : `${request.address.ip}\n`;
}

/** `curl …/api/ip?format=json` — the address and every reflected header, absent ones as `null`. */
export function toCliJson(
    request: VisitorRequest,
): Readonly<Record<string, string | number | null>> {
    return {
        ip: request.address?.ip ?? null,
        version: request.address?.version ?? null,
        ...Object.fromEntries(request.details.map(({ field, value }) => [field, value])),
    };
}
