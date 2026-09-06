import {
    findEntity,
    findEvent,
    registrarIanaId,
    vcardCountry,
    vcardValue,
    type RdapEntity,
    type RdapEvent,
} from "@/modules/tools/domain/rdap";
import type { DomainRegistration } from "../types";

/**
 * An RDAP domain payload reshaped into the flat record the registration panel
 * renders.
 *
 * The jCard readers moved to `tools/domain/rdap.ts` when the IP & Route Globe
 * needed the network half of the same format. What stayed is this tool's
 * mapping — which roles it looks for, and which events it calls a registration
 * date.
 */

export type RdapDomainPayload = {
    readonly handle?: string;
    readonly ldhName?: string;
    readonly status?: readonly string[];
    readonly events?: readonly RdapEvent[];
    readonly nameservers?: readonly { readonly ldhName?: string }[];
    readonly secureDNS?: { readonly delegationSigned?: boolean; readonly zoneSigned?: boolean };
    readonly entities?: readonly RdapEntity[];
};

const MS_PER_DAY = 86_400_000;

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
