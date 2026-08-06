"use client";

import { IconClipboardCheck, IconCode, IconDownload, IconWand, IconX } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { useCopyFeedback } from "@/modules/tools/components/use-copy-feedback";
import { copyText, type CopyResult } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { MAX_URL_INPUT_LENGTH, SAMPLE_URL } from "../domain/constants";
import { buildUrlParserJson, createUrlParserExportFile } from "../domain/export";
import { applyParams } from "../domain/params";
import { parseUrl } from "../domain/parse";
import type { UrlParseFailure, UrlPartId, UrlParserView, UrlQueryParam } from "../types";
import { QueryParamsPanel } from "./query-params-panel";
import { UrlPartsPanel } from "./url-parts-panel";

type CopyPanel = UrlPartId | "url" | "json";

type UrlParserWorkbenchProps = {
    initialUrl: string;
    initialView: UrlParserView;
};

export function UrlParserWorkbench({ initialUrl, initialView }: UrlParserWorkbenchProps) {
    const t = useTranslations("urlParser.workbench");
    const tParts = useTranslations("urlParser.parts");
    const tErrors = useTranslations("urlParser.errors");
    const tToast = useTranslations("urlParser.toast");
    const formatter = useFormatter();

    const inputId = useId();
    const statusId = useId();

    const [url, setUrl] = useState(initialUrl);

    // Not capped: this box and the parameter table below it edit one value
    // in both directions, and a `maxLength` that trimmed a paste would make
    // the rows disagree with the address they came from. `parseUrl` refuses
    // past the ceiling; the meter is what makes that visible first.
    const urlLimit = useInputLimit(url.length, MAX_URL_INPUT_LENGTH);
    const [copied, markCopied] = useCopyFeedback<CopyPanel>();

    // Derived during render rather than behind a debounce, and deliberately so:
    // the parse is a single bounded `new URL()`, while the parameter table is a
    // two-way editor whose controlled inputs must show the keystroke that
    // produced them. A settled value would swallow characters as they were
    // typed. Pure and deterministic either way, so the server-rendered pass
    // already carries the result and hydration has nothing to reconcile.
    const parsed = parseUrl(url);
    const suggestion =
        !parsed.ok && parsed.reason === "missing_scheme" ? (parsed.suggestion ?? null) : null;

    function describeFailure(failure: UrlParseFailure): string {
        switch (failure.reason) {
            case "empty":
                return t("statusEmpty");
            case "too_long":
                return tErrors("tooLong", { max: formatter.number(MAX_URL_INPUT_LENGTH) });
            case "relative_path":
                return tErrors("relativePath");
            case "missing_scheme":
                return tErrors("missingScheme", { url: failure.suggestion ?? "" });
            case "invalid_url":
                return tErrors("invalidUrl");
        }
    }

    const status: { tone: StatusTone; message: string } = !parsed.ok
        ? {
              tone: parsed.reason === "empty" ? "idle" : "error",
              message: describeFailure(parsed),
          }
        : parsed.normalized
          ? {
                tone: "success",
                message: t("statusNormalized", {
                    href: parsed.href,
                    params: parsed.params.length,
                }),
            }
          : {
                tone: "success",
                message: t("statusReady", { params: parsed.params.length }),
            };

    function handleParamsChange(next: readonly UrlQueryParam[]) {
        if (!parsed.ok) {
            return;
        }

        setUrl(applyParams(parsed.href, next));
    }

    function reportCopyFailure(failure: Extract<CopyResult, { ok: false }>) {
        const message =
            failure.reason === "empty"
                ? tToast("copyFailedEmpty")
                : failure.reason === "unsupported"
                  ? tToast("copyFailedUnsupported")
                  : tToast("copyFailedDenied");

        toast.error(message);
    }

    async function copyPanel(panel: CopyPanel, text: string, message: string) {
        const result = await copyText(text);

        if (!result.ok) {
            reportCopyFailure(result);

            return;
        }

        markCopied(panel);
        toast.success(message);
    }

    async function handleCopyUrl() {
        // The normalised form is the one a browser will actually request, so
        // that is what the button hands over once the text parses.
        await copyPanel("url", parsed.ok ? parsed.href : url, tToast("copiedUrl"));
    }

    async function handleCopyJson() {
        if (!parsed.ok) {
            return;
        }

        await copyPanel("json", buildUrlParserJson(parsed), tToast("copiedJson"));
    }

    async function handleCopyPart(part: UrlPartId) {
        if (!parsed.ok) {
            return;
        }

        await copyPanel(part, parsed.parts[part], tToast("copiedPart", { part: tParts(part) }));
    }

    function handleDownload() {
        if (!parsed.ok) {
            return;
        }

        const exported = createUrlParserExportFile({ parsed, generatedAt: new Date() });

        try {
            saveFile(exported);
            toast.success(tToast("downloaded", { filename: exported.filename }));
        } catch (caught) {
            logEvent("error", "url_parser.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    return (
        <Card className="relative overflow-hidden [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(6)]">
            <span
                aria-hidden="true"
                className="via-primary/45 pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
            />

            <CardHeader>
                <CardTitle className="text-lg">{t("title")}</CardTitle>
                <CardDescription>{t("description")}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={inputId} className="text-muted-foreground text-xs">
                            <span className="leading-[1.3]">{t("inputLabel")}</span>
                        </Label>
                        <div className="flex items-center gap-1.5">
                            <InputLimitMeter reading={urlLimit} />
                            <Button variant="ghost" size="sm" onClick={() => setUrl(SAMPLE_URL)}>
                                <IconWand className="size-3.5" stroke={1.8} aria-hidden="true" />
                                {t("example")}
                            </Button>
                        </div>
                    </div>

                    <div className="relative">
                        <Input
                            id={inputId}
                            value={url}
                            onChange={(event) => setUrl(event.target.value)}
                            placeholder={t("placeholder")}
                            spellCheck={false}
                            autoComplete="off"
                            autoCapitalize="off"
                            aria-describedby={statusId}
                            inputMode="url"
                            className="bg-card/70 h-11 rounded-xl pr-10 font-mono text-[0.8125rem]"
                        />
                        <button
                            type="button"
                            onClick={() => setUrl("")}
                            disabled={url.length === 0}
                            aria-label={t("clear")}
                            className={cn(
                                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                                "text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2",
                            )}
                        >
                            <IconX className="size-4" stroke={1.9} aria-hidden="true" />
                        </button>
                    </div>

                    <StatusStrip
                        id={statusId}
                        tone={status.tone}
                        message={status.message}
                        // The normalised href goes in this line, and a URL is
                        // one unbreakable word: without these it pushes the
                        // card wider than the viewport at 390px.
                        className="[&>span]:min-w-0 [&>span]:wrap-break-word"
                    />

                    {suggestion !== null && (
                        <div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setUrl(suggestion)}
                                className="max-w-full"
                            >
                                <span className="truncate">
                                    {t("useSuggestion", { url: suggestion })}
                                </span>
                            </Button>
                        </div>
                    )}
                </div>

                <Tabs defaultValue={initialView}>
                    <TabsList className="w-full max-w-72">
                        <TabsTrigger value="params">{t("tabs.params")}</TabsTrigger>
                        <TabsTrigger value="detail">{t("tabs.detail")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="params" className="pt-4">
                        <QueryParamsPanel
                            params={parsed.ok ? parsed.params : null}
                            onChange={handleParamsChange}
                        />
                    </TabsContent>

                    <TabsContent value="detail" className="pt-4">
                        <UrlPartsPanel
                            parts={parsed.ok ? parsed.parts : null}
                            copied={copied === "url" || copied === "json" ? null : copied}
                            onCopy={handleCopyPart}
                        />
                    </TabsContent>
                </Tabs>

                <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyUrl}
                        disabled={url.length === 0}
                    >
                        <IconClipboardCheck className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("copyUrl")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyJson}
                        disabled={!parsed.ok}
                    >
                        <IconCode className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("copyJson")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                        disabled={!parsed.ok}
                    >
                        <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("download")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
