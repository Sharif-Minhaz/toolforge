"use client";

import {
    IconAlertTriangle,
    IconArrowBackUp,
    IconCheck,
    IconDeviceFloppy,
    IconKey,
    IconLoader2,
    IconPlayerPause,
    IconPlayerPlay,
    IconTrash,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { copyText } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";

import {
    clearLogs,
    deleteServer,
    forgetServer,
    getRequestLogs,
    renameServer,
    replaceDocument,
    resetDocument,
    rotateRecoveryKey,
    setServerPaused,
} from "../actions/servers";
import { SERVER_NAME_LENGTH } from "../domain/constants";
import { exceedsUploadLimit } from "../domain/document";
import {
    DOCUMENT_PROBLEMS,
    type ActionProblem,
    type DocumentFailure,
    type JsonServerDetail,
    type RequestLogRow,
} from "../types";
import { ServerBaseUrl } from "./base-url";
import { DocumentEditor } from "./document-editor";
import { LogTable } from "./log-table";
import { RouteTable } from "./route-table";
import { UsageBar } from "./usage-bar";

type ServerWorkbenchProps = {
    detail: JsonServerDetail;
};

const TABS = ["routes", "data", "logs", "settings"] as const;

type Tab = (typeof TABS)[number];

/**
 * Everything on `/json/[serverId]` that reacts.
 *
 * The detail arrives from the server as a prop and is replaced by whatever an
 * action returns. There is no polling and no effect keeping anything in step:
 * every mutation here round-trips, and the one thing that changes without this
 * page doing anything — a client calling the API — is what the Logs tab's
 * Refresh button is for.
 *
 * **Logs load on the tab press, not on mount.** They are the one panel whose
 * contents are time-relative, and rendering "12 seconds ago" during a server
 * pass and again during hydration is two different answers to one question —
 * the hydration trap from *Platform APIs That Read the Host*, arriving through
 * the clock rather than through `Intl`. Loading them from an event handler means
 * they are only ever rendered in the browser, where there is one clock to ask.
 */
export function ServerWorkbench({ detail: initial }: ServerWorkbenchProps) {
    const t = useTranslations("jsonServer.workbench");
    const tErrors = useTranslations("jsonServer.errors");
    const tRecovery = useTranslations("jsonServer.recovery");
    const tToast = useTranslations("jsonServer.toast");
    const tTabs = useTranslations("jsonServer.tabs");
    const router = useRouter();
    const nameId = useId();

    const [detail, setDetail] = useState(initial);
    const [tab, setTab] = useState<Tab>("routes");
    const [name, setName] = useState(initial.name);
    const [document, setDocument] = useState(initial.document);
    const [failure, setFailure] = useState<ActionProblem | null>(null);
    const [documentFailure, setDocumentFailure] = useState<DocumentFailure | null>(null);
    const [logs, setLogs] = useState<readonly RequestLogRow[]>([]);
    const [logsLoaded, setLogsLoaded] = useState(false);
    const [issuedKey, setIssuedKey] = useState<string | null>(null);
    const [keyCopied, setKeyCopied] = useState(false);
    const [confirming, setConfirming] = useState<"delete" | "forget" | "rotate" | null>(null);
    const [pending, startTransition] = useTransition();

    const serverId = detail.id;
    const documentDirty = document !== detail.document;
    // The editor already refuses this under the box; the button must agree,
    // or a reader is told it is too large and offered Save in the same breath.
    const documentTooLarge = exceedsUploadLimit(document);
    // Caps at `maxLength`; `checkServerName` still owns what a usable name is.
    const nameLimit = useInputLimit(name.length, SERVER_NAME_LENGTH.max);

    function run(action: () => Promise<void>) {
        setFailure(null);
        startTransition(action);
    }

    function loadLogs() {
        run(async () => {
            setLogs(await getRequestLogs({ serverId }));
            setLogsLoaded(true);
        });
    }

    function openTab(next: Tab) {
        setTab(next);

        if (next === "logs" && !logsLoaded) {
            loadLogs();
        }
    }

    function save() {
        setDocumentFailure(null);

        run(async () => {
            const result = await replaceDocument({ serverId, document });

            if (!result.ok) {
                if (isDocumentProblem(result.reason)) {
                    setDocumentFailure(result as DocumentFailure);
                } else {
                    setFailure(result.reason as ActionProblem);
                }

                return;
            }

            setDetail(result.detail);
            setDocument(result.detail.document);
            toast.success(tToast("saved"));
            router.refresh();
        });
    }

    function reset() {
        run(async () => {
            const result = await resetDocument({ serverId });

            if (!result.ok) {
                setFailure(result.reason as ActionProblem);

                return;
            }

            setDetail(result.detail);
            setDocument(result.detail.document);
            setDocumentFailure(null);
            toast.success(tToast("reset"));
            router.refresh();
        });
    }

    function togglePause() {
        run(async () => {
            const next = !detail.isPaused;
            const result = await setServerPaused({ serverId, isPaused: next });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setDetail((held) => ({ ...held, isPaused: next }));
            toast.success(next ? tToast("paused") : tToast("resumed"));
            router.refresh();
        });
    }

    function rename() {
        run(async () => {
            const result = await renameServer({ serverId, name });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setDetail((held) => ({ ...held, name: name.trim() }));
            toast.success(tToast("renamed"));
            router.refresh();
        });
    }

    function rotate() {
        setConfirming(null);

        run(async () => {
            const result = await rotateRecoveryKey({ serverId });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setIssuedKey(result.recoveryKey);
            setKeyCopied(false);
            toast.success(tToast("rotated"));
        });
    }

    function remove(kind: "delete" | "forget") {
        setConfirming(null);

        run(async () => {
            const result =
                kind === "delete"
                    ? await deleteServer({ serverId })
                    : await forgetServer({ serverId });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            toast.success(kind === "delete" ? tToast("deleted") : tToast("forgotten"));
            router.push("/json");
            router.refresh();
        });
    }

    async function copyKey() {
        if (issuedKey === null) {
            return;
        }

        const result = await copyText(issuedKey);

        if (result.ok) {
            setKeyCopied(true);

            return;
        }

        logEvent("error", "json_server.recovery_copy_failed", {
            error: describeError(result.reason),
        });
        toast.error(tToast("copyFailed"));
    }

    function download() {
        try {
            saveFile({
                filename: `${detail.key}-db.json`,
                mimeType: "application/json",
                // The *saved* document, not the editor's text: downloading what
                // has not been saved would hand somebody a file their API is
                // not serving.
                content: detail.document,
            });
        } catch (caught) {
            logEvent("error", "json_server.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const status: { tone: StatusTone; message: string } | null =
        failure !== null ? { tone: "error", message: tErrors(failure) } : null;

    return (
        <div className="flex min-w-0 flex-col gap-6">
            <section className="border-border/70 bg-card flex flex-col gap-4 rounded-2xl border p-5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-foreground text-lg leading-[1.3] font-semibold">
                            {detail.name}
                        </h2>
                        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                            {t("subtitle")}
                        </p>
                    </div>

                    <Button
                        type="button"
                        size="sm"
                        variant={detail.isPaused ? "default" : "outline"}
                        className="shrink-0 gap-1.5"
                        disabled={pending}
                        onClick={togglePause}
                    >
                        {detail.isPaused ? (
                            <IconPlayerPlay className="size-3.5" stroke={1.9} aria-hidden="true" />
                        ) : (
                            <IconPlayerPause className="size-3.5" stroke={1.9} aria-hidden="true" />
                        )}
                        {detail.isPaused ? t("resume") : t("pause")}
                    </Button>
                </div>

                <ServerBaseUrl serverKey={detail.key} />

                {detail.isPaused ? (
                    <p className="text-brand-amber flex items-start gap-1.5 text-[0.6875rem] leading-normal">
                        <IconAlertTriangle
                            className="mt-px size-3.5 shrink-0"
                            stroke={2}
                            aria-hidden="true"
                        />
                        {t("pausedNote")}
                    </p>
                ) : null}

                <UsageBar usage={detail.usage} verbose />

                {status !== null ? (
                    <StatusStrip tone={status.tone} message={status.message} />
                ) : null}
            </section>

            <div role="tablist" aria-label={t("tabsLabel")} className="flex flex-wrap gap-1">
                {TABS.map((option) => (
                    <button
                        key={option}
                        type="button"
                        role="tab"
                        aria-selected={tab === option}
                        onClick={() => openTab(option)}
                        className={cn(
                            "focus-visible:ring-ring rounded-xl px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                            tab === option
                                ? "bg-card text-foreground border-border/70 border shadow-xs"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {tTabs(option)}
                    </button>
                ))}
            </div>

            {tab === "routes" ? (
                <RouteTable
                    routes={detail.routes}
                    resources={detail.resources}
                    writesLocked={detail.usage.full}
                />
            ) : null}

            {tab === "data" ? (
                <section className="flex min-w-0 flex-col gap-3">
                    <p className="text-muted-foreground max-w-[68ch] text-xs leading-relaxed">
                        {t("dataDescription")}
                    </p>

                    <DocumentEditor
                        value={document}
                        onChange={(next) => {
                            setDocument(next);
                            setDocumentFailure(null);
                        }}
                        failure={documentFailure}
                        disabled={pending}
                    />

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            className="gap-1.5"
                            disabled={pending || !documentDirty || documentTooLarge}
                            onClick={save}
                        >
                            {pending ? (
                                <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                                <IconDeviceFloppy
                                    className="size-3.5"
                                    stroke={1.9}
                                    aria-hidden="true"
                                />
                            )}
                            {t("save")}
                        </Button>

                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={pending}
                            onClick={download}
                        >
                            {t("download")}
                        </Button>

                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="gap-1.5"
                            disabled={pending}
                            onClick={reset}
                        >
                            <IconArrowBackUp className="size-3.5" stroke={1.9} aria-hidden="true" />
                            {t("reset")}
                        </Button>

                        {documentDirty ? (
                            <StatusStrip tone="warning" message={t("unsaved")} />
                        ) : null}
                    </div>
                </section>
            ) : null}

            {tab === "logs" ? (
                <LogTable
                    rows={logs}
                    busy={pending}
                    onRefresh={loadLogs}
                    onClear={() =>
                        run(async () => {
                            await clearLogs({ serverId });
                            setLogs([]);
                        })
                    }
                />
            ) : null}

            {tab === "settings" ? (
                <section className="flex flex-col gap-5">
                    <div className="flex max-w-md flex-col gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor={nameId} className="text-xs">
                                {t("nameLabel")}
                            </Label>
                            <InputLimitMeter reading={nameLimit} />
                        </div>
                        <div className="flex gap-2">
                            <Input
                                id={nameId}
                                maxLength={SERVER_NAME_LENGTH.max}
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                disabled={pending}
                                autoComplete="off"
                            />
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={pending || name.trim() === detail.name}
                                onClick={rename}
                            >
                                {t("rename")}
                            </Button>
                        </div>
                    </div>

                    <div className="border-border/70 flex flex-col gap-2 rounded-2xl border p-4">
                        <h3 className="text-foreground flex items-center gap-2 text-xs leading-[1.3] font-semibold">
                            <IconKey
                                className="text-muted-foreground size-4 shrink-0"
                                stroke={1.75}
                                aria-hidden="true"
                            />
                            {tRecovery("rotateTitle")}
                        </h3>
                        <p className="text-muted-foreground max-w-[60ch] text-xs leading-relaxed">
                            {tRecovery("rotateDescription")}
                        </p>

                        {issuedKey !== null ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <code className="border-border/70 bg-muted/40 text-foreground rounded-xl border px-3 py-2 font-mono text-sm tracking-[0.14em] select-all">
                                    {issuedKey}
                                </code>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5"
                                    onClick={copyKey}
                                >
                                    <CopyIconSwap copied={keyCopied} />
                                    {keyCopied ? tRecovery("copied") : tRecovery("copy")}
                                </Button>
                            </div>
                        ) : confirming === "rotate" ? (
                            <ConfirmRow
                                label={tRecovery("rotateConfirm")}
                                confirmLabel={tRecovery("rotateAction")}
                                onCancel={() => setConfirming(null)}
                                onConfirm={rotate}
                                disabled={pending}
                            />
                        ) : (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-1 w-fit"
                                disabled={pending}
                                onClick={() => setConfirming("rotate")}
                            >
                                {tRecovery("rotateAction")}
                            </Button>
                        )}
                    </div>

                    <div className="border-border/70 flex flex-col gap-3 rounded-2xl border p-4">
                        <h3 className="text-foreground text-xs leading-[1.3] font-semibold">
                            {t("dangerTitle")}
                        </h3>

                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-muted-foreground max-w-[48ch] text-xs leading-relaxed">
                                    {t("forgetDescription")}
                                </p>
                                {confirming === "forget" ? (
                                    <ConfirmRow
                                        label={t("forgetConfirm")}
                                        confirmLabel={t("forget")}
                                        onCancel={() => setConfirming(null)}
                                        onConfirm={() => remove("forget")}
                                        disabled={pending}
                                    />
                                ) : (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={pending}
                                        onClick={() => setConfirming("forget")}
                                    >
                                        {t("forget")}
                                    </Button>
                                )}
                            </div>

                            <div className="border-border/70 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                                <p className="text-muted-foreground max-w-[48ch] text-xs leading-relaxed">
                                    {t("deleteDescription")}
                                </p>
                                {confirming === "delete" ? (
                                    <ConfirmRow
                                        label={t("deleteConfirm")}
                                        confirmLabel={t("delete")}
                                        onCancel={() => setConfirming(null)}
                                        onConfirm={() => remove("delete")}
                                        disabled={pending}
                                        destructive
                                    />
                                ) : (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        className="gap-1.5"
                                        disabled={pending}
                                        onClick={() => setConfirming("delete")}
                                    >
                                        <IconTrash
                                            className="size-3.5"
                                            stroke={1.9}
                                            aria-hidden="true"
                                        />
                                        {t("delete")}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

type ConfirmRowProps = {
    label: string;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => void;
    disabled: boolean;
    destructive?: boolean;
};

/**
 * A two-press confirmation, inline rather than in a dialog.
 *
 * These are irreversible and rare, so the question has to be asked — but a modal
 * for "delete this server" traps focus and covers the very page somebody is
 * reading to decide. The row states what will happen and puts the two answers
 * side by side; cancel comes first, so the default target under a stray press is
 * the harmless one.
 */
function ConfirmRow({
    label,
    confirmLabel,
    onCancel,
    onConfirm,
    disabled,
    destructive = false,
}: ConfirmRowProps) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-xs leading-[1.3]">{label}</span>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={disabled}>
                {/* Cancel first: the nearest target should be the safe one. */}
                <IconArrowBackUp className="size-3.5" stroke={1.9} aria-hidden="true" />
            </Button>
            <Button
                type="button"
                size="sm"
                variant={destructive ? "destructive" : "default"}
                className="gap-1.5"
                onClick={onConfirm}
                disabled={disabled}
            >
                <IconCheck className="size-3.5" stroke={1.9} aria-hidden="true" />
                {confirmLabel}
            </Button>
        </div>
    );
}

/** Read from the union, so a new reason cannot render in the wrong half. */
const DOCUMENT_PROBLEM_SET: ReadonlySet<string> = new Set(DOCUMENT_PROBLEMS);

function isDocumentProblem(reason: string): boolean {
    return DOCUMENT_PROBLEM_SET.has(reason);
}
