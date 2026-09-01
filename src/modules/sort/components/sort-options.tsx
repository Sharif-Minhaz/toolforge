"use client";

import { IconArrowsShuffle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/modules/tools/components/number-stepper";
import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import {
    MAX_START_NUMBER,
    MIN_START_NUMBER,
    START_NUMBER_PRESETS,
    usesCaseSensitivity,
    usesSortKey,
} from "../domain/constants";
import { BULLET_MARKERS, formatOrdinal } from "../domain/markers";
import {
    BULLET_STYLES,
    LIST_FORMATS,
    NUMBER_STYLES,
    SORT_KEYS,
    SPLIT_MODES,
    type SortOptions,
} from "../types";
import { OrderPicker } from "./order-picker";

type SortOptionsPanelProps = {
    options: SortOptions;
    /** Raw field text, so a half-typed ordinal is never rewritten under the caret. */
    startField: string;
    startInvalid: boolean;
    onChange: (patch: Partial<SortOptions>) => void;
    onStartChange: (raw: string) => void;
    onStartCommit: (value: number) => void;
    onReshuffle: () => void;
};

/**
 * Everything between the two boxes, in the order the work happens: where a line
 * ends, what order the items go in, what they are written back as, and what is
 * thrown away on the way.
 *
 * Four controls here can be inert, and every one of them says so rather than
 * being quietly ignored — the sort key under an order that compares nothing,
 * the case switch when neither a comparison nor a duplicate check reads it, and
 * each marker style under a format that does not write it.
 */
export function SortOptionsPanel({
    options,
    startField,
    startInvalid,
    onChange,
    onStartChange,
    onStartCommit,
    onReshuffle,
}: SortOptionsPanelProps) {
    const t = useTranslations("sort.workbench");
    const tSplit = useTranslations("sort.splitModes");
    const tSplitHints = useTranslations("sort.splitHints");
    const tOrders = useTranslations("sort.orders");
    const tOrderHints = useTranslations("sort.orderHints");
    const tKeys = useTranslations("sort.sortKeys");
    const tKeyHints = useTranslations("sort.sortKeyHints");
    const tFormats = useTranslations("sort.formats");
    const tFormatHints = useTranslations("sort.formatHints");
    const tBullets = useTranslations("sort.bulletStyles");
    const tNumbers = useTranslations("sort.numberStyles");

    const orderLabelId = useId();
    const startId = useId();
    const startHintId = useId();

    const keyAvailable = usesSortKey(options.order);
    const caseAvailable = usesCaseSensitivity(options);
    const bulletAvailable = options.format === "bullet";
    const numberAvailable = options.format === "numbered";

    // Every key below is a member of a literal union, so each lookup is checked
    // at compile time rather than at render.
    const splitItems = Object.fromEntries(SPLIT_MODES.map((mode) => [mode, tSplit(mode)]));
    const keyItems = Object.fromEntries(SORT_KEYS.map((key) => [key, tKeys(key)]));
    const formatItems = Object.fromEntries(LIST_FORMATS.map((item) => [item, tFormats(item)]));
    // The marker itself leads the label — it is the thing being chosen, and it
    // reads the same in either locale.
    const bulletItems = Object.fromEntries(
        BULLET_STYLES.map((style) => [style, `${BULLET_MARKERS[style]}  ${tBullets(style)}`]),
    );
    const numberItems = Object.fromEntries(
        NUMBER_STYLES.map((style) => [style, `${formatOrdinal(style, 1, 2)}  ${tNumbers(style)}`]),
    );

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label id={orderLabelId} className="text-muted-foreground text-xs">
                        {t("orderLabel")}
                    </Label>
                    {options.order === "shuffle" && (
                        <Button variant="outline" size="sm" onClick={onReshuffle}>
                            <IconArrowsShuffle
                                className="size-3.5"
                                stroke={1.8}
                                aria-hidden="true"
                            />
                            {t("reshuffle")}
                        </Button>
                    )}
                </div>
                <OrderPicker
                    value={options.order}
                    labelId={orderLabelId}
                    onChange={(order) => onChange({ order })}
                />
                <p className="text-muted-foreground max-w-[68ch] text-[0.6875rem] leading-[1.4]">
                    {tOrderHints(options.order)}
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <OptionSelect
                    label={t("splitLabel")}
                    hint={tSplitHints(options.splitMode)}
                    value={options.splitMode}
                    items={splitItems}
                    values={SPLIT_MODES}
                    onChange={(splitMode) => onChange({ splitMode })}
                />
                <OptionSelect
                    label={t("sortKeyLabel")}
                    hint={
                        keyAvailable
                            ? tKeyHints(options.sortKey)
                            : t("sortKeyUnavailable", { order: tOrders(options.order) })
                    }
                    value={options.sortKey}
                    items={keyItems}
                    values={SORT_KEYS}
                    disabled={!keyAvailable}
                    onChange={(sortKey) => onChange({ sortKey })}
                />
                <OptionSelect
                    label={t("formatLabel")}
                    hint={tFormatHints(options.format)}
                    value={options.format}
                    items={formatItems}
                    values={LIST_FORMATS}
                    onChange={(format) => onChange({ format })}
                />
                <OptionSelect
                    label={t("bulletStyleLabel")}
                    hint={
                        bulletAvailable
                            ? tBullets(options.bulletStyle)
                            : t("formatUnavailable", { format: tFormats(options.format) })
                    }
                    value={options.bulletStyle}
                    items={bulletItems}
                    values={BULLET_STYLES}
                    disabled={!bulletAvailable}
                    onChange={(bulletStyle) => onChange({ bulletStyle })}
                />
                <OptionSelect
                    label={t("numberStyleLabel")}
                    hint={
                        numberAvailable
                            ? tNumbers(options.numberStyle)
                            : t("formatUnavailable", { format: tFormats(options.format) })
                    }
                    value={options.numberStyle}
                    items={numberItems}
                    values={NUMBER_STYLES}
                    disabled={!numberAvailable}
                    onChange={(numberStyle) => onChange({ numberStyle })}
                />
                <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={startId} className="text-muted-foreground text-xs">
                        <span className="leading-[1.3]">{t("startLabel")}</span>
                    </Label>
                    <NumberStepper
                        value={startField}
                        numeric={options.startNumber}
                        min={MIN_START_NUMBER}
                        max={MAX_START_NUMBER}
                        presets={START_NUMBER_PRESETS}
                        invalid={startInvalid}
                        disabled={!numberAvailable}
                        inputId={startId}
                        describedById={startHintId}
                        hint={
                            numberAvailable
                                ? t("startHint")
                                : t("formatUnavailable", { format: tFormats(options.format) })
                        }
                        presetsLabel={t("startPresets")}
                        decreaseLabel={t("startDecrease")}
                        increaseLabel={t("startIncrease")}
                        onChange={onStartChange}
                        onPreset={onStartCommit}
                        onStep={(delta) => onStartCommit(options.startNumber + delta)}
                    />
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Label className="text-muted-foreground text-xs">{t("cleanupLabel")}</Label>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <OptionSwitch
                        label={t("trimLabel")}
                        hint={t("trimHint")}
                        checked={options.trim}
                        onCheckedChange={(trim) => onChange({ trim })}
                    />
                    <OptionSwitch
                        label={t("removeEmptyLabel")}
                        hint={t("removeEmptyHint")}
                        checked={options.removeEmpty}
                        onCheckedChange={(removeEmpty) => onChange({ removeEmpty })}
                    />
                    <OptionSwitch
                        label={t("duplicatesLabel")}
                        hint={t("duplicatesHint")}
                        checked={options.removeDuplicates}
                        onCheckedChange={(removeDuplicates) => onChange({ removeDuplicates })}
                    />
                    <OptionSwitch
                        label={t("markersLabel")}
                        hint={t("markersHint")}
                        checked={options.stripMarkers}
                        onCheckedChange={(stripMarkers) => onChange({ stripMarkers })}
                    />
                    {/* Disabled rather than silently inert: with duplicates off
                        and an order that compares nothing, this switch reaches
                        no code at all, and a reader flipping it deserves to be
                        told which of the two to turn on. */}
                    <OptionSwitch
                        label={t("caseLabel")}
                        hint={caseAvailable ? t("caseHint") : t("caseUnavailable")}
                        checked={options.caseSensitive && caseAvailable}
                        disabled={!caseAvailable}
                        onCheckedChange={(caseSensitive) => onChange({ caseSensitive })}
                    />
                </div>
            </div>
        </div>
    );
}
