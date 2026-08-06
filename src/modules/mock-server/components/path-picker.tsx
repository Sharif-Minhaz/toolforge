"use client";

import { IconChevronDown, IconLoader2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { PathSuggestion } from "../domain/suggest-path";

/**
 * A text box that says what may go in it.
 *
 * Every path in this studio — `avatar.contentType`, `game_id`, `x-api-key` — had
 * to be typed from memory against a request the reader could not see. This is
 * the list that makes them visible, and three decisions in it are load-bearing.
 *
 * **It is still a text box.** The suggestions are what a route has *carried*,
 * never what it may carry, so a picker that refused anything unlisted would
 * block the ordinary case of building against a request not sent yet. Typing
 * freely is the primary path; the list narrows alongside it.
 *
 * **The list opens on focus, and it is laid out in flow rather than floated.**
 * The inspector rail is `overflow-y-auto`, so an absolutely positioned dropdown
 * is clipped by it the moment the row sits near the bottom — and a portal would
 * need position tracking against a pane that scrolls, zooms and resizes. An
 * inline list cannot be clipped, cannot be mispositioned, and the rail simply
 * scrolls. The cost is that it pushes the rows below it down while open, which
 * on a two-line row reads as the row expanding.
 *
 * That flow layout is why this renders a **fragment** and not one element: the
 * box is a flex item in `ValueRow`'s wrapping row, and the list is a
 * `basis-full` sibling that wraps under it. Rendering the two inside a wrapper
 * would give them their own wrap context and put the request row's three
 * controls back to fighting over one line — the bug the `contents` note in
 * `value-row.tsx` describes. It therefore only makes sense inside a
 * `flex-wrap` row.
 *
 * **Nothing is debounced.** The repo's default for typed input is 300 ms, and it
 * is wrong here for the same reason it is wrong in the URL Parser: this is a
 * filter over at most a few hundred strings held in memory, and a list that
 * lagged a third of a second behind the caret would feel broken rather than
 * cheap. Match the debounce to the cost.
 */

type PathPickerProps = {
    value: string;
    onChange: (next: string) => void;
    /** Already filtered and ranked — see `domain/suggest-path.ts`. */
    suggestions: readonly PathSuggestion[];
    /** Shown in place of the list when there is nothing to offer. */
    emptyHint: string;
    /** A line above the list saying where the suggestions came from. */
    sourceHint?: string;
    label: string;
    placeholder?: string;
    loading?: boolean;
    /**
     * The box's hard ceiling. From the caller rather than a constant here,
     * because this picker serves a route path, a header name and a JSON path,
     * and those three are bounded by three different numbers.
     */
    maxLength: number;
    className?: string;
};

export function PathPicker({
    value,
    onChange,
    suggestions,
    emptyHint,
    sourceHint,
    maxLength,
    label,
    placeholder,
    loading = false,
    className,
}: PathPickerProps) {
    const t = useTranslations("mockServer.suggest");
    const tOrigins = useTranslations("mockServer.suggestOrigins");
    const tTypes = useTranslations("mockServer.suggestTypes");

    const listId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    // Clamped rather than reset: the list re-ranks on every keystroke, and an
    // index left pointing past the end would make Enter do nothing.
    const index = suggestions.length === 0 ? -1 : Math.min(active, suggestions.length - 1);

    function accept(chosen: PathSuggestion) {
        onChange(chosen.path);
        setOpen(false);
        setActive(0);
        inputRef.current?.focus();
    }

    function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Escape") {
            if (!open) {
                return;
            }

            // The studio runs inside a dialog, and an unswallowed Escape would
            // shut the whole canvas rather than this list.
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);

            return;
        }

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();

            if (!open) {
                setOpen(true);

                return;
            }

            if (suggestions.length === 0) {
                return;
            }

            const step = event.key === "ArrowDown" ? 1 : -1;

            setActive((held) => {
                const from = Math.min(held, suggestions.length - 1);

                return (from + step + suggestions.length) % suggestions.length;
            });

            return;
        }

        if (event.key === "Enter" && open && index >= 0) {
            event.preventDefault();
            accept(suggestions[index]);
        }
    }

    return (
        <>
            {/* `relative` only so the trigger can sit inside the box; the list
                itself is in flow underneath and needs no positioning at all. */}
            <div className={cn("relative flex min-w-0 items-center", className)}>
                <Input
                    ref={inputRef}
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={open ? listId : undefined}
                    aria-autocomplete="list"
                    aria-activedescendant={open && index >= 0 ? `${listId}-${index}` : undefined}
                    aria-label={label}
                    maxLength={maxLength}
                    value={value}
                    onChange={(event) => {
                        onChange(event.target.value);
                        setOpen(true);
                        setActive(0);
                    }}
                    onFocus={() => setOpen(true)}
                    // Unconditional, because nothing in the list can take focus
                    // from it: the rows are `role="option"` rather than buttons,
                    // the trigger is `tabIndex={-1}`, and both prevent the
                    // default on `mousedown`. Focus leaving the box therefore
                    // always means the reader has left the control.
                    onBlur={() => setOpen(false)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-8 w-full min-w-0 pr-7 font-mono text-xs"
                />

                <button
                    type="button"
                    // Not a focus target: it toggles a list the box already
                    // opens on focus, so in the keyboard order it is a stop that
                    // does nothing. Arrow keys are the keyboard's way in.
                    tabIndex={-1}
                    aria-hidden="true"
                    onMouseDown={(event) => {
                        // Keeps focus in the input, so the toggle is a toggle
                        // rather than a blur-then-refocus that always reopens.
                        event.preventDefault();
                        setOpen((held) => !held);
                        inputRef.current?.focus();
                    }}
                    className="text-muted-foreground hover:text-foreground absolute right-1 flex size-6 items-center justify-center rounded-md transition-colors"
                >
                    {loading ? (
                        <IconLoader2 className="size-3.5 animate-spin" />
                    ) : (
                        <IconChevronDown
                            className={cn("size-3.5 transition-transform", open && "rotate-180")}
                        />
                    )}
                </button>
            </div>

            {open ? (
                <div
                    // `basis-full` so it wraps onto its own line under the row's
                    // controls, whatever else is sharing that line.
                    className="border-border/70 bg-card min-w-0 basis-full overflow-hidden rounded-lg border"
                    // Every press inside is prevented from taking focus, which
                    // is what stops `onBlur` from closing the list before the
                    // click on a row has a chance to land.
                    onMouseDown={(event) => event.preventDefault()}
                >
                    {sourceHint === undefined ? null : (
                        <p className="text-muted-foreground border-border/60 border-b px-2 py-1.5 text-[0.625rem] leading-normal">
                            {sourceHint}
                        </p>
                    )}

                    {suggestions.length === 0 ? (
                        <p className="text-muted-foreground px-2 py-2 text-[0.6875rem] leading-relaxed">
                            {emptyHint}
                        </p>
                    ) : (
                        <ul
                            id={listId}
                            role="listbox"
                            aria-label={t("listLabel")}
                            className="max-h-56 overflow-y-auto"
                        >
                            {suggestions.map((suggestion, at) => (
                                <li
                                    key={suggestion.path}
                                    id={`${listId}-${at}`}
                                    role="option"
                                    aria-selected={at === index}
                                    onClick={() => accept(suggestion)}
                                    onMouseEnter={() => setActive(at)}
                                    className={cn(
                                        "flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1.5",
                                        at === index && "bg-muted",
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                        {suggestion.path}
                                    </span>
                                    {suggestion.type === undefined ? null : (
                                        <span className="text-muted-foreground shrink-0 text-[0.625rem]">
                                            {tTypes(suggestion.type)}
                                        </span>
                                    )}
                                    {/* The provenance chip is the whole reason
                                        `origin` exists: an exact fact about the
                                        route and a header somebody usually sends
                                        must not read identically. */}
                                    <span className="text-muted-foreground/80 border-border/60 shrink-0 rounded border px-1 text-[0.625rem] leading-[1.4]">
                                        {tOrigins(suggestion.origin)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </>
    );
}
