import { readVisitorRequest, toCliJson, toCliText } from "@/modules/my-ip/domain/request";
import { cliQuerySchema } from "@/modules/my-ip/validation/cli";
import { resolveRemoteIp } from "@/modules/tools/repository/turnstile";

/**
 * `curl …/api/ip` for the What Is My IP tool. A route handler because the
 * caller is a terminal, not our UI. Nothing leaves this process: no lookups,
 * so a script polling it costs one header read.
 *
 * No CORS header on purpose — answering other sites' scripts would make this
 * deployment a free IP API for their visitors.
 */
export function GET(request: Request): Response {
    const { format } = cliQuerySchema.parse({
        format: new URL(request.url).searchParams.get("format") ?? undefined,
    });
    const visitor = readVisitorRequest(resolveRemoteIp(request.headers), request.headers);
    const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

    if (format === "json") {
        return Response.json(toCliJson(visitor), { headers });
    }

    const text = toCliText(visitor);

    return new Response(text ?? "address unavailable\n", {
        status: text === null ? 503 : 200,
        headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
    });
}
