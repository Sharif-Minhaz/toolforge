"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusStrip } from "@/modules/tools/components/status-strip";

import { AUTH_MODES } from "../domain/auth-check";
import { COMPARE_OPS } from "../domain/compare";
import { MAX_DELAY_MS } from "../domain/constants";
import { nodeDefinition, randomBranches, switchCases } from "../domain/node-registry";
import type { GraphNode, JsonValue, ValueExpr } from "../types/graph";
import { ValueEditor } from "./value-editor";

/**
 * The form for whichever node is selected.
 *
 * One component with a branch per kind rather than a registry of components:
 * every inspector is four controls over a `Record<string, JsonValue>`, and
 * eleven files would be eleven places for the label spacing to drift. The
 * registry seam that does matter — handles, defaults, whether a kind runs —
 * is in `domain/node-registry.ts`, where it is framework-free and tested.
 *
 * Everything reads defensively, because node data is JSONB and may have been
 * written by an older build or half-configured a second ago.
 */

type NodeInspectorProps = {
    node: GraphNode;
    onChange: (data: Record<string, JsonValue>) => void;
};

function asRecord(data: unknown): Record<string, JsonValue> {
    return typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, JsonValue>)
        : {};
}

function readString(data: Record<string, JsonValue>, key: string, fallback = ""): string {
    return typeof data[key] === "string" ? (data[key] as string) : fallback;
}

function readNumber(data: Record<string, JsonValue>, key: string, fallback: number): number {
    return typeof data[key] === "number" ? (data[key] as number) : fallback;
}

function readExpr(data: Record<string, JsonValue>, key: string): ValueExpr {
    const value = data[key];

    return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value
        ? (value as unknown as ValueExpr)
        : { kind: "static", value: "" };
}

/**
 * A branch or case id nothing already uses.
 *
 * Derived from what is there rather than from a clock: an id has to be unique
 * so an existing edge keeps pointing at the case it was drawn to, and nothing
 * on this site reaches for `Date.now()` or `Math.random()` where a counter will
 * do.
 */
function freeEntryId(taken: readonly { id: string }[], prefix: string): string {
    const used = new Set(taken.map((entry) => entry.id));
    let counter = taken.length + 1;

    while (used.has(`${prefix}${counter}`)) {
        counter += 1;
    }

    return `${prefix}${counter}`;
}

const SELECT_CLASS =
    "border-input bg-card focus-visible:ring-ring h-9 w-full rounded-lg border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none";

