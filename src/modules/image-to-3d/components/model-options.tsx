"use client";

import { useTranslations } from "next-intl";

import { OptionSelect } from "@/modules/tools/components/option-controls";

import { MAX_HEIGHT_MM, MIN_HEIGHT_MM } from "../domain/constants";
import {
    MESH_DETAILS,
    MODEL_FORMATS,
    type MeshDetail,
    type ModelFormat,
    type ModelOptions,
} from "../types";
import { MeasureField } from "./measure-field";

type ModelOptionsPanelProps = {
    readonly options: ModelOptions;
    /** No model yet means no height to change — the default is the object's own. */
    readonly heightDisabled: boolean;
    readonly onPatch: (patch: Partial<ModelOptions>) => void;
};

/**
 * Everything that shapes the *file*, none of which costs a second model call:
 * the description comes back once, and size, smoothness and format are all
 * decided in this tab from it.
 */
export function ModelOptionsPanel({ options, heightDisabled, onPatch }: ModelOptionsPanelProps) {
    const t = useTranslations("imageTo3d.workbench");
    const tDetails = useTranslations("imageTo3d.details");
    const tFormats = useTranslations("imageTo3d.formats");

    const detailItems = Object.fromEntries(
        MESH_DETAILS.map((detail) => [detail, tDetails(`${detail}Name`)]),
    );
    const formatItems = Object.fromEntries(
        MODEL_FORMATS.map((format) => [format, tFormats(`${format}Name`)]),
    );

    return (
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <OptionSelect<ModelFormat>
                label={t("formatName")}
                hint={tFormats(`${options.format}Hint`)}
                value={options.format}
                items={formatItems}
                values={MODEL_FORMATS}
                onChange={(format) => onPatch({ format })}
            />

            <OptionSelect<MeshDetail>
                label={t("detailName")}
                hint={tDetails(`${options.detail}Hint`)}
                value={options.detail}
                items={detailItems}
                values={MESH_DETAILS}
                onChange={(detail) => onPatch({ detail })}
            />

            <MeasureField
                label={t("heightName")}
                hint={heightDisabled ? t("heightPendingHint") : t("heightHint")}
                value={options.height}
                min={MIN_HEIGHT_MM}
                max={MAX_HEIGHT_MM}
                step={1}
                disabled={heightDisabled}
                onChange={(height) => onPatch({ height: Math.round(height) })}
            />
        </div>
    );
}
