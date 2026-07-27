"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import {
    JSON_INDENTS,
    JSON_SPECS,
    type JsonFormatOptions,
    type JsonIndent,
    type JsonMode,
    type JsonSpec,
} from "../types";

/** Specification names are proper nouns, so they read the same in every locale. */
const SPEC_LABELS: Record<JsonSpec, string> = {
    rfc8259: "RFC 8259",
    rfc7159: "RFC 7159",
    rfc4627: "RFC 4627",
    ecma404: "ECMA-404",
};

const SPEC_ITEMS: Record<string, ReactNode> = { ...SPEC_LABELS };

type FormatOptionsProps = {
    mode: JsonMode;
    options: JsonFormatOptions;
    onChange: (patch: Partial<JsonFormatOptions>) => void;
};

/**
 * Only the settings the current action can act on. A control that cannot apply
 * is disabled and its hint says why, rather than sitting there accepting a
 * value that would be silently dropped.
 */
export function FormatOptions({ mode, options, onChange }: FormatOptionsProps) {
    const t = useTranslations("json.workbench");

    const indentItems: Record<string, ReactNode> = Object.fromEntries(
        JSON_INDENTS.map((indent) => [indent, t(`indents.${indent}`)]),
    );

    // Beautifying is the only action that lays anything out, and validating is
    // the only one that produces no document at all.
    const rewrites = mode !== "validate";
    // Always a hint, so switching action never shifts the row's height.
    const indentHint =
        mode === "beautify"
            ? t("indentHint")
            : mode === "minify"
              ? t("indentMinifyHint")
              : t("indentValidateHint");

    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <OptionSelect<JsonIndent>
                    label={t("indentLabel")}
                    hint={indentHint}
                    value={options.indent}
                    items={indentItems}
                    values={JSON_INDENTS}
                    disabled={mode !== "beautify"}
                    onChange={(indent) => onChange({ indent })}
                />
                <OptionSelect<JsonSpec>
                    label={t("specLabel")}
                    hint={t("specHint")}
                    value={options.spec}
                    items={SPEC_ITEMS}
                    values={JSON_SPECS}
                    onChange={(spec) => onChange({ spec })}
                />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <OptionSwitch
                    label={t("repairLabel")}
                    hint={t("repairHint")}
                    checked={options.repair}
                    onCheckedChange={(repair) => onChange({ repair })}
                />
                <OptionSwitch
                    label={t("sortKeysLabel")}
                    hint={rewrites ? t("sortKeysHint") : t("outputOnlyHint")}
                    checked={options.sortKeys && rewrites}
                    disabled={!rewrites}
                    onCheckedChange={(sortKeys) => onChange({ sortKeys })}
                />
                <OptionSwitch
                    label={t("escapeUnicodeLabel")}
                    hint={rewrites ? t("escapeUnicodeHint") : t("outputOnlyHint")}
                    checked={options.escapeUnicode && rewrites}
                    disabled={!rewrites}
                    onCheckedChange={(escapeUnicode) => onChange({ escapeUnicode })}
                />
            </div>
        </div>
    );
}
