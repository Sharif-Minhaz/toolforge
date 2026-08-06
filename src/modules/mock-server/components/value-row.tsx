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

import { MAX_NODE_FIELD_LENGTH, MAX_NODE_VALUE_LENGTH } from "../domain/constants";
import { FAKER_CATEGORIES, fakerProvidersByCategory } from "../domain/faker-registry";
import { suggestNames, suggestRequestPaths } from "../domain/suggest-path";
import { pathKey, type ValuePath } from "../domain/value-edit";
import { VALUE_KINDS, type RequestSource, type ValueExpr, type ValueKind } from "../types/graph";
import { PathPicker } from "./path-picker";
import { useEditorSuggestions } from "./suggestion-context";

const REQUEST_SOURCES = ["body", "header", "cookie", "query", "param"] as const;

const NOW_FORMATS = ["iso", "epochMs", "epochSeconds"] as const;

/**
 * One control on the value line, and the width that decides how the line breaks.
 *
 * `basis-40` is 10rem, so two of them plus a gap do not fit the ~19rem of usable
 * width in the studio's inspector rail and each takes a line of its own — which
 * is the shape a three-control row like *From the request → Body → path* needs
 * to be readable at all. The route form is twice as wide and fits two or three
 * across, which is why this is a basis rather than a breakpoint: the same class
 * gives the right answer in both places without either knowing about the other.
 */
const VALUE_CONTROL = "h-8 min-w-0 flex-1 basis-40 text-xs";

