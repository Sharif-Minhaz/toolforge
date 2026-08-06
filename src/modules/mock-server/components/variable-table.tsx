"use client";

import { IconLock, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InputLimitMeter, useInputLimit } from "@/modules/tools/components/input-limit-meter";
import { StatusStrip } from "@/modules/tools/components/status-strip";

import { removeVariable, saveVariable } from "../actions/variables";
import {
    DEFAULT_ENVIRONMENT,
    VARIABLE_KEY_LENGTH,
    VARIABLE_VALUE_LENGTH,
    type DisplayVariable,
} from "../domain/environment";
import type { ServerFailureReason, ServerSummary } from "../types";

type VariableTableProps = {
    workspaceId: string;
    servers: readonly ServerSummary[];
    initial: readonly DisplayVariable[];
    environments: readonly string[];
};

const SELECT_CLASS =
    "border-input bg-card focus-visible:ring-ring h-9 rounded-lg border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none";

/**
 * The variables a workspace holds, and the form that adds one.
 *
 * A secret arrives here already masked — the action never sends its value — so
 * editing one replaces it rather than revealing it. That is stated in the copy,
 * because a masked field that silently keeps its old value on save is the kind
 * of surprise that costs somebody an afternoon.
 */
export function VariableTable({ workspaceId, servers, initial, environments }: VariableTableProps) {
    const t = useTranslations("mockServer.variables");
    const tErrors = useTranslations("mockServer.serverErrors");
    const router = useRouter();

    const keyId = useId();
    const valueId = useId();

    const [rows, setRows] = useState<readonly DisplayVariable[]>(initial);
    const [environment, setEnvironment] = useState(environments[0] ?? DEFAULT_ENVIRONMENT);
    const [scopeId, setScopeId] = useState<string>(workspaceId);
    const [key, setKey] = useState("");
    const [value, setValue] = useState("");

    // Both cap at `maxLength`; `checkVariableKey` still owns what a usable
    // key is, so a name that is short enough but shaped wrong still says so.
    const keyLimit = useInputLimit(key.length, VARIABLE_KEY_LENGTH.max);
    const valueLimit = useInputLimit(value.length, VARIABLE_VALUE_LENGTH.max);
    const [isSecret, setIsSecret] = useState(false);
    const [failure, setFailure] = useState<ServerFailureReason | null>(null);
    const [pending, startTransition] = useTransition();

    const scopeType = scopeId === workspaceId ? "WORKSPACE" : "SERVER";
    const shown = rows.filter((row) => row.environment === environment);

    function submit() {
        if (pending || key.trim() === "") {
            return;
        }

        setFailure(null);

        startTransition(async () => {
            const result = await saveVariable({
                workspaceId,
                scopeType,
                scopeId,
                environment,
                key,
                value,
                isSecret,
            });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setRows((held) => [
                ...held.filter(
                    (row) =>
                        !(
                            row.key === key.trim() &&
                            row.environment === environment &&
                            row.scopeId === scopeId
                        ),
                ),
                {
                    scopeType,
                    scopeId,
                    environment,
                    key: key.trim(),
                    value: isSecret ? "••••••••" : value,
                    isSecret,
                    masked: isSecret,
                },
            ]);
            setKey("");
            setValue("");
            toast.success(t("saved"));
            router.refresh();
        });
    }

    function remove(row: DisplayVariable) {
        startTransition(async () => {
            const result = await removeVariable({
                workspaceId,
                scopeType: row.scopeType,
                scopeId: row.scopeId,
                environment: row.environment,
                key: row.key,
            });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setRows((held) => held.filter((candidate) => candidate !== row));
            toast.success(t("removed"));
            router.refresh();
        });
    }

    function scopeLabel(row: DisplayVariable): string {
        if (row.scopeType === "WORKSPACE") {
            return t("scopeWorkspace");
        }

        return servers.find((server) => server.id === row.scopeId)?.name ?? t("scopeServer");
    }

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">{t("environment")}</Label>
                    <select
                        value={environment}
                        onChange={(event) => setEnvironment(event.target.value)}
                        className={SELECT_CLASS}
                    >
                        {environments.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
                <p className="text-muted-foreground max-w-[54ch] text-xs leading-relaxed">
                    {t("overrideHint")}
                </p>
            </div>

            <section
                aria-labelledby="add-variable"
                className="border-border/70 bg-card rounded-2xl border p-5 shadow-xs"
            >
                <h2 id="add-variable" className="text-foreground text-sm font-semibold">
                    {t("addTitle")}
                </h2>
                <p className="text-muted-foreground mt-1 max-w-[60ch] text-xs leading-relaxed">
                    {t("addHint")}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">{t("scope")}</Label>
                        <select
                            value={scopeId}
                            onChange={(event) => setScopeId(event.target.value)}
                            className={SELECT_CLASS}
                        >
                            <option value={workspaceId}>{t("scopeWorkspace")}</option>
                            {servers.map((server) => (
                                <option key={server.id} value={server.id}>
                                    {server.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor={keyId} className="text-xs">
                                {t("key")}
                            </Label>
                            <InputLimitMeter reading={keyLimit} />
                        </div>
                        <Input
                            id={keyId}
                            maxLength={VARIABLE_KEY_LENGTH.max}
                            value={key}
                            onChange={(event) => setKey(event.target.value)}
                            placeholder="API_BASE"
                            autoComplete="off"
                            spellCheck={false}
                            className="font-mono text-xs"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor={valueId} className="text-xs">
                                {t("value")}
                            </Label>
                            <InputLimitMeter reading={valueLimit} />
                        </div>
                        <Input
                            id={valueId}
                            maxLength={VARIABLE_VALUE_LENGTH.max}
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                            className="font-mono text-xs"
                        />
                    </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <Label htmlFor={`${keyId}-secret`} className="text-xs">
                            {t("secret")}
                        </Label>
                        <p className="text-muted-foreground mt-0.5 text-[0.6875rem] leading-normal">
                            {t("secretHint")}
                        </p>
                    </div>
                    <Switch
                        id={`${keyId}-secret`}
                        checked={isSecret}
                        onCheckedChange={setIsSecret}
                    />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                        type="button"
                        disabled={pending || key.trim() === ""}
                        onClick={submit}
                        className="gap-1.5"
                    >
                        <IconPlus className="size-4" aria-hidden="true" />
                        {t("save")}
                    </Button>
                    {failure !== null ? (
                        <StatusStrip tone="error" message={tErrors(failure)} />
                    ) : null}
                </div>
            </section>

            {shown.length === 0 ? (
                <p className="border-border/70 text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-xs leading-relaxed">
                    {t("empty")}
                </p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {shown.map((row) => (
                        <li
                            key={`${row.scopeType}:${row.scopeId}:${row.key}`}
                            className="border-border/70 bg-card flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2"
                        >
                            <span className="text-muted-foreground w-28 shrink-0 truncate text-[0.6875rem]">
                                {scopeLabel(row)}
                            </span>
                            <span className="text-foreground w-44 shrink-0 truncate font-mono text-xs">
                                {row.key}
                            </span>
                            <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1 truncate font-mono text-xs">
                                {row.masked ? (
                                    <IconLock className="size-3 shrink-0" aria-hidden="true" />
                                ) : null}
                                {row.value}
                            </span>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive size-7 shrink-0"
                                aria-label={t("remove")}
                                disabled={pending}
                                onClick={() => remove(row)}
                            >
                                <IconTrash className="size-3.5" aria-hidden="true" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
