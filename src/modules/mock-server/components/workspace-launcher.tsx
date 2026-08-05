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
import { StatusStrip, type StatusTone } from "@/modules/tools/components/status-strip";
import { TurnstileWidget } from "@/modules/tools/components/turnstile-widget";
import { copyText } from "@/modules/tools/domain/clipboard";

import {
    createWorkspace,
    deleteWorkspace,
    forgetWorkspace,
    importWorkspace,
    renameWorkspace,
} from "../actions/workspaces";
import { TURNSTILE_ACTION } from "../domain/constants";
import type { WorkspaceFailureReason, WorkspaceOverview, WorkspaceSummary } from "../types";
import { WorkspaceCard } from "./workspace-card";

type WorkspaceLauncherProps = {
    overview: WorkspaceOverview;
    /** `null` when `NEXT_PUBLIC_TURNSTILE_KEY` is absent, which disables writes. */
    turnstileSiteKey: string | null;
};

type Panel = "create" | "import";

/**
 * The whole of `/mock` that reacts: the workspace list, the two ways to gain
 * one, and the single showing of a recovery key.
 *
 * State is deliberately shallow. The list arrives from the server as a prop and
 * is replaced by whatever an action returns, rather than being kept in step by
 * an effect — every mutation here already round-trips, so there is nothing an
 * optimistic copy would hide except a failure.
 */
export function WorkspaceLauncher({ overview, turnstileSiteKey }: WorkspaceLauncherProps) {
    const t = useTranslations("mockServer.launcher");
    const tErrors = useTranslations("mockServer.errors");
    const tRecovery = useTranslations("mockServer.recovery");
    const tToast = useTranslations("mockServer.toast");
    const router = useRouter();

    const nameId = useId();
    const keyId = useId();

    const [workspaces, setWorkspaces] = useState<readonly WorkspaceSummary[]>(overview.workspaces);
    const [panel, setPanel] = useState<Panel>("create");
    const [name, setName] = useState("");
    const [recoveryInput, setRecoveryInput] = useState("");
    const [failure, setFailure] = useState<WorkspaceFailureReason | null>(null);

    // Shown once and never again. Held here rather than routed to, because a
    // key that survives a refresh is a key written somewhere it should not be.
    //
    // The workspace's name travels with it: a reader who creates two in a row
    // otherwise gets a second key with nothing on screen saying which of the
    // two it opens, and a key filed against the wrong workspace is a key that
    // does not work when it is finally needed.
    const [issued, setIssued] = useState<{ key: string; name: string } | null>(null);
    const [keyCopied, setKeyCopied] = useState(false);
    const [keyAcknowledged, setKeyAcknowledged] = useState(false);

    const [token, setToken] = useState<string | null>(null);
    const [resetSignal, setResetSignal] = useState(0);
    const [pending, startTransition] = useTransition();

    const hasRoom = workspaces.length < overview.maxWorkspaces;
    const storageReady = overview.isStorageConfigured;
    const challengeReady = turnstileSiteKey !== null;
    const canSubmit = storageReady && challengeReady && hasRoom && token !== null && !pending;

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

        startTransition(async () => {
            // Branched rather than resolved into one union: creation is the only
            // path that yields a recovery key, and keeping the two apart is what
            // makes that difference a type rather than a runtime check.
            if (panel === "create") {
                const result = await createWorkspace({ name, token });
                consumeToken();

                if (!result.ok) {
                    setFailure(result.reason);

                    return;
                }

                setWorkspaces((held) => [result.workspace, ...held]);
                setIssued({ key: result.recoveryKey, name: result.workspace.name });
                setKeyCopied(false);
                setKeyAcknowledged(false);
                setName("");
                toast.success(tToast("created"));
            } else {
                const result = await importWorkspace({ recoveryKey: recoveryInput, token });
                consumeToken();

                if (!result.ok) {
                    setFailure(result.reason);

                    return;
                }

                setWorkspaces((held) => [result.workspace, ...held]);
                setRecoveryInput("");
                toast.success(tToast("imported"));
            }

            // The nav's workspace list is server-rendered, so it needs telling.
            router.refresh();
        });
    }

    async function handleRename(workspaceId: string, next: string): Promise<boolean> {
        const result = await renameWorkspace({ workspaceId, name: next });

        if (!result.ok) {
            setFailure(result.reason);

            return false;
        }

        setWorkspaces((held) =>
            held.map((workspace) =>
                workspace.id === workspaceId ? { ...workspace, name: next.trim() } : workspace,
            ),
        );
        toast.success(tToast("renamed"));
        router.refresh();

        return true;
    }

    async function handleForget(workspaceId: string): Promise<boolean> {
        const result = await forgetWorkspace({ workspaceId });

        if (!result.ok) {
            setFailure(result.reason);

            return false;
        }

        setWorkspaces((held) => held.filter((workspace) => workspace.id !== workspaceId));
        toast.success(tToast("forgotten"));
        router.refresh();

        return true;
    }

    async function handleDelete(workspaceId: string): Promise<boolean> {
        const result = await deleteWorkspace({ workspaceId });

        if (!result.ok) {
            setFailure(result.reason);

            return false;
        }

        setWorkspaces((held) => held.filter((workspace) => workspace.id !== workspaceId));
        toast.success(tToast("deleted"));
        router.refresh();

        return true;
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

        logEvent("error", "mock_server.recovery_copy_failed", {
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
              ? { tone: "warning", message: t("fullHint", { max: overview.maxWorkspaces }) }
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
                                  remaining: overview.maxWorkspaces - workspaces.length,
                                  max: overview.maxWorkspaces,
                              })
                            : t("slotsFull")}
                    </p>
                </div>

                <p className="text-muted-foreground mt-3 max-w-[60ch] text-xs leading-relaxed">
                    {panel === "create" ? t("createDescription") : t("importDescription")}
                </p>

                <div className="mt-4 flex flex-col gap-3">
                    {panel === "create" ? (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor={nameId} className="text-xs">
                                {t("nameLabel")}
                            </Label>
                            <Input
                                id={nameId}
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder={t("namePlaceholder")}
                                disabled={!storageReady || !hasRoom}
                                autoComplete="off"
                                className="max-w-md"
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor={keyId} className="text-xs">
                                {t("keyLabel")}
                            </Label>
                            <Input
                                id={keyId}
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
                        // so the constraint belongs on the container. 20rem is
                        // just above the widget's own 300px floor, which keeps it
                        // the width of a control rather than the width of a card.
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
                                    {tRecovery("forWorkspace", { name: issued.name })}
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

            <section aria-labelledby="workspaces-heading">
                <h2
                    id="workspaces-heading"
                    className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase"
                >
                    {t("yourWorkspaces")}
                </h2>

                {workspaces.length === 0 ? (
                    <p className="border-border/70 text-muted-foreground mt-3 rounded-2xl border border-dashed p-6 text-center text-xs leading-relaxed">
                        {t("empty")}
                        <span className="text-muted-foreground/70 mt-1 block">
                            {t("emptyHint")}
                        </span>
                    </p>
                ) : (
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                        {workspaces.map((workspace) => (
                            <WorkspaceCard
                                key={workspace.id}
                                workspace={workspace}
                                busy={pending}
                                onRename={handleRename}
                                onForget={handleForget}
                                onDelete={handleDelete}
                            />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
