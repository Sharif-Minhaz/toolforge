"use client";

import {
    IconAlertTriangle,
    IconDownload,
    IconKey,
    IconLoader2,
    IconPlus,
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
import { JsonDocumentEditor } from "@/modules/tools/components/json-document-editor";
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { copyText } from "@/modules/tools/domain/clipboard";
import { exceedsUploadLimit } from "@/modules/tools/domain/json-document";
import { MAX_TYPED_RECOVERY_KEY_LENGTH } from "@/modules/tools/domain/recovery-key";
import { SERVER_KEY_LENGTH } from "@/modules/tools/domain/server-key";
import { SERVER_NAME_LENGTH } from "@/modules/tools/domain/server-name";
import { DOCUMENT_PROBLEMS, type DocumentFailure } from "@/modules/tools/types/json-document";

import { createServer, importServer } from "../actions/servers";
import { TURNSTILE_ACTION } from "../domain/constants";
import { SAMPLE_DOCUMENT } from "../domain/samples";
import type { ActionProblem, GraphqlServerSummary, ServerOverview } from "../types";
import { ServerCard } from "./server-card";

type ServerLauncherProps = {
    overview: ServerOverview;
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables writes. */
    turnstileSiteKey: string | null;
};

type Panel = "create" | "import";

/**
 * The whole of `/graphql` that reacts: the server list, the two ways to gain
 * one, and the single showing of a recovery key.
 *
 * Structurally the JSON Server Studio's launcher, and deliberately a second copy
 * rather than a shared component. What would have to be injected to unify them
 * is two Server Actions, two result types, a message namespace, a card and a
 * route — six parameters to save a layout, which is the point where an
 * abstraction costs more than the duplication it removes. The parts that are
 * genuinely shared *are* shared: the document editor, the usage bar, the
 * base-URL row and the whole `hostedServer` vocabulary all live in
 * `tools/`.
 *
 * State is deliberately shallow. The list arrives from the server as a prop and
 * is replaced by whatever an action returns, rather than being kept in step by
 * an effect — every mutation here already round-trips, so there is nothing an
 * optimistic copy would hide except a failure.
 *
 * The document box starts holding the sample rather than empty, and that is the
 * difference between a form somebody fills in and a form somebody understands.
 * A reader who has never seen `json-server` learns the shape of a `db.json` by
 * reading the thing already in the box, and pressing Create without touching it
 * gives them a working API to poke at.
 */
export function ServerLauncher({ overview, turnstileSiteKey }: ServerLauncherProps) {
    const t = useTranslations("graphqlServer.launcher");
    const tErrors = useTranslations("graphqlServer.errors");
    const tRecovery = useTranslations("graphqlServer.recovery");
    const tToast = useTranslations("graphqlServer.toast");
    const router = useRouter();

    const nameId = useId();
    const keyId = useId();
    const recoveryId = useId();

    const [servers, setServers] = useState<readonly GraphqlServerSummary[]>(overview.servers);
    const [panel, setPanel] = useState<Panel>("create");
    const [name, setName] = useState("");
    const [key, setKey] = useState("");
    const [document, setDocument] = useState(SAMPLE_DOCUMENT);
    const [recoveryInput, setRecoveryInput] = useState("");

    // Both cap at `maxLength`. `checkServerName` and `checkServerKey` still
    // own what a *usable* name and key are — this only stops the box from
    // growing past what the action accepts, and counts the last stretch down.
    const nameLimit = useInputLimit(name.length, SERVER_NAME_LENGTH.max);
    const keyLimit = useInputLimit(key.length, SERVER_KEY_LENGTH.max);
    const [failure, setFailure] = useState<ActionProblem | null>(null);
    const [documentFailure, setDocumentFailure] = useState<DocumentFailure | null>(null);

    // Shown once and never again. Held here rather than routed to, because a key
    // that survives a refresh is a key written somewhere it should not be.
    //
    // The server's name travels with it: a reader who creates two in a row
    // otherwise gets a second key with nothing on screen saying which of the two
    // it opens, and a key filed against the wrong server is a key that does not
    // work when it is finally needed.
    const [issued, setIssued] = useState<{ key: string; name: string } | null>(null);
    const [keyCopied, setKeyCopied] = useState(false);
    const [keyAcknowledged, setKeyAcknowledged] = useState(false);

    const [token, setToken] = useState<string | null>(null);
    const [resetSignal, setResetSignal] = useState(0);
    const [pending, startTransition] = useTransition();

    const hasRoom = servers.length < overview.maxServers;
    const storageReady = overview.isStorageConfigured;
    const challengeReady = turnstileSiteKey !== null;
    // A document already over the upload ceiling never leaves the browser.
    // The editor says so under the box; this is what stops the button from
    // contradicting it. Import has no document, so it is unaffected.
    const documentFits = panel !== "create" || !exceedsUploadLimit(document);
    const canSubmit =
        storageReady && challengeReady && hasRoom && token !== null && !pending && documentFits;

    /** A token is single-use, so every attempt — win or lose — draws a fresh one. */
    function consumeToken() {
        setToken(null);
        setResetSignal((signal) => signal + 1);
    }

    function submit() {
        if (!canSubmit || token === null) {
            return;
        }

        setFailure(null);
        setDocumentFailure(null);

        startTransition(async () => {
            // Branched rather than resolved into one union: creation is the only
            // path that yields a recovery key, and keeping the two apart is what
            // makes that difference a type rather than a runtime check.
            if (panel === "create") {
                const result = await createServer({ name, key, document, token });
                consumeToken();

                if (!result.ok) {
                    // A document failure may carry a line and a column and
                    // belongs under the editor; everything else is a one-line
                    // status beside the button.
                    if (isDocumentProblem(result.reason)) {
                        setDocumentFailure(result as DocumentFailure);
                    } else {
                        setFailure(result.reason as ActionProblem);
                    }

                    return;
                }

                setServers((held) => [result.server, ...held]);
                setIssued({ key: result.recoveryKey, name: result.server.name });
                setKeyCopied(false);
                setKeyAcknowledged(false);
                setName("");
                setKey("");
                toast.success(tToast("created"));
            } else {
                const result = await importServer({ recoveryKey: recoveryInput, token });
                consumeToken();

                if (!result.ok) {
                    setFailure(result.reason);

                    return;
                }

                setServers((held) => [result.server, ...held]);
                setRecoveryInput("");
                toast.success(tToast("imported"));
            }

            router.refresh();
        });
    }

    async function copyRecoveryKey() {
        if (issued === null) {
            return;
        }

        const result = await copyText(issued.key);

        if (result.ok) {
            setKeyCopied(true);

            return;
        }

        logEvent("error", "graphql_server.recovery_copy_failed", {
            error: describeError(result.reason),
        });
        toast.error(tToast("copyFailed"));
    }

    const status: { tone: StatusTone; message: string } | null = !storageReady
        ? { tone: "error", message: tErrors("storage_unavailable") }
        : !challengeReady
          ? { tone: "warning", message: t("challengeMissing") }
          : failure !== null
            ? { tone: "error", message: tErrors(failure) }
            : !hasRoom
              ? { tone: "warning", message: t("fullHint", { max: overview.maxServers }) }
              : null;

    return (
        <div className="flex flex-col gap-6">
            <section
                aria-labelledby="gain-heading"
                className="border-border/70 bg-card rounded-2xl border p-5 shadow-xs"
            >
                <h2 id="gain-heading" className="sr-only">
                    {panel === "create" ? t("createTitle") : t("importTitle")}
                </h2>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div
                        role="tablist"
                        aria-label={t("panelLabel")}
                        className="bg-muted/60 inline-flex rounded-xl p-1"
                    >
                        {(["create", "import"] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                role="tab"
                                aria-selected={panel === option}
                                onClick={() => {
                                    setPanel(option);
                                    setFailure(null);
                                    setDocumentFailure(null);
                                }}
                                className={cn(
                                    "focus-visible:ring-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                                    panel === option
                                        ? "bg-card text-foreground shadow-xs"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {option === "create" ? t("createTab") : t("importTab")}
                            </button>
                        ))}
                    </div>

                    {/* Both numbers go through ICU rather than into JSX, so Bangla
                        gets Bengali digits. */}
                    <p
                        className={cn(
                            "text-[0.6875rem] leading-[1.3]",
                            hasRoom ? "text-muted-foreground" : "text-brand-amber",
                        )}
                    >
                        {hasRoom
                            ? t("slotsLeft", {
                                  remaining: overview.maxServers - servers.length,
                                  max: overview.maxServers,
                              })
                            : t("slotsFull")}
                    </p>
                </div>

                <p className="text-muted-foreground mt-3 max-w-[60ch] text-xs leading-relaxed">
                    {panel === "create" ? t("createDescription") : t("importDescription")}
                </p>

                <div className="mt-4 flex flex-col gap-4">
                    {panel === "create" ? (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Label htmlFor={nameId} className="text-xs">
                                            {t("nameLabel")}
                                        </Label>
                                        <InputLimitMeter reading={nameLimit} />
                                    </div>
                                    <Input
                                        id={nameId}
                                        maxLength={SERVER_NAME_LENGTH.max}
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        placeholder={t("namePlaceholder")}
                                        disabled={!storageReady || !hasRoom}
                                        autoComplete="off"
                                    />
                                </div>

                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Label htmlFor={keyId} className="text-xs">
                                            {t("keyLabel")}
                                        </Label>
                                        <InputLimitMeter reading={keyLimit} />
                                    </div>
                                    <Input
                                        id={keyId}
                                        maxLength={SERVER_KEY_LENGTH.max}
                                        value={key}
                                        onChange={(event) => setKey(event.target.value)}
                                        placeholder={t("keyPlaceholder")}
                                        disabled={!storageReady || !hasRoom}
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="font-mono"
                                    />
                                    <p className="text-muted-foreground text-[0.6875rem] leading-[1.3]">
                                        {t("keyHint")}
                                    </p>
                                </div>
                            </div>

                            <JsonDocumentEditor
                                value={document}
                                sample={SAMPLE_DOCUMENT}
                                onChange={(next) => {
                                    setDocument(next);
                                    setDocumentFailure(null);
                                }}
                                failure={documentFailure}
                                disabled={!storageReady || !hasRoom}
                                showSample
                            />
                        </>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor={recoveryId} className="text-xs">
                                {t("keyRecoveryLabel")}
                            </Label>
                            <Input
                                id={recoveryId}
                                // Formatted keys carry separators, so the cap is
                                // the printed spelling's length rather than the
                                // canonical sixteen. `normalizeRecoveryKey`
                                // still owns what counts as one.
                                maxLength={MAX_TYPED_RECOVERY_KEY_LENGTH}
                                value={recoveryInput}
                                onChange={(event) => setRecoveryInput(event.target.value)}
                                placeholder="XXXX-XXXX-XXXX-XXXX"
                                disabled={!storageReady || !hasRoom}
                                autoComplete="off"
                                spellCheck={false}
                                className="max-w-md font-mono tracking-[0.12em] uppercase"
                            />
                        </div>
                    )}

                    {challengeReady && storageReady && hasRoom ? (
                        // Turnstile's `flexible` size fills whatever it is given,
                        // so the constraint belongs on the container.
                        <div className="w-full max-w-xs">
                            <TurnstileWidget
                                siteKey={turnstileSiteKey}
                                action={TURNSTILE_ACTION}
                                resetSignal={resetSignal}
                                onVerify={setToken}
                                onExpire={() => setToken(null)}
                                onError={() => setToken(null)}
                            />
                        </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            type="button"
                            disabled={!canSubmit}
                            onClick={submit}
                            className="gap-1.5"
                        >
                            {pending ? (
                                <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : panel === "create" ? (
                                <IconPlus className="size-4" aria-hidden="true" />
                            ) : (
                                <IconDownload className="size-4" aria-hidden="true" />
                            )}
                            {panel === "create" ? t("createAction") : t("importAction")}
                        </Button>

                        {status !== null ? (
                            <StatusStrip tone={status.tone} message={status.message} />
                        ) : null}
                    </div>
                </div>
            </section>

            {issued !== null && !keyAcknowledged ? (
                <section
                    aria-labelledby="recovery-heading"
                    className="border-brand-amber/45 bg-brand-amber/6 rounded-2xl border p-5"
                >
                    <div className="flex items-start gap-3">
                        <IconKey
                            className="text-brand-amber mt-0.5 size-5 shrink-0"
                            stroke={1.75}
                            aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                            <h2
                                id="recovery-heading"
                                className="text-foreground text-sm leading-[1.3] font-semibold"
                            >
                                {tRecovery("title")}{" "}
                                <span className="text-muted-foreground font-normal">
                                    {tRecovery("forServer", { name: issued.name })}
                                </span>
                            </h2>
                            <p className="text-muted-foreground mt-1 max-w-[60ch] text-xs leading-relaxed">
                                {tRecovery("description")}
                            </p>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <code className="border-border/70 bg-card text-foreground rounded-xl border px-3 py-2 font-mono text-sm tracking-[0.14em] tabular-nums select-all">
                                    {issued.key}
                                </code>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5"
                                    onClick={copyRecoveryKey}
                                >
                                    <CopyIconSwap copied={keyCopied} />
                                    {keyCopied ? tRecovery("copied") : tRecovery("copy")}
                                </Button>
                            </div>

                            <p className="text-brand-amber mt-3 flex items-start gap-1.5 text-[0.6875rem] leading-normal">
                                <IconAlertTriangle
                                    className="mt-px size-3.5 shrink-0"
                                    stroke={2}
                                    aria-hidden="true"
                                />
                                {tRecovery("warning")}
                            </p>

                            <Button
                                type="button"
                                size="sm"
                                className="mt-3"
                                onClick={() => setKeyAcknowledged(true)}
                            >
                                {tRecovery("saved")}
                            </Button>
                        </div>
                    </div>
                </section>
            ) : null}

            <section aria-labelledby="servers-heading">
                <h2
                    id="servers-heading"
                    className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase"
                >
                    {t("yourServers")}
                </h2>

                {servers.length === 0 ? (
                    <p className="border-border/70 text-muted-foreground mt-3 rounded-2xl border border-dashed p-6 text-center text-xs leading-relaxed">
                        {t("empty")}
                        <span className="text-muted-foreground/70 mt-1 block">
                            {t("emptyHint")}
                        </span>
                    </p>
                ) : (
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                        {servers.map((server) => (
                            <ServerCard key={server.id} server={server} />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

/**
 * Whether a failure is about the document rather than about the request.
 *
 * The two arrive as one union from the action — a create can fail either way —
 * and they belong in different places on screen: a complaint about the document
 * goes under the editor where the line number means something, a complaint about
 * the request goes beside the button. That is the same rule the Domain
 * Inspector follows and for the same reason — a complaint about the input must
 * be beside the input.
 *
 * Read from `DOCUMENT_PROBLEMS` rather than listed again, so adding a reason
 * cannot leave it rendering in the wrong half of the form.
 */
const DOCUMENT_PROBLEM_SET: ReadonlySet<string> = new Set(DOCUMENT_PROBLEMS);

function isDocumentProblem(reason: string): boolean {
    return DOCUMENT_PROBLEM_SET.has(reason);
}
