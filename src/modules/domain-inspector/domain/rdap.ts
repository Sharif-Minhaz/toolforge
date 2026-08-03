import type { DomainRegistration } from "../types";

/**
 * RDAP payloads reshaped into the two flat records the UI renders.
 *
 * RDAP is JSON, which makes it far kinder than WHOIS text — but its useful
 * fields are buried in jCard arrays, and every registry buries them slightly
 * differently. Every reach into that structure is defensive: a missing field
 * becomes `null`, never an exception, because half a registration record is
 * still worth showing.
 */

/** One jCard property: `["fn", {}, "text", "Example Registrar, Inc."]`. */
export type RdapVcardEntry = readonly unknown[];

export type RdapEntity = {
    readonly roles?: readonly string[];
    readonly vcardArray?: readonly unknown[];
    readonly publicIds?: readonly { readonly type?: string; readonly identifier?: string }[];
    readonly entities?: readonly RdapEntity[];
};

export type RdapEvent = {
    readonly eventAction?: string;
    readonly eventDate?: string;
};

export type RdapDomainPayload = {
    readonly handle?: string;
    readonly ldhName?: string;
    readonly status?: readonly string[];
    readonly events?: readonly RdapEvent[];
    readonly nameservers?: readonly { readonly ldhName?: string }[];
    readonly secureDNS?: { readonly delegationSigned?: boolean; readonly zoneSigned?: boolean };
    readonly entities?: readonly RdapEntity[];
};

export type RdapNetworkPayload = {
    readonly name?: string;
    readonly country?: string;
    readonly entities?: readonly RdapEntity[];
};

export type NetworkInfo = {
    readonly network: string | null;
    readonly org: string | null;
    readonly country: string | null;
};

const MS_PER_DAY = 86_400_000;

/**
 * RDAP dates are ISO 8601 and are supposed to carry an offset, but registries
 * that omit it do exist. A zone-less string would be read against whichever
 * host parsed it, so the missing designator is supplied here rather than left
 * to `Date` to guess.
 */
export function readRdapDate(value: string | undefined): string | null {
    if (value === undefined || value.trim().length === 0) {
        return null;
    }

    const trimmed = value.trim();
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) ? trimmed : `${trimmed}Z`;
    const parsed = Date.parse(normalized);

    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function findEvent(events: readonly RdapEvent[] | undefined, action: string): string | null {
    const match = events?.find(
        (event) => event.eventAction?.toLowerCase() === action.toLowerCase(),
    );

    return readRdapDate(match?.eventDate);
}

/** The jCard property list, or an empty list for anything that is not one. */
function vcardEntries(entity: RdapEntity | undefined): readonly RdapVcardEntry[] {
    const array = entity?.vcardArray;

    if (!Array.isArray(array) || array.length < 2 || !Array.isArray(array[1])) {
        return [];
    }

    return (array[1] as unknown[]).filter((entry): entry is RdapVcardEntry => Array.isArray(entry));
}

function vcardValue(entity: RdapEntity | undefined, property: string): string | null {
    const entry = vcardEntries(entity).find(
        (candidate) => typeof candidate[0] === "string" && candidate[0].toLowerCase() === property,
    );
    const value = entry?.[3];

    return typeof value === "string" && value.length > 0 ? value : null;
}

function findEntity(
    entities: readonly RdapEntity[] | undefined,
    role: string,
): RdapEntity | undefined {
    return entities?.find((entity) =>
        entity.roles?.some((candidate) => candidate.toLowerCase() === role),
    );
}

/**
 * A country reaches us two ways: as the `cc` parameter of an address, or as the
 * seventh component of the address value itself. Registries use both.
 */
function vcardCountry(entity: RdapEntity | undefined): string | null {
    const entry = vcardEntries(entity).find(
        (candidate) => typeof candidate[0] === "string" && candidate[0].toLowerCase() === "adr",
    );

    if (entry === undefined) {
        return null;
    }

    const parameters = entry[1];

    if (typeof parameters === "object" && parameters !== null && "cc" in parameters) {
        const code = (parameters as { cc?: unknown }).cc;

        if (typeof code === "string" && code.length > 0) {
            return code.toUpperCase();
        }
    }

    const address = entry[3];

    if (Array.isArray(address) && typeof address[6] === "string" && address[6].length > 0) {
        return address[6];
    }

    return null;
}

function registrarIanaId(entity: RdapEntity | undefined): string | null {
    const publicId = entity?.publicIds?.find((candidate) =>
        candidate.type?.toLowerCase().includes("iana"),
    );

    return publicId?.identifier ?? null;
}

export type RegistrationInput = {
    readonly payload: RdapDomainPayload;
    /** Host of the RDAP server that answered, so the answer can be traced. */
    readonly source: string | null;
    readonly now: Date;
};

export function toDomainRegistration({
    payload,
    source,
    now,
}: RegistrationInput): DomainRegistration {
    const registrar = findEntity(payload.entities, "registrar");
    const registrant = findEntity(payload.entities, "registrant");
    const abuse = findEntity(registrar?.entities, "abuse");
    const expiresAt = findEvent(payload.events, "expiration");

    return {
        handle: payload.handle ?? null,
        registrar: vcardValue(registrar, "fn"),
        registrarIanaId: registrarIanaId(registrar),
        registeredAt: findEvent(payload.events, "registration"),
        updatedAt: findEvent(payload.events, "last changed"),
        expiresAt,
        daysUntilExpiry:
            expiresAt === null
                ? null
                : Math.floor((Date.parse(expiresAt) - now.getTime()) / MS_PER_DAY),
        statuses: payload.status ?? [],
        nameservers: (payload.nameservers ?? [])
            .map((nameserver) => nameserver.ldhName?.toLowerCase() ?? "")
            .filter((name) => name.length > 0),
        dnssec: payload.secureDNS?.delegationSigned === true,
        registrantCountry: vcardCountry(registrant),
        abuseEmail: vcardValue(abuse, "email"),
        registrarUrl: vcardValue(registrar, "url"),
        source,
    };
}

export function toNetworkInfo(payload: RdapNetworkPayload): NetworkInfo {
    const owner =
        findEntity(payload.entities, "registrant") ??
        findEntity(payload.entities, "administrative") ??
        findEntity(payload.entities, "technical");

    return {
        network: payload.name ?? null,
        org: vcardValue(owner, "fn"),
        country: payload.country?.toUpperCase() ?? null,
    };
}
