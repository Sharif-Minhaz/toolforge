"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import { copyText } from "@/modules/tools/domain/clipboard";
import type { HighlightLanguage } from "@/modules/tools/domain/highlight";

import { GRAPHQL_EXECUTION_PREFIX } from "../domain/constants";

type SnippetPanelProps = {
    serverKey: string;
    starterQuery: string;
};

const TARGETS = ["curl", "fetch", "apollo"] as const;

type Target = (typeof TARGETS)[number];

const LANGUAGES: Record<Target, HighlightLanguage> = {
    curl: "shell",
    fetch: "javascript",
    apollo: "javascript",
};

/**
 * The same request, in the three shapes people actually paste.
 *
 * Not decoration: the commonest first question about a hosted GraphQL endpoint
 * is "what exactly do I POST to it", and answering it with three lines of copy
 * rather than three copyable snippets means everybody re-derives the same
 * `{"query": …}` envelope. Each one is built from *this* server's address and
 * *this* document's starter query, so it runs as pasted.
 *
 * The origin is read behind `useIsHydrated`, per the rule in *Platform APIs That
 * Read the Host*: the server has no reliable idea which host the reader typed —
 * a preview deployment, a custom domain and localhost are all the same render —
 * so the absolute URL appears a tick after hydration and the path alone is shown
 * until then. A relative address in a `curl` would be wrong; a mismatched one
 * would break hydration.
 */
export function SnippetPanel({ serverKey, starterQuery }: SnippetPanelProps) {
    const t = useTranslations("graphqlServer.snippets");
    const tToast = useTranslations("graphqlServer.toast");
    const hydrated = useIsHydrated();
    const [target, setTarget] = useState<Target>("curl");
    const [copied, setCopied] = useState(false);

    const path = `${GRAPHQL_EXECUTION_PREFIX}/${serverKey}`;
    const endpoint = hydrated ? `${window.location.origin}${path}` : path;
    const snippet = buildSnippet(target, endpoint, starterQuery);

    async function copy() {
        const result = await copyText(snippet);

        if (result.ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2_000);

            return;
        }

        logEvent("error", "graphql_server.snippet_copy_failed", {
            error: describeError(result.reason),
        });
        toast.error(tToast("copyFailed"));
    }

    return (
        <section aria-labelledby="snippets-heading" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <h3
                    id="snippets-heading"
                    className="text-foreground text-sm leading-[1.3] font-semibold"
                >
                    {t("title")}
                </h3>
                <p className="text-muted-foreground max-w-[68ch] text-xs leading-relaxed">
                    {t("description")}
                </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                    role="tablist"
                    aria-label={t("title")}
                    className="bg-muted/60 inline-flex rounded-xl p-1"
                >
                    {TARGETS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            role="tab"
                            aria-selected={target === option}
                            onClick={() => {
                                setTarget(option);
                                setCopied(false);
                            }}
                            className={cn(
                                "focus-visible:ring-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                                target === option
                                    ? "bg-card text-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {t(option)}
                        </button>
                    ))}
                </div>

                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={copy}
                >
                    <CopyIconSwap copied={copied} />
                    {copied ? t("copied") : t("copy")}
                </Button>
            </div>

            <CodeBlock code={snippet} language={LANGUAGES[target]} className="max-h-96" />
        </section>
    );
}

/**
 * One request, three notations.
 *
 * The query is embedded as a **JSON string** in every one of them rather than
 * pasted as a heredoc, because that is what the endpoint actually reads and it
 * is the part people get wrong: a GraphQL request body is `{"query": "…"}`, and
 * a newline inside it has to be escaped. `JSON.stringify` does exactly that, so
 * these are correct by construction rather than by careful quoting.
 */
function buildSnippet(target: Target, endpoint: string, query: string): string {
    const body = JSON.stringify({ query });

    if (target === "curl") {
        // Single-quoted, and the body is JSON so it can only contain a `'` if
        // the query does. `--data-raw` rather than `-d`, which would strip
        // newlines the body no longer has but which reads as a promise it does
        // not keep.
        return [
            `curl ${endpoint} \\`,
            `  -H 'content-type: application/json' \\`,
            `  --data-raw '${body.replaceAll("'", `'\\''`)}'`,
        ].join("\n");
    }

    if (target === "fetch") {
        return [
            `const response = await fetch(${JSON.stringify(endpoint)}, {`,
            `  method: "POST",`,
            `  headers: { "content-type": "application/json" },`,
            `  body: JSON.stringify({`,
            `    query: \`${query.trimEnd()}\`,`,
            `  }),`,
            `});`,
            ``,
            `const { data, errors } = await response.json();`,
        ].join("\n");
    }

    return [
        `import { ApolloClient, InMemoryCache, gql } from "@apollo/client";`,
        ``,
        `const client = new ApolloClient({`,
        `  uri: ${JSON.stringify(endpoint)},`,
        `  cache: new InMemoryCache(),`,
        `});`,
        ``,
        `const { data } = await client.query({`,
        `  query: gql\`${query.trimEnd()}\`,`,
        `});`,
    ].join("\n");
}
