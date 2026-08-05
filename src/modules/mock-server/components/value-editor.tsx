"use client";

import { useCallback, useState } from "react";

import {
    addFieldAt,
    addOptionAt,
    changeKind,
    duplicateFieldAt,
    moveFieldAt,
    pathKey,
    readAt,
    removeFieldAt,
    removeOptionAt,
    renameFieldAt,
    writeAt,
    type ValuePath,
} from "../domain/value-edit";
import type { ValueExpr, ValueKind } from "../types/graph";
import { ValueRow, type RowActions } from "./value-row";

/**
 * A value tree, with no chrome around it.
 *
 * Extracted from the Response Builder when the logic nodes needed the same
 * editor for a condition's operands and a variable's value — the "lift it the
 * moment a second caller needs it" rule. The builder keeps the tabs and the
 * JSON escape hatch; this is the tree alone, which is all an inspector wants
 * for a single expression.
 */

type ValueEditorProps = {
    value: ValueExpr;
    onChange: (next: ValueExpr) => void;
    label?: string;
};

/** The action set every row needs, bound to one root and one setter. */
export function useValueActions(value: ValueExpr, onChange: (next: ValueExpr) => void): RowActions {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

    return {
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
}

export function ValueEditor({ value, onChange, label }: ValueEditorProps) {
    const actions = useValueActions(value, onChange);

    return (
        // No `overflow-x-auto`: the rows wrap now, so a horizontal scrollbar
        // here would only ever mean something inside has forgotten `min-w-0`.
        <div className="border-border/70 bg-card/60 min-w-0 rounded-xl border p-2">
            <ul className="min-w-0">
                <ValueRow expr={value} path={[]} depth={0} actions={actions} label={label} />
            </ul>
        </div>
    );
}
