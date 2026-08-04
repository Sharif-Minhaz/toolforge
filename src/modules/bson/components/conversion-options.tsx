"use client";

import { useTranslations } from "next-intl";

import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import {
    bsonEncodingApplies,
    ejsonModeApplies,
    jsonIndentApplies,
    toonDelimiterApplies,
    toonIndentApplies,
    toonStrictApplies,
} from "../domain/options";
import {
    BSON_ENCODINGS,
    DATA_FORMATS,
    EJSON_MODES,
    JSON_INDENTS,
    TOON_DELIMITERS,
    TOON_INDENTS,
    type ConversionOptions as Options,
    type DataFormat,
} from "../types";

type ConversionOptionsProps = {
    source: DataFormat;
    target: DataFormat;
    options: Options;
    onChange: (patch: Partial<Options>) => void;
};

/**
 * Every control the pairing cannot read is disabled, with its hint replaced by
 * the reason. Silently ignoring a setting the reader just changed is the worse
 * failure: the tool looks broken rather than opinionated.
 */
export function ConversionOptions({ source, target, options, onChange }: ConversionOptionsProps) {
    const t = useTranslations("bson.workbench");
    const tEncodings = useTranslations("bson.encodings");
    const tModes = useTranslations("bson.ejsonModes");
    const tJsonIndents = useTranslations("bson.jsonIndents");
    const tDelimiters = useTranslations("bson.delimiters");
    const tToonIndents = useTranslations("bson.toonIndents");

    const encoding = bsonEncodingApplies(source, target);
    const ejson = ejsonModeApplies(source);
    const jsonIndent = jsonIndentApplies(target);
    const delimiter = toonDelimiterApplies(target);
    const toonIndent = toonIndentApplies(source, target);
    const strict = toonStrictApplies(source);

    return (
        <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-xs">{t("optionsTitle")}</p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <OptionSelect
                    label={t("encoding")}
                    hint={encoding ? t("encodingHint") : t("encodingUnavailable")}
                    value={options.bsonEncoding}
                    values={BSON_ENCODINGS}
                    items={Object.fromEntries(
                        BSON_ENCODINGS.map((value) => [value, tEncodings(value)]),
                    )}
                    disabled={!encoding}
                    onChange={(bsonEncoding) => onChange({ bsonEncoding })}
                />

                <OptionSelect
                    label={t("ejson")}
                    hint={ejson ? t("ejsonHint") : t("ejsonUnavailable")}
                    value={options.ejsonMode}
                    values={EJSON_MODES}
                    items={Object.fromEntries(EJSON_MODES.map((value) => [value, tModes(value)]))}
                    disabled={!ejson}
                    onChange={(ejsonMode) => onChange({ ejsonMode })}
                />

                <OptionSelect
                    label={t("jsonIndent")}
                    hint={jsonIndent ? t("jsonIndentHint") : t("jsonIndentUnavailable")}
                    value={options.jsonIndent}
                    values={JSON_INDENTS}
                    items={Object.fromEntries(
                        JSON_INDENTS.map((value) => [value, tJsonIndents(value)]),
                    )}
                    disabled={!jsonIndent}
                    onChange={(jsonIndentValue) => onChange({ jsonIndent: jsonIndentValue })}
                />

                <OptionSelect
                    label={t("delimiter")}
                    hint={delimiter ? t("delimiterHint") : t("delimiterUnavailable")}
                    value={options.toonDelimiter}
                    values={TOON_DELIMITERS}
                    items={Object.fromEntries(
                        TOON_DELIMITERS.map((value) => [value, tDelimiters(value)]),
                    )}
                    disabled={!delimiter}
                    onChange={(toonDelimiter) => onChange({ toonDelimiter })}
                />

                <OptionSelect
                    label={t("toonIndent")}
                    hint={toonIndent ? t("toonIndentHint") : t("toonIndentUnavailable")}
                    value={options.toonIndent}
                    values={TOON_INDENTS}
                    items={Object.fromEntries(
                        TOON_INDENTS.map((value) => [value, tToonIndents(value)]),
                    )}
                    disabled={!toonIndent}
                    onChange={(toonIndentValue) => onChange({ toonIndent: toonIndentValue })}
                />
            </div>

            <OptionSwitch
                label={t("toonStrict")}
                hint={strict ? t("toonStrictHint") : t("toonStrictUnavailable")}
                checked={options.toonStrict}
                disabled={!strict}
                onCheckedChange={(toonStrict) => onChange({ toonStrict })}
            />
        </div>
    );
}

/**
 * One side's format picker.
 *
 * All three are always offered, including the one the other side already holds.
 * Hiding it would mean a reader on JSON → TOON could not reach TOON → JSON
 * without first changing the side they did not want to change; picking it
 * swaps instead, which is what they meant.
 */
export function FormatPicker({
    label,
    value,
    onChange,
}: {
    label: string;
    value: DataFormat;
    onChange: (format: DataFormat) => void;
}) {
    const tFormats = useTranslations("bson.formats");

    return (
        <OptionSelect
            label={label}
            value={value}
            values={DATA_FORMATS}
            items={Object.fromEntries(DATA_FORMATS.map((format) => [format, tFormats(format)]))}
            onChange={onChange}
        />
    );
}
