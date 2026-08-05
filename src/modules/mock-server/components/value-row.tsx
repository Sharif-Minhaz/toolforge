"use client";

import {
    IconChevronDown,
    IconChevronRight,
    IconCopy,
    IconPlus,
    IconTrash,
    IconX,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { FAKER_CATEGORIES, fakerProvidersByCategory } from "../domain/faker-registry";
import { pathKey, type ValuePath } from "../domain/value-edit";
import { VALUE_KINDS, type ValueExpr, type ValueKind } from "../types/graph";

const REQUEST_SOURCES = ["body", "header", "cookie", "query", "param"] as const;

const NOW_FORMATS = ["iso", "epochMs", "epochSeconds"] as const;

export type RowActions = {
    readonly onKindChange: (path: ValuePath, kind: ValueKind) => void;
    readonly onValueChange: (path: ValuePath, next: ValueExpr) => void;
    readonly onRenameField: (parent: ValuePath, index: number, key: string) => void;
    readonly onAddField: (parent: ValuePath) => void;
    readonly onRemoveField: (parent: ValuePath, index: number) => void;
    readonly onDuplicateField: (parent: ValuePath, index: number) => void;
    readonly onMoveField: (parent: ValuePath, index: number, direction: -1 | 1) => void;
    readonly onAddOption: (path: ValuePath) => void;
    readonly onRemoveOption: (path: ValuePath, index: number) => void;
    readonly isCollapsed: (path: ValuePath) => boolean;
    readonly onToggleCollapse: (path: ValuePath) => void;
};

type ValueRowProps = {
    expr: ValueExpr;
    path: ValuePath;
    depth: number;
    actions: RowActions;
    /** Absent for the root and for an array's item template. */
    field?: { key: string; index: number; count: number; parent: ValuePath };
    label?: string;
};

/**
 * One row of the Response Builder, and its children.
 *
 * Recursive, because `ValueExpr` is — which is what makes arbitrary nesting free
 * rather than a feature to build. The whole component is a renderer: every
 * operation is a pure function in `domain/value-edit.ts`, so what happens when
 * somebody presses "duplicate" is unit-tested without a DOM.
 *
 * Depth is passed down and used only for indentation. It is deliberately not a
 * limit — `MAX_VALUE_DEPTH` is enforced where it matters, at resolution, and a
 * UI that refuses to *draw* a tree it has already stored would be worse than
 * one that draws it and says it is too deep.
 */
export function ValueRow({ expr, path, depth, actions, field, label }: ValueRowProps) {
    const t = useTranslations("mockServer.builder");
    const tKinds = useTranslations("mockServer.valueKinds");
    const tFaker = useTranslations("mockServer.faker");
    // `fakerCategories` and `nowFormats` are siblings of `builder`, not children
    // of it, so they need their own scopes rather than a dotted key.
    const tCategories = useTranslations("mockServer.fakerCategories");
    const tFormats = useTranslations("mockServer.nowFormats");

    const branching = expr.kind === "object" || expr.kind === "array" || expr.kind === "oneOf";
    const collapsed = branching && actions.isCollapsed(path);

    return (
        <li className="min-w-0">
            <div
                className={cn(
                    "group/row flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg py-1",
                    depth > 0 && "border-border/60 border-l pl-3",
                )}
            >
                {branching ? (
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground size-6 shrink-0"
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? t("expand") : t("collapse")}
                        onClick={() => actions.onToggleCollapse(path)}
                    >
                        {collapsed ? (
                            <IconChevronRight className="size-3.5" aria-hidden="true" />
                        ) : (
                            <IconChevronDown className="size-3.5" aria-hidden="true" />
                        )}
                    </Button>
                ) : (
                    <span className="size-6 shrink-0" aria-hidden="true" />
                )}

                {field !== undefined ? (
                    <Input
                        value={field.key}
                        onChange={(event) =>
                            actions.onRenameField(field.parent, field.index, event.target.value)
                        }
                        placeholder={t("keyPlaceholder")}
                        aria-label={t("keyLabel")}
                        autoComplete="off"
                        spellCheck={false}
                        className="h-8 w-40 shrink-0 font-mono text-xs"
                    />
                ) : label !== undefined ? (
                    <span className="text-muted-foreground w-40 shrink-0 font-mono text-xs">
                        {label}
                    </span>
                ) : null}

                {/*
                 * A native select rather than the shadcn one: this renders once
                 * per row and a tree of sixty fields is sixty popovers to mount
                 * otherwise. It is also the control a keyboard user reaches
                 * fastest, which matters most in the densest part of the UI.
                 */}
                <select
                    value={expr.kind}
                    onChange={(event) =>
                        actions.onKindChange(path, event.target.value as ValueKind)
                    }
                    aria-label={t("kindLabel")}
                    className="border-input bg-card focus-visible:ring-ring h-8 shrink-0 rounded-lg border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
                >
                    {VALUE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                            {tKinds(kind)}
                        </option>
                    ))}
                </select>

                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {expr.kind === "static" ? (
                        <Input
                            value={expr.value === null ? "" : String(expr.value)}
                            onChange={(event) =>
                                actions.onValueChange(path, {
                                    kind: "static",
                                    value: coerceLiteral(event.target.value),
                                })
                            }
                            placeholder={t("literalPlaceholder")}
                            aria-label={t("literalLabel")}
                            autoComplete="off"
                            className="h-8 min-w-0 flex-1 text-xs"
                        />
                    ) : null}

                    {expr.kind === "request" ? (
                        <>
                            <select
                                value={expr.source}
                                onChange={(event) =>
                                    actions.onValueChange(path, {
                                        ...expr,
                                        source: event.target
                                            .value as (typeof REQUEST_SOURCES)[number],
                                    })
                                }
                                aria-label={t("sourceLabel")}
                                className="border-input bg-card focus-visible:ring-ring h-8 shrink-0 rounded-lg border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
                            >
                                {REQUEST_SOURCES.map((source) => (
                                    <option key={source} value={source}>
                                        {t(`sources.${source}`)}
                                    </option>
                                ))}
                            </select>
                            <Input
                                value={expr.path}
                                onChange={(event) =>
                                    actions.onValueChange(path, {
                                        ...expr,
                                        path: event.target.value,
                                    })
                                }
                                placeholder={t("pathPlaceholder")}
                                aria-label={t("pathLabel")}
                                autoComplete="off"
                                spellCheck={false}
                                className="h-8 min-w-0 flex-1 font-mono text-xs"
                            />
                        </>
                    ) : null}

                    {expr.kind === "env" ? (
                        <Input
                            value={expr.key}
                            onChange={(event) =>
                                actions.onValueChange(path, {
                                    kind: "env",
                                    key: event.target.value,
                                })
                            }
                            placeholder="API_BASE"
                            aria-label={t("envLabel")}
                            autoComplete="off"
                            spellCheck={false}
                            className="h-8 min-w-0 flex-1 font-mono text-xs"
                        />
                    ) : null}

                    {expr.kind === "var" ? (
                        <Input
                            value={expr.name}
                            onChange={(event) =>
                                actions.onValueChange(path, {
                                    kind: "var",
                                    name: event.target.value,
                                })
                            }
                            placeholder="userId"
                            aria-label={t("varLabel")}
                            autoComplete="off"
                            spellCheck={false}
                            className="h-8 min-w-0 flex-1 font-mono text-xs"
                        />
                    ) : null}

                    {expr.kind === "faker" ? (
                        <select
                            value={expr.fn}
                            onChange={(event) =>
                                actions.onValueChange(path, {
                                    kind: "faker",
                                    fn: event.target.value,
                                })
                            }
                            aria-label={t("fakerLabel")}
                            className="border-input bg-card focus-visible:ring-ring h-8 min-w-0 flex-1 rounded-lg border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
                        >
                            {FAKER_CATEGORIES.map((category) => (
                                <optgroup key={category} label={tCategories(category)}>
                                    {fakerProvidersByCategory(category).map((provider) => (
                                        <option key={provider.id} value={provider.id}>
                                            {tFaker(provider.id)}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    ) : null}

                    {expr.kind === "now" ? (
                        <select
                            value={expr.format}
                            onChange={(event) =>
                                actions.onValueChange(path, {
                                    kind: "now",
                                    format: event.target.value as (typeof NOW_FORMATS)[number],
                                })
                            }
                            aria-label={t("formatLabel")}
                            className="border-input bg-card focus-visible:ring-ring h-8 min-w-0 flex-1 rounded-lg border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
                        >
                            {NOW_FORMATS.map((format) => (
                                <option key={format} value={format}>
                                    {tFormats(format)}
                                </option>
                            ))}
                        </select>
                    ) : null}

                    {expr.kind === "array" ? (
                        <ArrayCount expr={expr} path={path} actions={actions} />
                    ) : null}

                    {expr.kind === "uuid" ? (
                        <span className="text-muted-foreground truncate text-[0.6875rem]">
                            {t("uuidHint")}
                        </span>
                    ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                    {expr.kind === "object" ? (
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground size-7"
                            aria-label={t("addField")}
                            onClick={() => actions.onAddField(path)}
                        >
                            <IconPlus className="size-3.5" aria-hidden="true" />
                        </Button>
                    ) : null}

                    {expr.kind === "oneOf" ? (
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground size-7"
                            aria-label={t("addOption")}
                            onClick={() => actions.onAddOption(path)}
                        >
                            <IconPlus className="size-3.5" aria-hidden="true" />
                        </Button>
                    ) : null}

                    {field !== undefined ? (
                        <>
                            {/*
                             * Reorder is buttons, not only dragging: no
                             * affordance on this site is pointer-only, and a
                             * tree row is exactly where that rule bites.
                             */}
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground size-7 disabled:opacity-30"
                                aria-label={t("moveUp")}
                                disabled={field.index === 0}
                                onClick={() => actions.onMoveField(field.parent, field.index, -1)}
                            >
                                <IconChevronDown
                                    className="size-3.5 rotate-180"
                                    aria-hidden="true"
                                />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground size-7 disabled:opacity-30"
                                aria-label={t("moveDown")}
                                disabled={field.index >= field.count - 1}
                                onClick={() => actions.onMoveField(field.parent, field.index, 1)}
                            >
                                <IconChevronDown className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground size-7"
                                aria-label={t("duplicate")}
                                onClick={() => actions.onDuplicateField(field.parent, field.index)}
                            >
                                <IconCopy className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive size-7"
                                aria-label={t("removeField")}
                                onClick={() => actions.onRemoveField(field.parent, field.index)}
                            >
                                <IconTrash className="size-3.5" aria-hidden="true" />
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>

            {collapsed ? null : (
                <>
                    {expr.kind === "object" && expr.fields.length > 0 ? (
                        <ul className={cn("min-w-0", depth >= 0 && "ml-3")}>
                            {expr.fields.map((child, index) => (
                                <ValueRow
                                    key={`${pathKey(path)}:f${index}`}
                                    expr={child.value}
                                    path={[...path, { kind: "field", index }]}
                                    depth={depth + 1}
                                    actions={actions}
                                    field={{
                                        key: child.key,
                                        index,
                                        count: expr.fields.length,
                                        parent: path,
                                    }}
                                />
                            ))}
                        </ul>
                    ) : null}

                    {expr.kind === "array" ? (
                        <ul className="ml-3 min-w-0">
                            <ValueRow
                                key={`${pathKey(path)}:of`}
                                expr={expr.of}
                                path={[...path, { kind: "of" }]}
                                depth={depth + 1}
                                actions={actions}
                                label={t("eachItem")}
                            />
                        </ul>
                    ) : null}

                    {expr.kind === "oneOf" ? (
                        <ul className="ml-3 min-w-0">
                            {expr.options.map((option, index) => (
                                <li
                                    key={`${pathKey(path)}:o${index}`}
                                    className="flex min-w-0 gap-1"
                                >
                                    <ul className="min-w-0 flex-1">
                                        <ValueRow
                                            expr={option}
                                            path={[...path, { kind: "option", index }]}
                                            depth={depth + 1}
                                            actions={actions}
                                            label={t("option", { n: index + 1 })}
                                        />
                                    </ul>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="text-muted-foreground hover:text-destructive mt-1 size-7 shrink-0 disabled:opacity-30"
                                        aria-label={t("removeOption")}
                                        disabled={expr.options.length <= 1}
                                        onClick={() => actions.onRemoveOption(path, index)}
                                    >
                                        <IconX className="size-3.5" aria-hidden="true" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </>
            )}
        </li>
    );
}

type ArrayCountProps = {
    expr: Extract<ValueExpr, { kind: "array" }>;
    path: ValuePath;
    actions: RowActions;
};

function ArrayCount({ expr, path, actions }: ArrayCountProps) {
    const t = useTranslations("mockServer.builder");
    const ranged = expr.count.kind === "range";

    return (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <select
                value={expr.count.kind}
                onChange={(event) =>
                    actions.onValueChange(path, {
                        ...expr,
                        count:
                            event.target.value === "range"
                                ? { kind: "range", min: 1, max: 5 }
                                : { kind: "fixed", n: 3 },
                    })
                }
                aria-label={t("countLabel")}
                className="border-input bg-card focus-visible:ring-ring h-8 shrink-0 rounded-lg border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
            >
                <option value="fixed">{t("countFixed")}</option>
                <option value="range">{t("countRange")}</option>
            </select>

            {ranged && expr.count.kind === "range" ? (
                <>
                    <Input
                        type="number"
                        min={0}
                        value={expr.count.min}
                        onChange={(event) =>
                            actions.onValueChange(path, {
                                ...expr,
                                count: {
                                    kind: "range",
                                    min: Number(event.target.value),
                                    max: expr.count.kind === "range" ? expr.count.max : 5,
                                },
                            })
                        }
                        aria-label={t("countMin")}
                        className="h-8 w-20 text-xs"
                    />
                    <Input
                        type="number"
                        min={0}
                        value={expr.count.max}
                        onChange={(event) =>
                            actions.onValueChange(path, {
                                ...expr,
                                count: {
                                    kind: "range",
                                    min: expr.count.kind === "range" ? expr.count.min : 1,
                                    max: Number(event.target.value),
                                },
                            })
                        }
                        aria-label={t("countMax")}
                        className="h-8 w-20 text-xs"
                    />
                </>
            ) : expr.count.kind === "fixed" ? (
                <Input
                    type="number"
                    min={0}
                    value={expr.count.n}
                    onChange={(event) =>
                        actions.onValueChange(path, {
                            ...expr,
                            count: { kind: "fixed", n: Number(event.target.value) },
                        })
                    }
                    aria-label={t("countLabel")}
                    className="h-8 w-24 text-xs"
                />
            ) : null}
        </div>
    );
}

/**
 * What a typed literal becomes.
 *
 * A response body is JSON, so `42` and `"42"` are different values and the
 * editor has to pick one. Numbers, booleans and null are recognised; everything
 * else stays a string, which is the safe default — a phone number that starts
 * with a zero must not silently become an integer.
 */
function coerceLiteral(raw: string): string | number | boolean | null {
    const trimmed = raw.trim();

    if (trimmed === "true") {
        return true;
    }

    if (trimmed === "false") {
        return false;
    }

    if (trimmed === "null") {
        return null;
    }

    // `Number("")` is 0 and `Number(" ")` is 0, so an empty box would become a
    // number the moment somebody cleared it.
    if (trimmed !== "" && /^-?\d+(\.\d+)?$/u.test(trimmed) && !/^-?0\d/u.test(trimmed)) {
        return Number(trimmed);
    }

    return raw;
}
