"use client";

import { useTranslations } from "next-intl";

import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";

import {
    MAX_BASE_MM,
    MAX_DETAIL,
    MAX_DEPTH_MM,
    MAX_RESOLUTION,
    MAX_SMOOTHING,
    MAX_WIDTH_MM,
    MIN_BASE_MM,
    MIN_DETAIL,
    MIN_DEPTH_MM,
    MIN_RESOLUTION,
    MIN_SMOOTHING,
    MIN_WIDTH_MM,
} from "../domain/constants";
import {
    HEIGHT_SOURCES,
    MODEL_FORMATS,
    MODEL_SHAPES,
    type HeightSource,
    type ModelFormat,
    type ModelOptions,
    type ModelShape,
} from "../types";
import { MeasureField } from "./measure-field";

/** Millimetres move in tenths; counts move in ones. */
const MILLIMETRE_STEP = 0.1;

/** Detail is a share, and a twentieth of it is finer than the mesh can show. */
const DETAIL_STEP = 0.05;

type ModelOptionsPanelProps = {
    readonly options: ModelOptions;
    /** Whether the subject is being cut away from its background. */
    readonly cutout: boolean;
    /** What the one-time model download costs, for the control's own hint. */
    readonly cutoutDownloadLabel: string;
    /** True when the picture arrived with its own alpha, so no model will run. */
    readonly cutoutAlreadyTransparent: boolean;
    readonly disabled: boolean;
    readonly onPatch: (patch: Partial<ModelOptions>) => void;
    readonly onCutoutChange: (next: boolean) => void;
};

export function ModelOptionsPanel({
    options,
    cutout,
    cutoutDownloadLabel,
    cutoutAlreadyTransparent,
    disabled,
    onPatch,
    onCutoutChange,
}: ModelOptionsPanelProps) {
    const t = useTranslations("imageTo3d.workbench");
    const tSources = useTranslations("imageTo3d.sources");
    const tShapes = useTranslations("imageTo3d.shapes");
    const tFormats = useTranslations("imageTo3d.formats");

    const sourceItems = Object.fromEntries(
        HEIGHT_SOURCES.map((source) => [source, tSources(`${source}Name`)]),
    );
    const shapeItems = Object.fromEntries(
        MODEL_SHAPES.map((shape) => [shape, tShapes(`${shape}Name`)]),
    );
    const formatItems = Object.fromEntries(
        MODEL_FORMATS.map((format) => [format, tFormats(`${format}Name`)]),
    );

    // One predicate rather than a rule repeated at three controls: an inflated
    // body is a closed shape whose thickness is its depth, so a flat backing has
    // nothing to describe — and the two relief shapes have no silhouette to
    // hand any detail share to.
    const inflating = options.shape === "inflate";

    return (
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <OptionSelect<HeightSource>
                label={t("sourceName")}
                hint={t("sourceHint")}
                value={options.source}
                items={sourceItems}
                values={HEIGHT_SOURCES}
                disabled={disabled}
                onChange={(source) => onPatch({ source })}
            />

            <OptionSelect<ModelShape>
                label={t("shapeName")}
                hint={t("shapeHint")}
                value={options.shape}
                items={shapeItems}
                values={MODEL_SHAPES}
                disabled={disabled}
                onChange={(shape) => onPatch({ shape })}
            />

            <OptionSelect<ModelFormat>
                label={t("formatName")}
                hint={tFormats(`${options.format}Hint`)}
                value={options.format}
                items={formatItems}
                values={MODEL_FORMATS}
                disabled={disabled}
                onChange={(format) => onPatch({ format })}
            />

            <MeasureField
                label={t("resolutionName")}
                hint={t("resolutionHint")}
                value={options.resolution}
                min={MIN_RESOLUTION}
                max={MAX_RESOLUTION}
                step={1}
                disabled={disabled}
                onChange={(resolution) => onPatch({ resolution })}
            />

            <MeasureField
                label={t("smoothingName")}
                hint={t("smoothingHint")}
                value={options.smoothing}
                min={MIN_SMOOTHING}
                max={MAX_SMOOTHING}
                step={1}
                disabled={disabled}
                onChange={(smoothing) => onPatch({ smoothing })}
            />

            <MeasureField
                label={t("widthName")}
                // The width means a different measurement on a tube, and saying
                // so where it is set beats a footnote in the article.
                hint={options.shape === "cylinder" ? t("widthHintCylinder") : t("widthHint")}
                value={options.width}
                min={MIN_WIDTH_MM}
                max={MAX_WIDTH_MM}
                step={MILLIMETRE_STEP}
                disabled={disabled}
                onChange={(width) => onPatch({ width })}
            />

            <MeasureField
                label={t("depthName")}
                hint={t("depthHint")}
                value={options.depth}
                min={MIN_DEPTH_MM}
                max={MAX_DEPTH_MM}
                step={MILLIMETRE_STEP}
                disabled={disabled}
                onChange={(depth) => onPatch({ depth })}
            />

            <MeasureField
                label={t("detailName")}
                // Disabled rather than ignored, and the hint says why.
                hint={inflating ? t("detailHint") : t("detailDisabledHint")}
                value={options.detail}
                min={MIN_DETAIL}
                max={MAX_DETAIL}
                step={DETAIL_STEP}
                disabled={disabled || !inflating}
                onChange={(detail) => onPatch({ detail })}
            />

            <MeasureField
                label={t("baseName")}
                hint={
                    inflating
                        ? t("baseDisabledInflateHint")
                        : options.solid
                          ? t("baseHint")
                          : t("baseDisabledHint")
                }
                value={options.baseThickness}
                min={MIN_BASE_MM}
                max={MAX_BASE_MM}
                step={MILLIMETRE_STEP}
                disabled={disabled || inflating || !options.solid}
                onChange={(baseThickness) => onPatch({ baseThickness })}
            />

            <div className="flex min-w-0 flex-col gap-5">
                <OptionSwitch
                    label={t("cutoutName")}
                    // The one control on this page that can reach the network,
                    // and it says what that costs before it is switched on —
                    // `CLAUDE.md` rule 32 puts that here rather than in the
                    // article.
                    hint={
                        cutoutAlreadyTransparent
                            ? t("cutoutHintTransparent")
                            : t("cutoutHint", { size: cutoutDownloadLabel })
                    }
                    checked={cutout}
                    disabled={disabled || cutoutAlreadyTransparent}
                    onCheckedChange={onCutoutChange}
                />
                <OptionSwitch
                    label={t("invertName")}
                    hint={t("invertHint")}
                    checked={options.invert}
                    disabled={disabled}
                    onCheckedChange={(invert) => onPatch({ invert })}
                />
                <OptionSwitch
                    label={t("solidName")}
                    hint={t("solidHint")}
                    checked={options.solid}
                    disabled={disabled}
                    onCheckedChange={(solid) => onPatch({ solid })}
                />
            </div>
        </div>
    );
}
