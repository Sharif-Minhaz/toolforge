"use client";

import {
    IconArrowRight,
    IconCheck,
    IconLoader2,
    IconPencil,
    IconServer2,
    IconTrash,
    IconX,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TOOL_ACCENT_VARS, TOOL_ICON_TILE } from "@/modules/tools/components/tool-accent";
import { WORKSPACE_NAME_LENGTH } from "../domain/constants";

import type { WorkspaceSummary } from "../types";

type WorkspaceCardProps = {
    workspace: WorkspaceSummary;
    /** Disabled while a sibling card is mid-action, so two writes cannot race. */
    busy: boolean;
    onRename: (workspaceId: string, name: string) => Promise<boolean>;
    onForget: (workspaceId: string) => Promise<boolean>;
    onDelete: (workspaceId: string) => Promise<boolean>;
};

/**
 * One workspace in the switcher, and the two very different ways to stop seeing
 * it.
 *
 * **Forget** drops this browser's claim. The workspace keeps running, its
 * public endpoints keep answering, every other browser keeps its access, and
 * the recovery key still works. **Delete** removes the workspace itself and
 * everything under it, for everyone, permanently.
 *
 * They are one click apart, so the destructive one is the only one that arms:
 * pressing it swaps the row into a confirm state naming what is about to go,
 * and nothing happens until the second press.
 */
export function WorkspaceCard({
    workspace,
    busy,
    onRename,
    onForget,
    onDelete,
}: WorkspaceCardProps) {
    const t = useTranslations("mockServer.launcher");
    const format = useFormatter();

    const [draftName, setDraftName] = useState<string | null>(null);
    const [armed, setArmed] = useState<"forget" | "delete" | null>(null);
    const [pending, startTransition] = useTransition();

    const disabled = busy || pending;
    const isEditing = draftName !== null;

    function commitRename() {
        const next = draftName ?? "";

        if (next.trim() === "" || next === workspace.name) {
            setDraftName(null);

            return;
        }

        startTransition(async () => {
            await onRename(workspace.id, next);
            setDraftName(null);
        });
    }

    function runArmed() {
        const action = armed;

        if (action === null) {
            return;
        }

        startTransition(async () => {
            await (action === "forget" ? onForget(workspace.id) : onDelete(workspace.id));
            setArmed(null);
        });
    }

    if (armed !== null) {
        return (
            <li
                className={cn(
                    "border-border/70 bg-card rounded-2xl border p-4 shadow-xs",
                    armed === "delete" && "border-destructive/50",
                )}
            >
                <p className="text-foreground text-sm font-medium">
                    {armed === "delete"
                        ? t("deleteConfirm", { name: workspace.name })
                        : t("forgetConfirm", { name: workspace.name })}
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    {armed === "delete" ? t("deleteConfirmHint") : t("forgetConfirmHint")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant={armed === "delete" ? "destructive" : "default"}
                        disabled={disabled}
                        onClick={runArmed}
                    >
                        {pending ? (
                            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : null}
                        {armed === "delete" ? t("deleteAction") : t("forgetAction")}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => setArmed(null)}
                    >
                        {t("cancel")}
                    </Button>
                </div>
            </li>
        );
    }

    return (
        <li
            className={cn(
                "border-border/70 bg-card group/card rounded-2xl border p-4 shadow-xs transition-colors",
                TOOL_ACCENT_VARS.violet,
                !disabled && "hover:border-[var(--tool-accent)]/40",
            )}
        >
            <div className="flex items-start gap-3">
                <span className={cn(TOOL_ICON_TILE, "size-9 shrink-0")}>
                    <IconServer2 className="size-4.5" stroke={1.75} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                    {isEditing ? (
                        <div className="flex items-center gap-1.5">
                            <Input
                                autoFocus
                                // No meter: this is a one-line rename inside a
                                // card with nowhere to put a countdown, and
                                // `checkWorkspaceName` names the real rule under
                                // the field on submit.
                                maxLength={WORKSPACE_NAME_LENGTH.max}
                                value={draftName}
                                onChange={(event) => setDraftName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        commitRename();
                                    }

                                    if (event.key === "Escape") {
                                        setDraftName(null);
                                    }
                                }}
                                aria-label={t("nameLabel")}
                                className="h-8 text-sm"
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 shrink-0"
                                aria-label={t("renameSave")}
                                disabled={disabled}
                                onClick={commitRename}
                            >
                                <IconCheck className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 shrink-0"
                                aria-label={t("cancel")}
                                disabled={disabled}
                                onClick={() => setDraftName(null)}
                            >
                                <IconX className="size-4" aria-hidden="true" />
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <h3 className="text-foreground min-w-0 flex-1 truncate text-sm leading-[1.3] font-semibold">
                                {workspace.name}
                            </h3>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                // Hover-only would strand a keyboard user, so it
                                // comes back on focus as well.
                                className="text-muted-foreground size-7 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                                aria-label={t("rename")}
                                disabled={disabled}
                                onClick={() => setDraftName(workspace.name)}
                            >
                                <IconPencil className="size-3.5" aria-hidden="true" />
                            </Button>
                        </div>
                    )}

                    <p className="text-muted-foreground mt-1 text-xs leading-[1.4]">
                        {t("serverCount", { count: workspace.serverCount })}
                        {" · "}
                        {t("createdOn", {
                            date: format.dateTime(new Date(workspace.createdAt), {
                                dateStyle: "medium",
                            }),
                        })}
                    </p>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                    href={`/mock/${workspace.id}`}
                    className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                >
                    {t("open")}
                    <IconArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => setArmed("forget")}
                >
                    {t("forget")}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive ml-auto gap-1.5"
                    disabled={disabled}
                    onClick={() => setArmed("delete")}
                >
                    <IconTrash className="size-3.5" aria-hidden="true" />
                    {t("delete")}
                </Button>
            </div>
        </li>
    );
}
