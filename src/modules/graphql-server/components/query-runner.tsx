"use client";

import { IconArrowBackUp, IconLoader2, IconPlayerPlay } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useResultScroll } from "@/modules/tools/components/use-result-scroll";

import { GRAPHQL_EXECUTION_PREFIX, MAX_QUERY_LENGTH } from "../domain/constants";

type QueryRunnerProps = {
    serverKey: string;
    starterQuery: string;
    isPaused: boolean;
};

type Answer = {
    readonly status: number;
    readonly ms: number;
    readonly cost: number;
    readonly depth: number;
    readonly body: string;
};

/**
 * A query editor that posts to the **real endpoint**, from the browser.
 *
 * That is the whole design decision here, and the obvious alternative is worse
 * in a way that would not show up for weeks. A Server Action running the query
 * with the owner's privileges would be a *different client* from every other
 * one: it would skip the transport rules, skip the rate limit, and skip the
 * `GET`/`POST` split — so a query that worked on this page could fail from
 * `curl`, and the studio would be the one place the endpoint's own rules did not
 * apply. Going out through `fetch` costs a round trip and buys the guarantee
 * that what a reader tests here is exactly what their code will get, headers
 * included.
 *
 * The response is shown with the two numbers the guard computed beside it.
 * Watching the cost climb as one more relation is nested is the difference
 * between "the API randomly 400s" and understanding what is expensive — which is
 * the whole reason those headers are exposed in the first place.
 */
export function QueryRunner({ serverKey, starterQuery, isPaused }: QueryRunnerProps) {
    const t = useTranslations("graphqlServer.playground");
    const queryId = useId();
    const variablesId = useId();
    const statusId = useId();

    const [query, setQuery] = useState(starterQuery);
    const [variables, setVariables] = useState("");
    const [answer, setAnswer] = useState<Answer | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    const { ref: resultRef, scrollToResult } = useResultScroll<HTMLDivElement>();
    // A press cannot be undone mid-flight, and two overlapping runs would let an
    // older answer land after a newer one. One at a time is also politer to the
    // rate limit the endpoint is about to charge.
    const inFlight = useRef(false);

    const queryLimit = useInputLimit(query.length, MAX_QUERY_LENGTH);
    const tooLong = query.length > MAX_QUERY_LENGTH;
    const canRun = !running && !tooLong && query.trim().length > 0;

    async function run() {
        if (!canRun || inFlight.current) {
            return;
        }

        let parsedVariables: unknown = undefined;

        if (variables.trim().length > 0) {
            try {
                parsedVariables = JSON.parse(variables);
            } catch {
                // Refused before the page moves, so a typo in the variables box
                // is answered beside the box rather than at an empty result
                // slot the reader has to scroll back from.
                setFailure(t("invalidVariables"));

                return;
            }

            if (typeof parsedVariables !== "object" || parsedVariables === null) {
                setFailure(t("invalidVariables"));

                return;
            }
        }

        setFailure(null);
        setRunning(true);
        inFlight.current = true;

        const startedAt = Date.now();

        try {
            const response = await fetch(`${GRAPHQL_EXECUTION_PREFIX}/${serverKey}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    query,
                    ...(parsedVariables === undefined ? {} : { variables: parsedVariables }),
                }),
            });
            const body = await response.text();

            setAnswer({
                status: response.status,
                ms: Date.now() - startedAt,
                cost: Number(response.headers.get("x-graphql-cost") ?? "0"),
                depth: Number(response.headers.get("x-graphql-depth") ?? "0"),
                body: pretty(body),
            });
            scrollToResult();
        } catch (caught) {
            logEvent("error", "graphql_server.query_run_failed", {
                error: describeError(caught),
            });
            setFailure(t("requestFailed"));
        } finally {
            setRunning(false);
            inFlight.current = false;
        }
    }

    const status: { tone: StatusTone; message: string } | null = tooLong
        ? { tone: "error", message: t("queryTooLong", { limit: MAX_QUERY_LENGTH }) }
        : failure !== null
          ? { tone: "error", message: failure }
          : isPaused
            ? { tone: "warning", message: t("pausedHint") }
            : null;

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <h3 className="text-foreground text-sm leading-[1.3] font-semibold">
                    {t("title")}
                </h3>
                <p className="text-muted-foreground max-w-[68ch] text-xs leading-relaxed">
                    {t("description")}
                </p>
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-[3fr_2fr]">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={queryId} className="text-xs">
                            {t("queryLabel")}
                        </Label>
                        <InputLimitMeter reading={queryLimit} />
                    </div>
                    {/*
                        Never `maxLength`: a query is a content box, and
                        truncating a paste mid-selection is not a shorter query,
                        it is a syntax error. The meter says so and the Run
                        button is disabled instead.
                    */}
                    <CodeEditor
                        id={queryId}
                        value={query}
                        language="graphql"
                        ariaDescribedBy={status === null ? undefined : statusId}
                        onChange={setQuery}
                        className="min-h-64"
                    />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={variablesId} className="text-xs">
                        {t("variablesLabel")}
                    </Label>
                    <CodeEditor
                        id={variablesId}
                        value={variables}
                        language="json"
                        placeholder={t("variablesPlaceholder")}
                        onChange={setVariables}
                        className="min-h-64"
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Button type="button" disabled={!canRun} onClick={run} className="gap-1.5">
                    {running ? (
                        <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <IconPlayerPlay className="size-4" stroke={2} aria-hidden="true" />
                    )}
                    {running ? t("running") : t("run")}
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                        setQuery(starterQuery);
                        setVariables("");
                        setFailure(null);
                    }}
                >
                    <IconArrowBackUp className="size-3.5" stroke={2} aria-hidden="true" />
                    {t("reset")}
                </Button>

                {status !== null ? (
                    <StatusStrip id={statusId} tone={status.tone} message={status.message} />
                ) : null}
            </div>

            <div ref={resultRef} className="flex min-w-0 scroll-mt-6 flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase">
                        {t("responseLabel")}
                    </p>
                    {answer !== null ? (
                        <p className="flex flex-wrap gap-x-3 text-[0.6875rem] tabular-nums">
                            <span
                                className={cn(
                                    answer.status >= 400
                                        ? "text-destructive"
                                        : "text-brand-emerald",
                                )}
                            >
                                {t("statusLine", { status: answer.status, ms: answer.ms })}
                            </span>
                            <span className="text-muted-foreground">
                                {t("costLine", { cost: answer.cost, depth: answer.depth })}
                            </span>
                        </p>
                    ) : null}
                </div>

                <CodeBlock
                    code={answer?.body ?? ""}
                    language="json"
                    placeholder={t("responseEmpty")}
                    className="max-h-112"
                />
            </div>
        </div>
    );
}

/**
 * The response body, indented for reading.
 *
 * Falls back to the raw text rather than throwing: a body this cannot parse is
 * one the reader most needs to see, since it means something upstream answered
 * with something other than the JSON this endpoint promises.
 */
function pretty(body: string): string {
    try {
        return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
        return body;
    }
}
