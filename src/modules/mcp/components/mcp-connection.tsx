import { getTranslations } from "next-intl/server";

import { ArticleSection, PROSE, PROSE_TEXT } from "@/modules/tools/components/article-section";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { ServerBaseUrl } from "@/modules/tools/components/server-base-url";

import { buildProbeCommand, buildTokenCommand, MCP_CLIENT_RECIPES } from "../domain/clients";
import { MCP_ENDPOINT_PATH } from "../domain/constants";

type ConnectionProps = {
    /** Absolute endpoint, resolved on the server for the snippets. */
    endpoint: string;
    /** False when this deployment has no token configured. */
    tokenConfigured: boolean;
    /** False when the limiter cannot run, which makes the endpoint refuse. */
    quotaConfigured: boolean;
};

/**
 * Everything somebody needs to point a client at this deployment.
 *
 * The address appears twice on purpose, and the two are not redundant. The
 * copyable field at the top comes from `window.location` after hydration, so it
 * is right on a preview deployment, a custom domain and localhost alike — the
 * rule from *Platform APIs That Read the Host*. The snippets below it are
 * server-rendered from the canonical site URL, because a shell command has to
 * be complete before it is copied and a half-built one is worse than a slightly
 * wrong host.
 *
 * The two configuration warnings sit above the instructions rather than in the
 * article underneath. A reader whose deployment cannot serve this endpoint must
 * learn that before they spend five minutes editing a config file, not after.
 */
export async function McpConnection({
    endpoint,
    tokenConfigured,
    quotaConfigured,
}: ConnectionProps) {
    // Two namespaces on purpose: the headings are the same strings the table
    // of contents shows, so they are read from where the contents reads them.
    const [t, tSection] = await Promise.all([
        getTranslations("mcp.connect"),
        getTranslations("mcp.article"),
    ]);

    return (
        <div className="flex flex-col gap-8">
            {!quotaConfigured && (
                <p
                    role="status"
                    className="border-destructive/45 bg-destructive/8 text-foreground rounded-xl border px-4 py-3 text-sm leading-6"
                >
                    {t("quotaMissing")}
                </p>
            )}

            <ArticleSection id="endpoint" title={tSection("endpoint.title")}>
                <div className={PROSE}>
                    <p>{t("endpointBody")}</p>
                </div>
                <ServerBaseUrl prefix="/api" serverKey="mcp" className="mt-4" />
                <p className={`${PROSE_TEXT} mt-3 text-sm`}>{t("endpointTransport")}</p>
            </ArticleSection>

            <ArticleSection id="clients" title={tSection("clients.title")}>
                <div className={PROSE}>
                    <p>{t("clientsBody")}</p>
                </div>

                <div className="mt-5 flex flex-col gap-6">
                    {MCP_CLIENT_RECIPES.map((recipe) => (
                        <div key={recipe.id} className="flex min-w-0 flex-col gap-2">
                            <h3 className="text-sm font-semibold">
                                {t(`client.${recipe.id}.name`)}
                            </h3>
                            <p className={`${PROSE_TEXT} text-sm`}>
                                {t(`client.${recipe.id}.hint`)}
                            </p>
                            <CodeBlock code={recipe.snippet(endpoint)} language={recipe.language} />
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex min-w-0 flex-col gap-2">
                    <h3 className="text-sm font-semibold">{t("probeTitle")}</h3>
                    <p className={`${PROSE_TEXT} text-sm`}>{t("probeBody")}</p>
                    <CodeBlock code={buildProbeCommand(endpoint)} language="shell" />
                </div>
            </ArticleSection>

            <ArticleSection id="token" title={tSection("token.title")}>
                <div className={PROSE}>
                    <p>{t("tokenBody")}</p>
                    <p>{t("tokenScope")}</p>
                </div>

                <p
                    role="status"
                    className={
                        tokenConfigured
                            ? "border-border/70 bg-card/60 text-muted-foreground mt-4 rounded-xl border px-4 py-3 text-sm leading-6"
                            : "text-foreground mt-4 rounded-xl border border-amber-500/45 bg-amber-500/8 px-4 py-3 text-sm leading-6"
                    }
                >
                    {tokenConfigured ? t("tokenPresent") : t("tokenAbsent")}
                </p>

                <div className="mt-5 flex min-w-0 flex-col gap-2">
                    <h3 className="text-sm font-semibold">{t("tokenMintTitle")}</h3>
                    <CodeBlock code={buildTokenCommand()} language="shell" />
                </div>

                <div className="mt-6 flex min-w-0 flex-col gap-6">
                    {MCP_CLIENT_RECIPES.filter((recipe) => recipe.withToken !== null).map(
                        (recipe) => (
                            <div key={recipe.id} className="flex min-w-0 flex-col gap-2">
                                <h3 className="text-sm font-semibold">
                                    {t(`client.${recipe.id}.name`)}
                                </h3>
                                <CodeBlock
                                    code={recipe.withToken?.(endpoint) ?? ""}
                                    language={recipe.language}
                                />
                            </div>
                        ),
                    )}
                </div>

                <p className={`${PROSE_TEXT} mt-5 text-sm`}>{t("tokenRotate")}</p>
                <p className={`${PROSE_TEXT} mt-2 text-sm`}>
                    {t("tokenPath", { path: MCP_ENDPOINT_PATH })}
                </p>
            </ArticleSection>
        </div>
    );
}
