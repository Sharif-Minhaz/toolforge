import { DEFAULT_CONTENT_TYPE } from "./content-type";
import type { CountExpr, JsonValue, ObjectField, ValueExpr, ValueKind } from "../types/graph";

/**
 * Editing a value tree, as pure functions over an immutable structure.
 *
 * The Response Builder is a tree editor, and a tree editor is mostly one hard
 * problem: changing something six levels down without mutating anything and
 * without the caller having to thread the whole path by hand. Everything here
 * exists so the React component is a renderer with no logic in it — every
 * operation the reader can perform is a function on this page, and every one is
 * unit-tested without a DOM.
 *
 * A path is a list of steps rather than a dotted string, because the tree has
 * four different kinds of descent — into an object field, into an array's item
 * template, into one branch of a choice, into a template part — and a string
 * would have to encode which, badly.
 */

export type ValueStep =
    | { readonly kind: "field"; readonly index: number }
    | { readonly kind: "of" }
    | { readonly kind: "option"; readonly index: number }
    | { readonly kind: "part"; readonly index: number };

export type ValuePath = readonly ValueStep[];

/** Reads the expression at a path, or null when the path no longer fits. */
export function readAt(root: ValueExpr, path: ValuePath): ValueExpr | null {
    let current: ValueExpr = root;

    for (const step of path) {
        const next = descend(current, step);

        if (next === null) {
            return null;
        }

        current = next;
    }

    return current;
}

function descend(expr: ValueExpr, step: ValueStep): ValueExpr | null {
    if (step.kind === "field") {
        return expr.kind === "object" ? (expr.fields[step.index]?.value ?? null) : null;
    }

    if (step.kind === "of") {
        return expr.kind === "array" ? expr.of : null;
    }

    if (step.kind === "option") {
        return expr.kind === "oneOf" ? (expr.options[step.index] ?? null) : null;
    }

    if (expr.kind !== "template") {
        return null;
    }

    const part = expr.parts[step.index];

    return typeof part === "string" || part === undefined ? null : part;
}

/**
 * Returns a copy of the tree with the expression at `path` replaced.
 *
 * A path that no longer fits returns the tree unchanged rather than throwing.
 * That matters because a render and a click are separated by time: a row can be
 * removed by one action while another is mid-flight, and losing the edit is a
 * far better outcome than losing the document.
 */
export function writeAt(root: ValueExpr, path: ValuePath, next: ValueExpr): ValueExpr {
    if (path.length === 0) {
        return next;
    }

    const [step, ...rest] = path;
    const child = descend(root, step);

    if (child === null) {
        return root;
    }

    const updated = writeAt(child, rest, next);

    switch (step.kind) {
        case "field":
            return root.kind === "object"
                ? {
                      ...root,
                      fields: root.fields.map((field, index) =>
                          index === step.index ? { ...field, value: updated } : field,
                      ),
                  }
                : root;
        case "of":
            return root.kind === "array" ? { ...root, of: updated } : root;
        case "option":
            return root.kind === "oneOf"
                ? {
                      ...root,
                      options: root.options.map((option, index) =>
                          index === step.index ? updated : option,
                      ),
                  }
                : root;
        default:
            return root.kind === "template"
                ? {
                      ...root,
                      parts: root.parts.map((part, index) =>
                          index === step.index ? updated : part,
                      ),
                  }
                : root;
    }
}

/** Renames one key of the object at `path`. */
export function renameFieldAt(
    root: ValueExpr,
    path: ValuePath,
    index: number,
    key: string,
): ValueExpr {
    const parent = readAt(root, path);

    if (parent === null || parent.kind !== "object") {
        return root;
    }

    return writeAt(root, path, {
        ...parent,
        fields: parent.fields.map((field, at) => (at === index ? { ...field, key } : field)),
    });
}

const DEFAULT_COUNT: CountExpr = { kind: "fixed", n: 3 };

/**
 * What a newly picked kind starts as.
 *
 * Every one produces something valid immediately, so switching a row's kind
 * never leaves the document in a state that cannot be saved. An object starts
 * empty rather than with a blank field, because the tree renders one trailing
 * blank row of its own — see `visibleFields`.
 */
