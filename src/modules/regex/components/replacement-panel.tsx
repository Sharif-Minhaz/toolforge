"use client";

import { IconClipboardCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { REPLACEMENT_TOKENS } from "../domain/constants";
import type { RegexMode } from "../types";
import { FIELD_PADDING, FIELD_TEXT } from "./field-styles";

type ReplacementPanelProps = {
    /** Only `substitute` and `list` render this panel. */
    mode: Exclude<RegexMode, "match">;
    replacementId: string;
    outputId: string;
    replacement: string;
    output: string;
    pending: boolean;
    onReplacementChange: (value: string) => void;
    onCopy: () => void;
};

export function ReplacementPanel({
    mode,
    replacementId,
    outputId,
    replacement,
    output,
    pending,
    onReplacementChange,
    onCopy,
}: ReplacementPanelProps) {
    const t = useTranslations("regex.workbench");

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor={replacementId} className="text-muted-foreground text-xs">
                {t(`${mode}Label`)}
            </Label>

            <Input
                id={replacementId}
                value={replacement}
                placeholder={t(`${mode}Placeholder`)}
                spellCheck={false}
                autoComplete="off"
                className={cn(FIELD_TEXT, FIELD_PADDING, "h-auto rounded-xl")}
                onChange={(event) => onReplacementChange(event.target.value)}
            />

            {/* JavaScript's tokens, named rather than guessed at. regex101
                writes the whole match `$0`; `String.replace` reads that
                literally, and this pane shows what `String.replace` does. */}
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.6875rem] leading-normal">
                <span>{t("replacementHint")}</span>
                {REPLACEMENT_TOKENS.map(({ key, token }) => (
                    <code
                        key={key}
                        className="bg-muted/70 text-foreground rounded px-1 py-0.5 font-mono"
                    >
                        {token}
                    </code>
                ))}
            </p>

            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={outputId} className="text-muted-foreground text-xs">
                    {t("resultLabel")}
                </Label>
                <Button variant="outline" size="sm" onClick={onCopy} disabled={output.length === 0}>
                    <IconClipboardCheck className="size-3.5" stroke={1.8} aria-hidden="true" />
                    {t("copy")}
                </Button>
            </div>

            <Textarea
                id={outputId}
                readOnly
                value={output}
                placeholder={t("resultPlaceholder")}
                spellCheck={false}
                className={cn(
                    "bg-muted/45 max-h-72 min-h-32 resize-y rounded-xl font-mono text-[0.8125rem] leading-6 wrap-break-word",
                    "transition-opacity duration-200",
                    pending && "opacity-55",
                )}
            />
        </div>
    );
}