/** The same, plus the chrome a bare `<select>` needs to match `Input`. */
const VALUE_SELECT = `border-input bg-card focus-visible:ring-ring rounded-lg border px-2 focus-visible:ring-2 focus-visible:outline-none ${VALUE_CONTROL}`;

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
    const tSuggest = useTranslations("mockServer.suggest");
    const suggestions = useEditorSuggestions();

    const branching = expr.kind === "object" || expr.kind === "array" || expr.kind === "oneOf";
    const collapsed = branching && actions.isCollapsed(path);

    return (
        // A little less than the `gap-2` between siblings: a parent sitting
        // closer to its own children than to the field after it is what makes
        // the nesting readable without another border.
        <li className="flex min-w-0 flex-col gap-1.5">
            {/*
             * Two lines, not one.
             *
             * Everything used to sit on a single flex row with a fixed 10rem key
             * box, which is fine in a full-width panel and unusable in the
             * inspector rail the studio actually puts it in: the row overflowed,
             * the container grew a horizontal scrollbar, and every control ended
             * up a sliver wide. Identity and row actions go on the first line;
             * the kind and its value get the whole width of the second, and wrap
             * among themselves when even that is not enough.
             */}
            <div
                className={cn(
                    "group/row flex min-w-0 flex-col gap-1.5 rounded-lg",
                    // A field is a card, not a line with a rule down one side.
                    // The single left border was carrying two jobs at once —
                    // marking the indent *and* separating one field from the
                    // next — and did the second badly, because a row is two
                    // lines tall and a rule cannot say where one ends. A closed
                    // border says it in one stroke; the indent is then the
                    // margin on the list, which is all it ever needed to be.
                    depth > 0
                        ? "border-border/60 bg-card/40 hover:border-border border p-2 transition-colors"
                        : "py-1",
                )}
            >
                <div className="flex min-w-0 items-center gap-1.5">
                    {/*
                     * No spacer where there is no chevron.
                     *
                     * It was reserving the toggle's width on every row, so a
                     * leaf's key box started 1.9rem in while the kind select
                     * directly beneath it started at the card's own padding —
                     * two controls in one box, neither aligned to the other or
                     * to anything else. Only a row that actually has a chevron
                     * is indented by it now, which is what a tree should look
                     * like anyway: the disclosure is the indent.
                     */}
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
                    ) : null}

                    {field !== undefined ? (
                        <Input
                            maxLength={MAX_NODE_FIELD_LENGTH}
                            value={field.key}
                            onChange={(event) =>
                                actions.onRenameField(field.parent, field.index, event.target.value)
                            }
                            placeholder={t("keyPlaceholder")}
                            aria-label={t("keyLabel")}
                            autoComplete="off"
                            spellCheck={false}
                            // Not `VALUE_CONTROL`: the key shares its line with
                            // the row's buttons and must shrink to fit them
                            // rather than claim a basis and push them off.
                            className="h-8 min-w-0 flex-1 font-mono text-xs"
                        />
                    ) : label !== undefined ? (
                        <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
                            {label}
                        </span>
                    ) : (
                        <span className="flex-1" aria-hidden="true" />
                    )}

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
                                    onClick={() =>
                                        actions.onMoveField(field.parent, field.index, -1)
                                    }
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
                                    onClick={() =>
                                        actions.onMoveField(field.parent, field.index, 1)
                                    }
                                >
                                    <IconChevronDown className="size-3.5" aria-hidden="true" />
                                </Button>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-foreground size-7"
                                    aria-label={t("duplicate")}
                                    onClick={() =>
                                        actions.onDuplicateField(field.parent, field.index)
                                    }
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

                {/* Second line: what the value is, and where it comes from.
                    Flush with the first, at the card's own padding. The two
                    lines describe one field, and a stray indent on either of
                    them reads as a nesting level that is not there — which is
                    what the leading gap under every key box was doing. */}
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                        className={VALUE_SELECT}
                    >
                        {VALUE_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                                {tKinds(kind)}
                            </option>
                        ))}
                    </select>

                    {/*
                     * `contents`, not a nested flex box.
                     *
                     * A box of its own gave the controls inside it their own
                     * wrap context, so in the inspector rail they fought each
                     * other over one line's width instead of wrapping with the
                     * kind select — a request row came out as three slivers with
                     * a path field reading `pr`. With `contents` they are all
                     * siblings in one wrapping row, and `VALUE_CONTROL`'s basis
                     * decides where it breaks: side by side in the wide route
                     * form, one per line in the rail.
                     */}
                    <div className="contents">
                        {expr.kind === "static" ? (
                            <Input
                                maxLength={MAX_NODE_VALUE_LENGTH}
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
                                className={VALUE_CONTROL}
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
                                    className={VALUE_SELECT}
                                >
                                    {REQUEST_SOURCES.map((source) => (
                                        <option key={source} value={source}>
                                            {t(`sources.${source}`)}
                                        </option>
                                    ))}
                                </select>
                                <RequestPathPicker
                                    source={expr.source}
                                    value={expr.path}
                                    onChange={(next) =>
                                        actions.onValueChange(path, { ...expr, path: next })
                                    }
                                />
                            </>
                        ) : null}

                        {expr.kind === "env" ? (
                            <NamePicker
                                names={suggestions.envKeys}
                                origin="observed"
                                value={expr.key}
                                onChange={(key) =>
                                    actions.onValueChange(path, { kind: "env", key })
                                }
                                label={t("envLabel")}
                                placeholder="API_BASE"
                                emptyHint={tSuggest(
                                    suggestions.envKeys.length === 0 ? "emptyEnv" : "emptyMatch",
                                )}
                            />
                        ) : null}

                        {expr.kind === "var" ? (
                            <NamePicker
                                names={suggestions.vars}
                                origin="graph"
                                value={expr.name}
                                onChange={(name) =>
                                    actions.onValueChange(path, { kind: "var", name })
                                }
                                label={t("varLabel")}
                                placeholder="userId"
                                emptyHint={tSuggest(
                                    suggestions.vars.length === 0 ? "emptyVars" : "emptyMatch",
                                )}
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
                                className={VALUE_SELECT}
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
                                className={VALUE_SELECT}
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
                </div>
            </div>

            {collapsed ? null : (
                <>
                    {/*
                     * `gap-2` between siblings, and it is doing real work now
                     * that a row is two lines: without it the second line of one
                     * field and the first of the next sit a single pixel apart,
                     * and the eye groups them as one row rather than two fields.
                     * The gap is what makes the left rule read as an indent
                     * instead of as a solid block.
                     */}
                    {expr.kind === "object" && expr.fields.length > 0 ? (
                        <ul className={cn("flex min-w-0 flex-col gap-2", depth >= 0 && "ml-3")}>
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
                        <ul className="ml-3 flex min-w-0 flex-col gap-2">
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
                        <ul className="ml-3 flex min-w-0 flex-col gap-2">
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

/**
 * The path box for a `request` value, and the words around an empty list.
 *
 * The empty case carries most of the teaching here, so it is answered per
 * source rather than with one line. "Nothing matches" and "this route has never
 * been called" are different facts and lead somewhere different: the first means
 * keep typing, the second means go and send a request. A picker that said
 * "no suggestions" to both would be the same dead end the plain text box was.
 */
function RequestPathPicker({
    source,
    value,
    onChange,
}: {
    source: RequestSource;
    value: string;
    onChange: (next: string) => void;
}) {
    const t = useTranslations("mockServer.builder");
    const tSuggest = useTranslations("mockServer.suggest");
    const { request, loading } = useEditorSuggestions();

    const found = suggestRequestPaths(source, value, request);
    const { samples } = request.observed;
    // `param` is read off the route pattern, so it is complete the moment the
    // route exists and traffic tells it nothing.
    const fromTraffic = source === "body" || source === "query" || source === "header";

    function emptyHint(): string {
        if (source === "cookie") {
            return tSuggest("emptyCookie");
        }

        if (source === "param") {
            return tSuggest(request.params.length === 0 ? "emptyParams" : "emptyMatch");
        }

        return tSuggest(fromTraffic && samples === 0 ? "emptyTraffic" : "emptyMatch");
    }

    return (
        <PathPicker
            value={value}
            onChange={onChange}
            suggestions={found}
            maxLength={MAX_NODE_FIELD_LENGTH}
            loading={loading && fromTraffic}
            emptyHint={emptyHint()}
            sourceHint={
                fromTraffic && samples > 0 ? tSuggest("fromSamples", { count: samples }) : undefined
            }
            label={t("pathLabel")}
            placeholder={t("pathPlaceholder")}
            className={VALUE_CONTROL}
        />
    );
}

/** The same control over a flat list of names — environment keys, variables. */
function NamePicker({
    names,
    origin,
    value,
    onChange,
    label,
    placeholder,
    emptyHint,
}: {
    names: readonly string[];
    origin: "observed" | "graph";
    value: string;
    onChange: (next: string) => void;
    label: string;
    placeholder: string;
    emptyHint: string;
}) {
    return (
        <PathPicker
            value={value}
            onChange={onChange}
            suggestions={suggestNames(names, value, origin)}
            maxLength={MAX_NODE_FIELD_LENGTH}
            emptyHint={emptyHint}
            label={label}
            placeholder={placeholder}
            className={VALUE_CONTROL}
        />
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
        // `contents`, so the count controls join the value row's own wrap rather
        // than forming a second nested flex line that cannot break.
        <div className="contents">
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
                className={VALUE_SELECT}
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
                        // `no-spinner`: Chrome reserves the stepper's width
                        // inside the content box, so in a box this narrow the
                        // arrows sit on top of a three-digit value.
                        className="no-spinner h-8 min-w-0 flex-1 basis-16 text-xs"
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
                        className="no-spinner h-8 min-w-0 flex-1 basis-16 text-xs"
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
                    className="no-spinner h-8 min-w-0 flex-1 basis-20 text-xs"
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