export function defaultValueFor(kind: ValueKind): ValueExpr {
    switch (kind) {
        case "static":
            return { kind: "static", value: "" };
        case "request":
            return { kind: "request", source: "body", path: "" };
        case "env":
            return { kind: "env", key: "" };
        case "var":
            return { kind: "var", name: "" };
        case "faker":
            return { kind: "faker", fn: "personFullName" };
        case "uuid":
            return { kind: "uuid" };
        case "now":
            return { kind: "now", format: "iso" };
        case "template":
            return { kind: "template", parts: [""] };
        case "object":
            return { kind: "object", fields: [] };
        case "array":
            return { kind: "array", of: { kind: "static", value: "" }, count: DEFAULT_COUNT };
        default:
            return { kind: "oneOf", options: [{ kind: "static", value: "" }] };
    }
}

/**
 * Changes a row's kind while keeping whatever still makes sense.
 *
 * Switching from `object` to `array` keeps nothing, and that is correct. But
 * switching between two scalar kinds and back should not silently destroy a
 * path somebody typed, so the shared fields survive the round trip.
 */
export function changeKind(expr: ValueExpr, kind: ValueKind): ValueExpr {
    if (expr.kind === kind) {
        return expr;
    }

    const fresh = defaultValueFor(kind);

    if (fresh.kind === "array" && expr.kind === "object") {
        // An object becoming an array of that object is what somebody almost
        // always means by "make this a list".
        return { ...fresh, of: expr };
    }

    return fresh;
}

/** Appends a field to the object at `path`. */
export function addFieldAt(root: ValueExpr, path: ValuePath, key = ""): ValueExpr {
    const parent = readAt(root, path);

    if (parent === null || parent.kind !== "object") {
        return root;
    }

    return writeAt(root, path, {
        ...parent,
        fields: [...parent.fields, { key, value: defaultValueFor("static") }],
    });
}

export function removeFieldAt(root: ValueExpr, path: ValuePath, index: number): ValueExpr {
    const parent = readAt(root, path);

    if (parent === null || parent.kind !== "object") {
        return root;
    }

    return writeAt(root, path, {
        ...parent,
        fields: parent.fields.filter((_, at) => at !== index),
    });
}

/**
 * Copies a field, giving the copy a name that is free.
 *
 * Duplicating onto an existing key would silently drop one of the two on
 * serialisation, because a JSON object cannot hold the same key twice.
 */
export function duplicateFieldAt(root: ValueExpr, path: ValuePath, index: number): ValueExpr {
    const parent = readAt(root, path);

    if (parent === null || parent.kind !== "object") {
        return root;
    }

    const source = parent.fields[index];

    if (source === undefined) {
        return root;
    }

    const copy: ObjectField = { key: freeKey(parent.fields, source.key), value: source.value };
    const fields = [...parent.fields];
    fields.splice(index + 1, 0, copy);

    return writeAt(root, path, { ...parent, fields });
}

function freeKey(fields: readonly ObjectField[], key: string): string {
    const taken = new Set(fields.map((field) => field.key));

    if (key === "") {
        return "";
    }

    let candidate = `${key}Copy`;
    let counter = 2;

    while (taken.has(candidate)) {
        candidate = `${key}Copy${counter}`;
        counter += 1;
    }

    return candidate;
}

/**
 * Moves a field one place up or down.
 *
 * Reordering exists as buttons rather than only as dragging because a keyboard
 * user has to be able to do it — the site-wide rule that no affordance is
 * pointer-only. Object key order is not semantically meaningful in JSON, but it
 * is meaningful to whoever is reading the response.
 */
export function moveFieldAt(
    root: ValueExpr,
    path: ValuePath,
    index: number,
    direction: -1 | 1,
): ValueExpr {
    const parent = readAt(root, path);

    if (parent === null || parent.kind !== "object") {
        return root;
    }

    const target = index + direction;

    if (target < 0 || target >= parent.fields.length) {
        return root;
    }

    const fields = [...parent.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];

    return writeAt(root, path, { ...parent, fields });
}

