import { handleGraphqlRequest } from "@/modules/graphql-server/repository/handle";

/**
 * Where a GraphQL server answers.
 *
 * One address and three methods, which is the whole shape of GraphQL over HTTP:
 * `POST` for anything, `GET` for a read, `OPTIONS` for the preflight a browser
 * sends before the first cross-origin `POST`. There is no path below the key —
 * a GraphQL endpoint has exactly one URL and carries its own verbs in the query
 * document, which is the most visible difference from its REST sibling at `/j`.
 *
 * All the reasoning — the security headers, the gate ordering, the rate limit,
 * the media-type negotiation, the logging — lives in `handleGraphqlRequest`, so
 * this file is plumbing on purpose. Its relatives at `/q/[slug]`, `/s/[slug]`,
 * `/m/[serverKey]` and `/j/[serverKey]` follow the same rule.
 */

/** Every request must reach the database, or a just-written record serves stale. */
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ serverKey: string }>;
};

async function handle(request: Request, context: RouteContext): Promise<Response> {
    const { serverKey } = await context.params;

    return handleGraphqlRequest(request, { serverKey });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext): Promise<Response> {
    return handle(request, context);
}
