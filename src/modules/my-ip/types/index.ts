import type { IpVersion } from "@/modules/tools/types";
import type { AddressClass } from "@/modules/tools/domain/ip";

/**
 * The request headers this tool reflects back, in display order. A literal
 * tuple so `myIp.fields.<field>` stays a checked message key.
 *
 * `Accept` and the `Sec-Fetch-*` family are left out on purpose: they describe
 * how a page was requested rather than the browser, and they change with how
 * the reader arrived. A full load sends `text/html,…`; following a link inside
 * the site fetches the same section as an RSC payload with `*\/*`. A row whose
 * value flips on navigation reads as a broken tool.
 */
export const REQUEST_FIELDS = [
    "userAgent",
    "language",
    "encoding",
    "referer",
    "brands",
    "platform",
    "mobile",
    "doNotTrack",
    "globalPrivacyControl",
] as const;

export type RequestField = (typeof REQUEST_FIELDS)[number];

export type RequestDetail = {
    readonly field: RequestField;
    /** The wire name, lowercase — data, not copy. */
    readonly header: string;
    /** `null` when the browser did not send the header at all. */
    readonly value: string | null;
};

export type VisitorAddress = {
    readonly ip: string;
    /** `null` when whatever the proxy reported does not parse as an address. */
    readonly version: IpVersion | null;
    readonly scope: AddressClass;
};

export type VisitorRequest = {
    /** `null` when the request carried no client address at all. */
    readonly address: VisitorAddress | null;
    readonly details: readonly RequestDetail[];
};

export const CLI_FORMATS = ["text", "json"] as const;

export type CliFormat = (typeof CLI_FORMATS)[number];
