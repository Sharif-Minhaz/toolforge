"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CHARSETS, ENCODABLE_CHARSETS, type Charset, type CharsetId } from "../domain/charsets";
import { supportsDataUri } from "../domain/convert";
import { NEWLINE_SEPARATORS, type Base64ConversionOptions, type Base64Mode } from "../types";

/** Line-ending names are technical labels, so they read the same in every locale. */
const NEWLINE_LABELS: Record<(typeof NEWLINE_SEPARATORS)[number], string> = {
    lf: "LF (Unix)",
    crlf: "CRLF (Windows)",
    cr: "CR (classic Mac)",
};

function toItems(charsets: readonly Charset[]): Record<string, ReactNode> {
    return Object.fromEntries(charsets.map((charset) => [charset.id, charset.label]));
}

const NEWLINE_ITEMS: Record<string, ReactNode> = { ...NEWLINE_LABELS };

type OptionSelectProps<T extends string> = {
    label: string;
    hint?: string;
    value: T;
    items: Record<string, ReactNode>;
    values: readonly T[];
    disabled?: boolean;
    onChange: (value: T) => void;
};

function OptionSelect<T extends string>({
    label,
    hint,
    value,
    items,
    values,
    disabled,
    onChange,
}: OptionSelectProps<T>) {
    const labelId = useId();

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label id={labelId} className="text-muted-foreground text-xs">
                {label}
            </Label>
            <Select
                items={items}
                value={value}
                disabled={disabled}
                onValueChange={(next) => {
                    if (next !== null) {
                        onChange(next);
                    }
                }}
            >
                <SelectTrigger aria-labelledby={labelId} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                    {values.map((item) => (
                        <SelectItem key={item} value={item}>
                            {items[item]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {hint !== undefined && (
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">{hint}</p>
            )}
        </div>
    );
}

type OptionSwitchProps = {
    label: ReactNode;
    hint: ReactNode;
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
};

function OptionSwitch({ label, hint, checked, disabled, onCheckedChange }: OptionSwitchProps) {
    const labelId = useId();
    const hintId = useId();

    return (
        <div
            className={cn(
                "bg-card/60 ring-border/70 flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset",
                "transition-opacity duration-200",
                disabled && "opacity-55",
            )}
        >
            <span className="flex min-w-0 flex-col gap-0.5">
                <span id={labelId} className="text-[0.8125rem] leading-[1.3] font-medium">
                    {label}
                </span>
                <span id={hintId} className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {hint}
                </span>
            </span>
            <Switch
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => onCheckedChange(next)}
                aria-labelledby={labelId}
                aria-describedby={hintId}
                className="mt-1 shrink-0"
            />
        </div>
    );
}

type ConversionOptionsProps = {
    mode: Base64Mode;
    options: Base64ConversionOptions;
    /** A file is already bytes, so the text-side options have nothing to act on. */
    fileSource: boolean;
    onChange: (patch: Partial<Base64ConversionOptions>) => void;
};

export function ConversionOptions({ mode, options, fileSource, onChange }: ConversionOptionsProps) {
    const t = useTranslations("base64.workbench");
    const encoding = mode === "encode";

    const charsets = encoding ? ENCODABLE_CHARSETS : CHARSETS;
    const charsetItems = useMemo(() => toItems(charsets), [charsets]);
    const charsetValues = useMemo(() => charsets.map((charset) => charset.id), [charsets]);

    const textOptionsIdle = encoding && fileSource;
    const dataUriAvailable = supportsDataUri(options);

    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <OptionSelect<CharsetId>
                    label={encoding ? t("charsetSourceLabel") : t("charsetDestinationLabel")}
                    hint={textOptionsIdle ? t("charsetFileHint") : undefined}
                    value={options.charset}
                    items={charsetItems}
                    values={charsetValues}
                    disabled={textOptionsIdle}
                    onChange={(charset) => onChange({ charset })}
                />
                <OptionSelect
                    label={t("newlineLabel")}
                    value={options.newline}
                    items={NEWLINE_ITEMS}
                    values={NEWLINE_SEPARATORS}
                    disabled={textOptionsIdle}
                    onChange={(newline) => onChange({ newline })}
                />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <OptionSwitch
                    label={t("perLineLabel")}
                    hint={encoding ? t("perLineHintEncode") : t("perLineHintDecode")}
                    checked={options.perLine && !textOptionsIdle}
                    disabled={textOptionsIdle}
                    onCheckedChange={(perLine) => onChange({ perLine })}
                />

                {encoding && (
                    <>
                        <OptionSwitch
                            label={t("urlSafeLabel")}
                            hint={t("urlSafeHint")}
                            checked={options.alphabet === "urlSafe"}
                            onCheckedChange={(urlSafe) =>
                                onChange({ alphabet: urlSafe ? "urlSafe" : "standard" })
                            }
                        />
                        <OptionSwitch
                            label={t("paddingLabel")}
                            hint={t("paddingHint")}
                            checked={options.padded}
                            onCheckedChange={(padded) => onChange({ padded })}
                        />
                        <OptionSwitch
                            label={t("wrapLabel")}
                            hint={t("wrapHint")}
                            checked={options.wrapLines}
                            onCheckedChange={(wrapLines) => onChange({ wrapLines })}
                        />
                        <OptionSwitch
                            label={t("dataUriLabel")}
                            // Only meaningful for one continuous standard-alphabet
                            // payload, so it goes quiet rather than emitting
                            // something no browser could load.
                            hint={dataUriAvailable ? t("dataUriHint") : t("dataUriUnavailable")}
                            checked={options.dataUri && dataUriAvailable}
                            disabled={!dataUriAvailable}
                            onCheckedChange={(dataUri) => onChange({ dataUri })}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
