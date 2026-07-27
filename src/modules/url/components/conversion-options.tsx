"use client";

import { useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";

import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import {
    CHARSETS,
    ENCODABLE_CHARSETS,
    type Charset,
    type CharsetId,
} from "@/modules/tools/domain/charsets";
import { NEWLINE_LABELS } from "@/modules/tools/domain/lines";
import { NEWLINE_SEPARATORS } from "@/modules/tools/types";
import {
    URL_ENCODE_PROFILES,
    type UrlConversionOptions,
    type UrlEncodeProfile,
    type UrlMode,
} from "../types";

function toItems(charsets: readonly Charset[]): Record<string, ReactNode> {
    return Object.fromEntries(charsets.map((charset) => [charset.id, charset.label]));
}

const NEWLINE_ITEMS: Record<string, ReactNode> = { ...NEWLINE_LABELS };

type ConversionOptionsProps = {
    mode: UrlMode;
    options: UrlConversionOptions;
    /** A file is already bytes, so the text-side options have nothing to act on. */
    fileSource: boolean;
    onChange: (patch: Partial<UrlConversionOptions>) => void;
};

export function ConversionOptions({ mode, options, fileSource, onChange }: ConversionOptionsProps) {
    const t = useTranslations("url.workbench");
    const encoding = mode === "encode";

    const charsets = encoding ? ENCODABLE_CHARSETS : CHARSETS;
    const charsetItems = useMemo(() => toItems(charsets), [charsets]);
    const charsetValues = useMemo(() => charsets.map((charset) => charset.id), [charsets]);

    const profileItems = useMemo<Record<string, ReactNode>>(
        () =>
            Object.fromEntries(
                URL_ENCODE_PROFILES.map((profile) => [profile, t(`profiles.${profile}`)]),
            ),
        [t],
    );

    const textOptionsIdle = encoding && fileSource;

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
                {encoding && (
                    <OptionSelect<UrlEncodeProfile>
                        label={t("profileLabel")}
                        hint={t("profileHint")}
                        value={options.profile}
                        items={profileItems}
                        values={URL_ENCODE_PROFILES}
                        onChange={(profile) => onChange({ profile })}
                    />
                )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <OptionSwitch
                    label={t("perLineLabel")}
                    hint={encoding ? t("perLineHintEncode") : t("perLineHintDecode")}
                    checked={options.perLine && !textOptionsIdle}
                    disabled={textOptionsIdle}
                    onCheckedChange={(perLine) => onChange({ perLine })}
                />

                {encoding ? (
                    <>
                        <OptionSwitch
                            label={t("uppercaseHexLabel")}
                            hint={t("uppercaseHexHint")}
                            checked={options.uppercaseHex}
                            onCheckedChange={(uppercaseHex) => onChange({ uppercaseHex })}
                        />
                        <OptionSwitch
                            label={t("wrapLabel")}
                            hint={t("wrapHint")}
                            checked={options.wrapLines}
                            onCheckedChange={(wrapLines) => onChange({ wrapLines })}
                        />
                    </>
                ) : (
                    <>
                        <OptionSwitch
                            label={t("plusAsSpaceLabel")}
                            hint={t("plusAsSpaceHint")}
                            checked={options.plusAsSpace}
                            onCheckedChange={(plusAsSpace) => onChange({ plusAsSpace })}
                        />
                        <OptionSwitch
                            label={t("recursiveLabel")}
                            hint={t("recursiveHint")}
                            checked={options.recursive}
                            onCheckedChange={(recursive) => onChange({ recursive })}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