export function addOptionAt(root: ValueExpr, path: ValuePath): ValueExpr {
    const parent = readAt(root, path);

    if (parent === null || parent.kind !== "oneOf") {
        return root;
    }

    return writeAt(root, path, {
        ...parent,
        options: [...parent.options, defaultValueFor("static")],
    });
}

export function removeOptionAt(root: ValueExpr, path: ValuePath, index: number): ValueExpr {
    const parent = readAt(root, path);

    // Never below one option: an empty choice resolves to null, which is a
    // state the editor should not be able to produce by pressing a button.
    if (parent === null || parent.kind !== "oneOf" || parent.options.length <= 1) {
        return root;
    }

    return writeAt(root, path, {
        ...parent,
        options: parent.options.filter((_, at) => at !== index),
    });
}

/** Serialises a path so React can key a row by it. */
export function pathKey(path: ValuePath): string {
    return path
        .map((step) =>
            step.kind === "of" ? "of" : `${step.kind[0]}${(step as { index: number }).index}`,
        )
        .join(".");
}

/**
 * Turns a plain JSON value into a tree of static expressions.
 *
 * What the JSON tab hands back to the tree tab. Objects and arrays become real
 * `object` and `array` nodes rather than one opaque `static` blob, or pasting
 * JSON would produce a document the tree editor cannot show — which is exactly
 * the trap that makes most "code view" escape hatches one-way.
 */
export function fromJson(value: JsonValue): ValueExpr {
    if (Array.isArray(value)) {
        return value.length === 0
            ? { kind: "array", of: { kind: "static", value: "" }, count: { kind: "fixed", n: 0 } }
            : {
                  // An array of literals keeps its first element as the template
                  // and its real length as the count. Lossy for a ragged array,
                  // and the JSON tab is what stays authoritative for those.
                  kind: "array",
                  of: fromJson(value[0]),
                  count: { kind: "fixed", n: value.length },
              };
    }

    if (value !== null && typeof value === "object") {
        return {
            kind: "object",
            fields: Object.entries(value).map(([key, child]) => ({
                key,
                value: fromJson(child),
            })),
        };
    }

    return { kind: "static", value };
}

/**
 * Whether a tree is made only of literals.
 *
 * This decides whether the JSON tab is an editor or a viewer, and the
 * distinction is the honest one. A tree containing a `faker` or a `request`
 * value has no JSON spelling — there is no literal that means "a different name
 * each call" — so a two-way JSON view over it would have to invent one and lose
 * it on the way back. Most code-view escape hatches are lossy in exactly this
 * way and never say so; this one says so.
 */
export function isAllStatic(expr: ValueExpr): boolean {
    switch (expr.kind) {
        case "static":
            return true;
        case "object":
            return expr.fields.every((field) => isAllStatic(field.value));
        case "array":
            return expr.count.kind === "fixed" && isAllStatic(expr.of);
        default:
            return false;
    }
}

/**
 * The JSON an all-static tree stands for.
 *
 * Returns `null` for anything dynamic rather than guessing, so a caller cannot
 * accidentally render a lossy view as though it were the real thing.
 */
export function toJson(expr: ValueExpr): JsonValue | null {
    if (!isAllStatic(expr)) {
        return null;
    }

    if (expr.kind === "static") {
        return expr.value;
    }

    if (expr.kind === "object") {
        const out: Record<string, JsonValue> = {};

        for (const field of expr.fields) {
            if (field.key === "") {
                continue;
            }

            out[field.key] = toJson(field.value) as JsonValue;
        }

        return out;
    }

    if (expr.kind === "array" && expr.count.kind === "fixed") {
        const item = toJson(expr.of) as JsonValue;

        return Array.from({ length: Math.max(0, Math.floor(expr.count.n)) }, () =>
            // Deep-copied per element, or every row of the rendered array would
            // be the same object reference and an edit to one would change all.
            structuredClone(item),
        );
    }

    return null;
}

/** The response node a new endpoint starts with, as the builder sees it. */
export const DEFAULT_RESPONSE_BODY: ValueExpr = {
    kind: "object",
    fields: [{ key: "message", value: { kind: "static", value: "Hello from ToolForge" } }],
};

export const DEFAULT_RESPONSE_CONTENT_TYPE = DEFAULT_CONTENT_TYPE;
