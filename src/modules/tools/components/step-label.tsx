"use client";

import { useFormatter } from "next-intl";
import { useEffect, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type StepLabelProps = {
    step: number;
    htmlFor?: string;
    id?: string;
    className?: string;
    children: ReactNode;
};

/** Input types a reader types into. A file picker, a range or a checkbox is never focused on arrival. */
const TYPING_INPUT_TYPES: ReadonlySet<string> = new Set([
    "text",
    "search",
    "url",
    "email",
    "number",
    "tel",
    "password",
]);

function isTypingField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
    if (element instanceof HTMLTextAreaElement) {
        return !element.disabled && !element.readOnly;
    }

    return (
        element instanceof HTMLInputElement &&
        TYPING_INPUT_TYPES.has(element.type) &&
        !element.disabled &&
        !element.readOnly
    );
}

/**
 * Puts the caret in a tool's step-1 field when the tool opens, so a reader can
 * paste straight away.
 *
 * An effect, so it runs only after hydration and changes nothing the server
 * rendered. It stands down on a touch screen (a keyboard popping over the page
 * on arrival is worse than one tap), when the address targets a section
 * (`#faq`), when the reader is already typing somewhere, and for anything that
 * is not a text field. `preventScroll` keeps the page where it opened.
 */
function useArrivalFocus(step: number, htmlFor: string | undefined) {
    useEffect(() => {
        if (step !== 1 || htmlFor === undefined) {
            return;
        }

        if (window.location.hash !== "" || !window.matchMedia("(pointer: fine)").matches) {
            return;
        }

        const active = document.activeElement;

        if (isTypingField(active) || (active instanceof HTMLElement && active.isContentEditable)) {
            return;
        }

        const target = document.getElementById(htmlFor);

        if (isTypingField(target)) {
            target.focus({ preventScroll: true });
        }
    }, [step, htmlFor]);
}

/**
 * A workbench's way in and way out, stamped like a part number: `1` on the
 * input, `2` on the result. The digit goes through the formatter, so Bangla
 * reads ১ and ২, and is hidden from assistive tech — the label already names
 * the step, and "one, HTML in" reads worse than "HTML in". Step 1 also takes
 * the caret on arrival; see `useArrivalFocus`.
 */
export function StepLabel({ step, htmlFor, id, className, children }: StepLabelProps) {
    const format = useFormatter();

    useArrivalFocus(step, htmlFor);

    return (
        <Label
            htmlFor={htmlFor}
            id={id}
            className={cn("text-foreground gap-2 text-sm font-medium", className)}
        >
            <span
                aria-hidden="true"
                className="border-border bg-muted text-muted-foreground inline-grid size-5 shrink-0 place-items-center rounded-[5px] border font-mono text-xs leading-none tabular-nums"
            >
                {format.number(step)}
            </span>
            {children}
        </Label>
    );
}
