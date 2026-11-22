/**
 * Where the public services — mock, JSON and GraphQL servers, short links —
 * answer: on a subdomain of their own (`mock.minhaz.bond/<key>`), as well as
 * under their path prefix on the main site (`/m/<key>`).
 *
 * The path form is never retired. Every link already handed out uses it, and it
 * is the only form a host outside the domain can answer — a `*.vercel.app`
 * deployment, or the main site after the domain lapses. So an address is
 * *shown* in subdomain form only when the page showing it was itself served
 * from inside the domain; anywhere else the reader gets the path form that host
 * can actually answer. Leaving the variable blank turns subdomains off.
 *
 * `NEXT_PUBLIC_` on purpose: it is inlined at build, so the proxy, a server
 * page and a client island all read the same constant and no render can
 * disagree with its hydration. Changing it needs a redeploy, which changing the
 * DNS behind it does anyway.
 */

/** A service that can answer on `<subdomain>.<domain>` and on `<prefix>` alike. */
export type PublicService = {
    readonly subdomain: string;
    readonly prefix: string;
};

export function parseServiceDomain(raw: string | undefined): string | null {
    const value = (raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, "");

    return value.length > 0 ? value : null;
}

export const SERVICE_DOMAIN = parseServiceDomain(process.env.NEXT_PUBLIC_SERVICE_DOMAIN);

/** A `Host` header or `location.host` without its port. */
function hostnameOf(host: string): string {
    return host.trim().toLowerCase().replace(/:\d+$/, "");
}

/** The bare hostname a service answers on, or `null` when subdomains are off. */
export function serviceHostname(
    service: PublicService,
    domain: string | null = SERVICE_DOMAIN,
): string | null {
    return domain === null ? null : `${service.subdomain}.${domain}`;
}

export function isServiceHost(
    host: string | null,
    service: PublicService,
    domain: string | null = SERVICE_DOMAIN,
): boolean {
    const expected = serviceHostname(service, domain);

    return expected !== null && host !== null && hostnameOf(host) === expected;
}

function isInsideDomain(host: string | null, domain: string | null): domain is string {
    if (domain === null || host === null) {
        return false;
    }

    const name = hostnameOf(host);

    return name === domain || name.endsWith(`.${domain}`);
}

/**
 * The absolute address a service's keys hang off, with no trailing slash:
 * `https://mock.minhaz.bond`, or `<origin>/m` when `host` — the host the page
 * was served from — is outside the domain.
 */
export function serviceBase(
    service: PublicService,
    origin: string,
    host: string | null,
    domain: string | null = SERVICE_DOMAIN,
): string {
    if (isInsideDomain(host, domain)) {
        return `https://${service.subdomain}.${domain}`;
    }

    return `${origin.replace(/\/$/, "")}${service.prefix}`;
}

/**
 * The internal path a request to a service subdomain is rewritten to, or `null`
 * when `host` is not one. `mock.<domain>/abc/users` → `/m/abc/users`.
 */
export function routeServiceHost(
    host: string | null,
    pathname: string,
    services: readonly PublicService[],
    domain: string | null = SERVICE_DOMAIN,
): string | null {
    const service = services.find((candidate) => isServiceHost(host, candidate, domain));

    if (service === undefined) {
        return null;
    }

    return pathname === "/" ? service.prefix : `${service.prefix}${pathname}`;
}
