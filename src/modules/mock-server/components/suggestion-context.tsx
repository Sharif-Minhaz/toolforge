"use client";

import { createContext, use } from "react";

import { EMPTY_REQUEST_FACTS, type RequestFacts } from "../domain/suggest-path";

/**
 * What the path pickers in the value editor know about the route being edited.
 *
 * A context rather than props, and the reason is the shape of the tree it has to
 * cross: `ValueRow` is recursive and sits five components below the one that
 * knows any of this — workbench → studio → inspector → editor → row, and again
 * for every nested field. Threading a prop through a recursion is how a row
 * three levels deep quietly ends up with the defaults.
 *
 * The default is genuinely empty rather than a throw, so the editor still
 * renders wherever nothing provides it. What a reader loses is the observed half
 * of the list; the upload properties and the common headers are facts about this
 * server rather than about traffic, so they survive with no provider at all.
 */

export type EditorSuggestions = {
    readonly request: RequestFacts;
    /** Names this graph's own `setVariable` nodes write. See `declaredVariables`. */
    readonly vars: readonly string[];
    readonly envKeys: readonly string[];
    /** True while the observed half is still being fetched. */
    readonly loading: boolean;
};

export const NO_SUGGESTIONS: EditorSuggestions = {
    request: EMPTY_REQUEST_FACTS,
    vars: [],
    envKeys: [],
    loading: false,
};

const SuggestionContext = createContext<EditorSuggestions>(NO_SUGGESTIONS);

export function SuggestionProvider({
    value,
    children,
}: {
    value: EditorSuggestions;
    children: React.ReactNode;
}) {
    return <SuggestionContext value={value}>{children}</SuggestionContext>;
}

export function useEditorSuggestions(): EditorSuggestions {
    return use(SuggestionContext);
}
