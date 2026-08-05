"use client";

import { IconAlertTriangle, IconBraces, IconListTree } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import { StatusStrip } from "@/modules/tools/components/status-strip";

import {
    addFieldAt,
    addOptionAt,
    changeKind,
    fromJson,
    isAllStatic,
    pathKey,
    duplicateFieldAt,
    moveFieldAt,
    readAt,
    removeFieldAt,
    removeOptionAt,
    renameFieldAt,
    toJson,
    writeAt,
    type ValuePath,
} from "../domain/value-edit";
import type { JsonValue, ValueExpr, ValueKind } from "../types/graph";
import { ValueRow, type RowActions } from "./value-row";

type ResponseBuilderProps = {
    value: ValueExpr;
    onChange: (next: ValueExpr) => void;
};

type Tab = "tree" | "json";

/**
 * The tree editor that replaces writing JSON by hand.
 *
 * This is the part of the brief that mattered most — *"DO NOT make users write
 * JSON"* — so the tree is the default tab and the JSON one is an escape hatch,
 * not the other way round.
 *
 * **The escape hatch is honest about being one.** A tree containing a `faker` or
 * a `request` value has no JSON spelling: there is no literal that means "a
 * different name on every call". So the JSON tab is a two-way editor only while
 * the tree is entirely static, and otherwise says plainly that the tree is the
 * authority and offers to replace it. Most code views in tools like this are
 * quietly lossy in exactly that situation; this one refuses to be.
 *
 * All the editing lives in `domain/value-edit.ts`. What is here is state and
 * layout — which is why the whole set of operations is unit-tested with no DOM.
 */
export function ResponseBuilder({ value, onChange }: ResponseBuilderProps) {
    const t = useTranslations("mockServer.builder");
    const jsonId = useId();

    const [tab, setTab] = useState<Tab>("tree");
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [draft, setDraft] = useState<string | null>(null);
    const [jsonError, setJsonError] = useState(false);

    const staticOnly = useMemo(() => isAllStatic(value), [value]);

    // Derived during render rather than kept in state: two copies of one value
    // held in step by an effect is the version that drifts, and it drifts on the
    // input nobody tested. The draft only exists while somebody is typing.
    const rendered = useMemo(() => {
        const json = toJson(value);

        return json === null ? "" : JSON.stringify(json, null, 4);
    }, [value]);

    const actions: RowActions = {
        onKindChange: useCallback(
            (path: ValuePath, kind: ValueKind) => {
                const current = readAt(value, path);

                if (current !== null) {
                    onChange(writeAt(value, path, changeKind(current, kind)));
                }
            },
            [value, onChange],
        ),
        onValueChange: useCallback(
            (path: ValuePath, next: ValueExpr) => onChange(writeAt(value, path, next)),
            [value, onChange],
        ),
        onRenameField: useCallback(
            (parent: ValuePath, index: number, key: string) =>
                onChange(renameFieldAt(value, parent, index, key)),
            [value, onChange],
        ),
        onAddField: useCallback(
            (parent: ValuePath) => onChange(addFieldAt(value, parent)),
            [value, onChange],
        ),
        onRemoveField: useCallback(
            (parent: ValuePath, index: number) => onChange(removeFieldAt(value, parent, index)),
            [value, onChange],
        ),
        onDuplicateField: useCallback(
            (parent: ValuePath, index: number) => onChange(duplicateFieldAt(value, parent, index)),
            [value, onChange],
        ),
        onMoveField: useCallback(
            (parent: ValuePath, index: number, direction: -1 | 1) =>
                onChange(moveFieldAt(value, parent, index, direction)),
            [value, onChange],
        ),
        onAddOption: useCallback(
            (path: ValuePath) => onChange(addOptionAt(value, path)),
            [value, onChange],
        ),
        onRemoveOption: useCallback(
            (path: ValuePath, index: number) => onChange(removeOptionAt(value, path, index)),
            [value, onChange],
        ),
        isCollapsed: useCallback((path: ValuePath) => collapsed.has(pathKey(path)), [collapsed]),
        onToggleCollapse: useCallback((path: ValuePath) => {
            const key = pathKey(path);

            setCollapsed((held) => {
                const next = new Set(held);

                if (!next.delete(key)) {
                    next.add(key);
                }

                return next;
            });
        }, []),
    };

    function applyJson() {
        try {
            const parsed = JSON.parse(draft ?? rendered) as JsonValue;
            setJsonError(false);
            setDraft(null);
            onChange(fromJson(parsed));
            setTab("tree");
        } catch {
            // The engine's own message is host-derived — V8 and JavaScriptCore
            // word it differently — so it is never rendered. See `body-text.ts`.
            setJsonError(true);
        }
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div
                role="tablist"
                aria-label={t("tabsLabel")}
                className="bg-muted/60 inline-flex w-fit rounded-xl p-1"
            >
                {(["tree", "json"] as const).map((option) => (
                    <button
                        key={option}
                        type="button"
                        role="tab"
                        aria-selected={tab === option}
                        onClick={() => setTab(option)}
                        className={cn(
                            "focus-visible:ring-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                            tab === option
                                ? "bg-card text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {option === "tree" ? (
                            <IconListTree className="size-3.5" aria-hidden="true" />
                        ) : (
                            <IconBraces className="size-3.5" aria-hidden="true" />
                        )}
                        {option === "tree" ? t("tabTree") : t("tabJson")}
                    </button>
                ))}
            </div>

            {tab === "tree" ? (
                <div className="border-border/70 bg-card/60 min-w-0 overflow-x-auto rounded-xl border p-2">
                    <ul className="min-w-0">
                        <ValueRow
                            expr={value}
                            path={[]}
                            depth={0}
                            actions={actions}
                            label={t("root")}
                        />
                    </ul>
                </div>
            ) : (
                <div className="flex min-w-0 flex-col gap-2">
                    {staticOnly ? null : (
                        <div className="border-brand-amber/45 bg-brand-amber/6 flex items-start gap-2 rounded-xl border p-3">
                            <IconAlertTriangle
                                className="text-brand-amber mt-0.5 size-4 shrink-0"
                                stroke={2}
                                aria-hidden="true"
                            />
                            <p className="text-muted-foreground text-xs leading-relaxed">
                                {t("dynamicNotice")}
                            </p>
                        </div>
                    )}

                    <CodeEditor
                        id={jsonId}
                        value={draft ?? rendered}
                        onChange={(next) => {
                            setDraft(next);
                            setJsonError(false);
                        }}
                        language="json"
                        placeholder='{ "message": "hello" }'
                        className="min-h-56"
                    />

                    <div className="flex flex-wrap items-center gap-3">
                        <Button type="button" size="sm" onClick={applyJson}>
                            {staticOnly ? t("applyJson") : t("replaceWithJson")}
                        </Button>
                        {draft !== null ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    setDraft(null);
                                    setJsonError(false);
                                }}
                            >
                                {t("discardJson")}
                            </Button>
                        ) : null}
                        {jsonError ? <StatusStrip tone="error" message={t("invalidJson")} /> : null}
                    </div>
                </div>
            )}
        </div>
    );
}
