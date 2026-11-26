"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import { isRightToLeft, LANGUAGE_TAGS } from "../domain/languages";
import { countText } from "../domain/text";
import type { OcrLanguage } from "../types";

type ResultTextBoxProps = {
    readonly label: string;
    readonly text: string;
    /** The language the text was read in — it sets the box's font, shaping and direction. */
    readonly language: OcrLanguage;
    readonly placeholder: string;
    /** Until a picture is read there is nothing to edit; the box holds its place. */
    readonly readOnly?: boolean;
    /** Whether Copy is the workbench's one filled button; false when several boxes show. */
    readonly primary?: boolean;
    readonly copied: boolean;
    readonly onCopy: () => void;
    readonly onChange: (text: string) => void;
    readonly className?: string;
    readonly textareaClassName?: string;
};

/** A labelled, editable box of read text with its own counts and Copy. */
export function ResultTextBox({
    label,
    text,
    language,
    placeholder,
    readOnly = false,
    primary = true,
    copied,
    onCopy,
    onChange,
    className,
    textareaClassName,
}: ResultTextBoxProps) {
    const t = useTranslations("imageToText.workbench");
    const textId = useId();
    const countsId = useId();
    // Counted on every keystroke, undebounced: it is a walk over text already
    // in memory, and a count that lags the box reads as wrong.
    const counts = countText(text);

    return (
        <div className={cn("flex min-w-0 flex-col gap-2", className)}>
            <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <label htmlFor={textId} className="text-[0.8125rem] leading-[1.3] font-medium">
                        {label}
                    </label>
                    <span
                        id={countsId}
                        className="text-muted-foreground text-[0.6875rem] leading-[1.4]"
                    >
                        {t("counts", counts)}
                    </span>
                </div>
                <Button
                    variant={primary ? "default" : "outline"}
                    onClick={onCopy}
                    disabled={text.length === 0}
                    className="h-8 px-3"
                >
                    <CopyIconSwap copied={copied} />
                    {t("copy")}
                </Button>
            </div>

            {/* No ceiling and no meter: nothing here is submitted or derived
                from, and the box starts at whatever the engine read. */}
            <Textarea
                id={textId}
                value={text}
                lang={LANGUAGE_TAGS[language]}
                dir={isRightToLeft(language) ? "rtl" : "ltr"}
                readOnly={readOnly}
                spellCheck={false}
                aria-describedby={countsId}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className={cn("bg-card text-[0.9375rem] leading-7", textareaClassName)}
            />
        </div>
    );
}
