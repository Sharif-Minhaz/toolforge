"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { StatusStrip } from "@/modules/tools/components/status-strip";

import { AUTH_MODES } from "../domain/auth-check";
import { COMPARE_OPS } from "../domain/compare";
import { MAX_DELAY_MS, MAX_NODE_FIELD_LENGTH, MAX_NODE_VALUE_LENGTH } from "../domain/constants";
import { readDeclaredShape } from "../domain/graph-edit";
import {
    DEFAULT_MISSING_VARIABLE,
    nodeDefinition,
    randomBranches,
    requiredFields,
    switchCases,
} from "../domain/node-registry";
import { collectObservedPaths } from "../domain/suggest-path";
import {
    REQUEST_SOURCES,
    type DeclaredField,
    type GraphNode,
    type JsonValue,
    type ValueExpr,
} from "../types/graph";
import { ValueEditor } from "./value-editor";
import { RequestPathPicker } from "./value-row";

/**
 * The form for whichever node is selected.
 *
 * One component with a branch per kind rather than a registry of components:
 * every inspector is four controls over a `Record<string, JsonValue>`, and
 * one file per kind would be a dozen places for the label spacing to drift. The
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

/**
 * The rail's dropdowns, on the same Select every option panel on the site uses.
 *
 * A native `<select>` was what these were, and it was the one control here the
 * platform drew itself: the popup came from the operating system, so it ignored
 * the theme, the radius and the type scale, and beside a Base UI trigger two
 * rows up it read as a control belonging to a different application.
 *
 * `items` goes on the root as well as the list, and that is not redundant —
 * Base UI reads the value-to-label map from there, and without it the trigger
 * renders the raw stored value (`notEquals`, `randomBranch`) instead of its
 * label. The same note is on `OptionSelect`, which this deliberately does not
 * reuse: that one carries its own `<Label>` and column, and half of these sit
 * inline in a row beside a path box and a delete button.
 */