export function NodeInspector({ node, onChange }: NodeInspectorProps) {
    const t = useTranslations("mockServer.inspector");
    const tOps = useTranslations("mockServer.compareOps");
    const tAuth = useTranslations("mockServer.authModes");
    const tStudio = useTranslations("mockServer.studio");

    const data = asRecord(node.data);
    const patch = (next: Record<string, JsonValue>) => onChange({ ...data, ...next });

    if (!nodeDefinition(node.kind).implemented) {
        return <StatusStrip tone="warning" message={tStudio("nodeNotReady")} />;
    }

    switch (node.kind) {
        case "request":
            return <p className="text-muted-foreground text-xs">{t("requestHint")}</p>;

        case "auth":
            return (
                <div className="flex flex-col gap-3">
                    <Field label={t("authMode")}>
                        <select
                            value={readString(data, "mode", "none")}
                            onChange={(event) => patch({ mode: event.target.value })}
                            className={SELECT_CLASS}
                        >
                            {AUTH_MODES.map((mode) => (
                                <option key={mode} value={mode}>
                                    {tAuth(mode)}
                                </option>
                            ))}
                        </select>
                    </Field>

                    {readString(data, "mode", "none") === "apiKey" ? (
                        <Field label={t("authHeader")}>
                            <Input
                                value={readString(data, "header", "x-api-key")}
                                onChange={(event) => patch({ header: event.target.value })}
                                className="h-9 font-mono text-xs"
                            />
                        </Field>
                    ) : null}

                    {readString(data, "mode", "none") !== "none" ? (
                        <Field label={t("authValue")} hint={t("authValueHint")}>
                            <Input
                                value={readString(data, "value")}
                                onChange={(event) => patch({ value: event.target.value })}
                                className="h-9 font-mono text-xs"
                            />
                        </Field>
                    ) : null}

                    <StatusStrip tone="warning" message={t("authMockNotice")} />
                </div>
            );

        case "condition":
            return (
                <div className="flex flex-col gap-3">
                    <Field label={t("conditionLeft")}>
                        <ValueEditor
                            value={readExpr(data, "left")}
                            onChange={(left) => patch({ left: left as unknown as JsonValue })}
                        />
                    </Field>

                    <Field label={t("conditionOp")}>
                        <select
                            value={readString(data, "op", "equals")}
                            onChange={(event) => patch({ op: event.target.value })}
                            className={SELECT_CLASS}
                        >
                            {COMPARE_OPS.map((op) => (
                                <option key={op} value={op}>
                                    {tOps(op)}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label={t("conditionRight")}>
                        <ValueEditor
                            value={readExpr(data, "right")}
                            onChange={(right) => patch({ right: right as unknown as JsonValue })}
                        />
                    </Field>
                </div>
            );

        case "switch": {
            const cases = switchCases(data);

            return (
                <div className="flex flex-col gap-3">
                    <Field label={t("switchOperand")}>
                        <ValueEditor
                            value={readExpr(data, "operand")}
                            onChange={(operand) =>
                                patch({ operand: operand as unknown as JsonValue })
                            }
                        />
                    </Field>

                    <div className="flex flex-col gap-2">
                        <Label className="text-xs">{t("switchCases")}</Label>
                        {cases.map((entry, index) => (
                            <div key={entry.id} className="flex items-center gap-1.5">
                                <Input
                                    value={entry.label}
                                    onChange={(event) =>
                                        patch({
                                            cases: cases.map((row, at) =>
                                                at === index
                                                    ? { ...row, label: event.target.value }
                                                    : row,
                                            ) as unknown as JsonValue,
                                        })
                                    }
                                    aria-label={t("switchCaseLabel")}
                                    className="h-8 text-xs"
                                />
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                                    aria-label={t("removeCase")}
                                    onClick={() =>
                                        patch({
                                            cases: cases.filter(
                                                (_, at) => at !== index,
                                            ) as unknown as JsonValue,
                                        })
                                    }
                                >
                                    <IconTrash className="size-3.5" aria-hidden="true" />
                                </Button>
                            </div>
                        ))}
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-fit gap-1.5"
                            onClick={() =>
                                patch({
                                    cases: [
                                        ...cases,
                                        { id: freeEntryId(cases, "c"), label: "", match: null },
                                    ] as unknown as JsonValue,
                                })
                            }
                        >
                            <IconPlus className="size-3.5" aria-hidden="true" />
                            {t("addCase")}
                        </Button>
                    </div>
                </div>
            );
        }

        case "delay":
            return (
                <div className="flex flex-col gap-3">
                    <Field label={t("delayMs")} hint={t("delayCap", { max: MAX_DELAY_MS })}>
                        <Input
                            type="number"
                            min={0}
                            max={MAX_DELAY_MS}
                            value={readNumber(data, "ms", 0)}
                            onChange={(event) => patch({ ms: Number(event.target.value) })}
                            className="h-9 text-xs"
                        />
                    </Field>

                    <div className="flex flex-wrap gap-1.5">
                        {[0, 100, 250, 500, 1_000, 3_000].map((preset) => (
                            <Button
                                key={preset}
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[0.6875rem]"
                                onClick={() => patch({ ms: preset })}
                            >
                                {preset}
                            </Button>
                        ))}
                    </div>
                </div>
            );

        case "randomBranch": {
            const branches = randomBranches(data);
            const total = branches.reduce((sum, branch) => sum + Math.max(0, branch.weight), 0);

            return (
                <div className="flex flex-col gap-2">
                    <Label className="text-xs">{t("branches")}</Label>
                    {branches.map((branch, index) => (
                        <div key={branch.id} className="flex items-center gap-1.5">
                            <Input
                                value={branch.label}
                                onChange={(event) =>
                                    patch({
                                        branches: branches.map((row, at) =>
                                            at === index
                                                ? { ...row, label: event.target.value }
                                                : row,
                                        ) as unknown as JsonValue,
                                    })
                                }
                                aria-label={t("branchLabel")}
                                className="h-8 text-xs"
                            />
                            <Input
                                type="number"
                                min={0}
                                value={branch.weight}
                                onChange={(event) =>
                                    patch({
                                        branches: branches.map((row, at) =>
                                            at === index
                                                ? { ...row, weight: Number(event.target.value) }
                                                : row,
                                        ) as unknown as JsonValue,
                                    })
                                }
                                aria-label={t("branchWeight")}
                                className="h-8 w-20 text-xs"
                            />
                            {/* Weights are relative, so the share is shown rather
                                than made the reader's arithmetic problem. */}
                            <span className="text-muted-foreground w-12 shrink-0 text-right text-[0.6875rem] tabular-nums">
                                {total > 0 ? `${Math.round((branch.weight / total) * 100)}%` : "—"}
                            </span>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                                aria-label={t("removeBranch")}
                                onClick={() =>
                                    patch({
                                        branches: branches.filter(
                                            (_, at) => at !== index,
                                        ) as unknown as JsonValue,
                                    })
                                }
                            >
                                <IconTrash className="size-3.5" aria-hidden="true" />
                            </Button>
                        </div>
                    ))}
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit gap-1.5"
                        onClick={() =>
                            patch({
                                branches: [
                                    ...branches,
                                    { id: freeEntryId(branches, "b"), label: "", weight: 10 },
                                ] as unknown as JsonValue,
                            })
                        }
                    >
                        <IconPlus className="size-3.5" aria-hidden="true" />
                        {t("addBranch")}
                    </Button>
                </div>
            );
        }

        case "setVariable":
            return (
                <div className="flex flex-col gap-3">
                    <Field label={t("variableName")}>
                        <Input
                            value={readString(data, "name")}
                            onChange={(event) => patch({ name: event.target.value })}
                            placeholder="userId"
                            className="h-9 font-mono text-xs"
                        />
                    </Field>
                    <Field label={t("variableValue")}>
                        <ValueEditor
                            value={readExpr(data, "value")}
                            onChange={(value) => patch({ value: value as unknown as JsonValue })}
                        />
                    </Field>
                </div>
            );

        case "log":
            return (
                <div className="flex flex-col gap-3">
                    <Field label={t("logLevel")}>
                        <select
                            value={readString(data, "level", "info")}
                            onChange={(event) => patch({ level: event.target.value })}
                            className={SELECT_CLASS}
                        >
                            {(["debug", "info", "warn"] as const).map((level) => (
                                <option key={level} value={level}>
                                    {level}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label={t("logMessage")} hint={t("logHint")}>
                        <ValueEditor
                            value={readExpr(data, "message")}
                            onChange={(message) =>
                                patch({ message: message as unknown as JsonValue })
                            }
                        />
                    </Field>
                </div>
            );

        default:
            return <p className="text-muted-foreground text-xs">{t("noOptions")}</p>;
    }
}

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-xs">{label}</Label>
            {hint !== undefined ? (
                <p className="text-muted-foreground text-[0.6875rem] leading-normal">{hint}</p>
            ) : null}
            {children}
        </div>
    );
}