function InspectorSelect<T extends string>({
    value,
    values,
    items,
    label,
    onChange,
    className,
}: {
    value: string;
    values: readonly T[];
    items: Record<string, ReactNode>;
    /** Names the control. Matches the visible `Field` label where there is one. */
    label: string;
    onChange: (next: T) => void;
    className?: string;
}) {
    return (
        <Select
            items={items}
            value={value}
            onValueChange={(next) => {
                if (next !== null) {
                    onChange(next as T);
                }
            }}
        >
            <SelectTrigger aria-label={label} className={cn("w-full text-xs", className)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
                {values.map((item) => (
                    <SelectItem key={item} value={item} className="text-xs">
                        {items[item]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

const LOG_LEVELS = ["debug", "info", "warn"] as const;

/** Level names are the words the trace prints, so they are not translated. */
const LOG_LEVEL_ITEMS: Record<string, ReactNode> = Object.fromEntries(
    LOG_LEVELS.map((level) => [level, level]),
);

export function NodeInspector({ node, onChange }: NodeInspectorProps) {
    const t = useTranslations("mockServer.inspector");
    const tOps = useTranslations("mockServer.compareOps");
    const tAuth = useTranslations("mockServer.authModes");
    const tBuilder = useTranslations("mockServer.builder");
    const tStudio = useTranslations("mockServer.studio");

    const data = asRecord(node.data);
    const patch = (next: Record<string, JsonValue>) => onChange({ ...data, ...next });

    // Rebuilt each render rather than memoised: a dozen entries costs less than
    // the dependency array that would keep them, and only one of the three is
    // ever mounted at a time.
    const authItems: Record<string, ReactNode> = Object.fromEntries(
        AUTH_MODES.map((mode) => [mode, tAuth(mode)]),
    );
    const opItems: Record<string, ReactNode> = Object.fromEntries(
        COMPARE_OPS.map((op) => [op, tOps(op)]),
    );
    const sourceItems: Record<string, ReactNode> = Object.fromEntries(
        REQUEST_SOURCES.map((source) => [source, tBuilder(`sources.${source}`)]),
    );

    if (!nodeDefinition(node.kind).implemented) {
        return <StatusStrip tone="warning" message={tStudio("nodeNotReady")} />;
    }

    switch (node.kind) {
        case "request":
            return <RequestNodeSummary data={data} />;

        case "validate": {
            const fields = requiredFields(data);

            return (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <Label className="text-xs">{t("requiredFields")}</Label>
                        <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                            {t("requiredFieldsHint")}
                        </p>

                        {fields.map((field, index) => (
                            // `flex-wrap`, because `RequestPathPicker` renders its
                            // suggestion list as a `basis-full` sibling that has to
                            // wrap under the row rather than fight it for width.
                            <div key={field.id} className="flex flex-wrap items-center gap-1.5">
                                <InspectorSelect
                                    value={field.source}
                                    values={REQUEST_SOURCES}
                                    items={sourceItems}
                                    label={tBuilder("sourceLabel")}
                                    onChange={(source) =>
                                        patch({
                                            fields: fields.map((row, at) =>
                                                at === index ? { ...row, source } : row,
                                            ) as unknown as JsonValue,
                                        })
                                    }
                                    className="w-auto min-w-24 flex-none"
                                />

                                <RequestPathPicker
                                    source={field.source}
                                    value={field.path}
                                    onChange={(path) =>
                                        patch({
                                            fields: fields.map((row, at) =>
                                                at === index ? { ...row, path } : row,
                                            ) as unknown as JsonValue,
                                        })
                                    }
                                    className="h-8 min-w-0 flex-1 basis-32 text-xs"
                                />

                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                                    aria-label={t("removeRequiredField")}
                                    onClick={() =>
                                        patch({
                                            fields: fields.filter(
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
                                    fields: [
                                        ...fields,
                                        {
                                            id: freeEntryId(fields, "f"),
                                            source: "header",
                                            path: "",
                                        },
                                    ] as unknown as JsonValue,
                                })
                            }
                        >
                            <IconPlus className="size-3.5" aria-hidden="true" />
                            {t("addRequiredField")}
                        </Button>
                    </div>

                    <Field label={t("missingVariable")} hint={t("missingVariableHint")}>
                        <Input
                            maxLength={MAX_NODE_FIELD_LENGTH}
                            value={readString(data, "saveAs", DEFAULT_MISSING_VARIABLE)}
                            onChange={(event) => patch({ saveAs: event.target.value })}
                            className="h-9 font-mono text-xs"
                        />
                    </Field>
                </div>
            );
        }

        case "auth":
            return (
                <div className="flex flex-col gap-3">
                    <Field label={t("authMode")}>
                        <InspectorSelect
                            value={readString(data, "mode", "none")}
                            values={AUTH_MODES}
                            items={authItems}
                            label={t("authMode")}
                            onChange={(mode) => patch({ mode })}
                        />
                    </Field>

                    {readString(data, "mode", "none") === "apiKey" ? (
                        <Field label={t("authHeader")}>
                            <Input
                                maxLength={MAX_NODE_FIELD_LENGTH}
                                value={readString(data, "header", "x-api-key")}
                                onChange={(event) => patch({ header: event.target.value })}
                                className="h-9 font-mono text-xs"
                            />
                        </Field>
                    ) : null}

                    {readString(data, "mode", "none") !== "none" ? (
                        <Field label={t("authValue")} hint={t("authValueHint")}>
                            <Input
                                maxLength={MAX_NODE_VALUE_LENGTH}
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
                        <InspectorSelect
                            value={readString(data, "op", "equals")}
                            values={COMPARE_OPS}
                            items={opItems}
                            label={t("conditionOp")}
                            onChange={(op) => patch({ op })}
                        />
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
                                    maxLength={MAX_NODE_FIELD_LENGTH}
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
                                    className="h-8 min-w-0 flex-1 text-xs"
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
                            className="no-spinner h-9 text-xs"
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
                                maxLength={MAX_NODE_FIELD_LENGTH}
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
                                className="h-8 min-w-0 flex-1 text-xs"
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
                                // `no-spinner` and wider: Chrome takes the
                                // stepper's width out of the content box, so a
                                // three-digit weight rendered under the arrows.
                                className="no-spinner h-8 w-14 shrink-0 text-xs"
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
                            maxLength={MAX_NODE_FIELD_LENGTH}
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
                        <InspectorSelect
                            value={readString(data, "level", "info")}
                            values={LOG_LEVELS}
                            items={LOG_LEVEL_ITEMS}
                            label={t("logLevel")}
                            onChange={(level) => patch({ level })}
                        />
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

/**
 * The entry node's panel: a sentence, and what a document said, when there is one.
 *
 * Read-only on purpose. This is not configuration the reader typed — it is what
 * the import found, and a form over it would invite editing a record of
 * something that happened rather than the behaviour it produced. What enforces
 * any of it is the `validate` node, which *is* editable and sits right there on
 * the canvas.
 */
function RequestNodeSummary({ data }: { data: Record<string, JsonValue> }) {
    const t = useTranslations("mockServer.inspector");
    const declared = readDeclaredShape(data);
    const bodyFields = declared === null ? [] : [...collectObservedPaths(declared.body).keys()];

    if (declared === null) {
        return <p className="text-muted-foreground text-xs">{t("requestHint")}</p>;
    }

    return (
        <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">{t("requestHint")}</p>

            <div className="border-border/70 flex min-w-0 flex-col gap-2 rounded-lg border p-3">
                <p className="text-foreground text-xs font-medium">{t("declaredTitle")}</p>
                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("declaredHint")}
                </p>

                <DeclaredGroup label={t("declaredHeaders")} fields={declared.headers} />
                <DeclaredGroup label={t("declaredQuery")} fields={declared.query} />

                {bodyFields.length > 0 ? (
                    <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                        {t("declaredBody", { count: bodyFields.length })}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

/**
 * One list of declared names, required ones marked.
 *
 * The asterisk is not the only carrier of the fact: each chip's title says it
 * in words, because a mark distinguishable only by a symbol is a mark somebody
 * reading with a screen reader does not get.
 */
function DeclaredGroup({ label, fields }: { label: string; fields: readonly DeclaredField[] }) {
    const t = useTranslations("mockServer.inspector");

    if (fields.length === 0) {
        return null;
    }

    return (
        <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground text-[0.625rem] font-semibold tracking-[0.09em] uppercase">
                {label}
            </span>
            <ul className="flex flex-wrap gap-1">
                {fields.map((field) => (
                    <li
                        key={field.name}
                        className="border-border/70 bg-muted/40 rounded-md border px-1.5 py-0.5 font-mono text-[0.6875rem]"
                    >
                        {field.name}
                        {field.required ? (
                            <span className="text-brand-rose ml-0.5" aria-hidden="true">
                                *
                            </span>
                        ) : null}
                        <span className="sr-only">
                            {" "}
                            {t(field.required ? "declaredRequired" : "declaredOptional")}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
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
