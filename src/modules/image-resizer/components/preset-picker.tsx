"use client";

import { useFormatter, useTranslations } from "next-intl";

import { OptionSelect } from "@/modules/tools/components/option-controls";
import {
    findPreset,
    platformsInGroup,
    presetDpi,
    presetPixels,
    presetsForPlatform,
} from "../domain/presets";
import { PRESET_GROUPS, type PresetGroup } from "../types";

/**
 * The three-step walk down to a published size: what kind of thing it is, whose
 * it is, and which of theirs.
 *
 * A cascade rather than one long list because the list is long — thirty-odd
 * entries across three groups — and because the middle step is what a person
 * actually knows: they are not looking for "1584 × 396", they are looking for
 * the LinkedIn cover. Choosing a group or a platform moves the selection to
 * that branch's first entry, so the picker is never showing a preset that is
 * not in the branch above it.
 *
 * The platform and preset names are **data, not copy** — see `domain/presets.ts`
 * — so they are not translated. Only the three group headings are.
 */

const GROUP_LABEL_KEY = {
    photo: "presetGroupPhoto",
    print: "presetGroupPrint",
    social: "presetGroupSocial",
} as const satisfies Record<PresetGroup, string>;

type PresetPickerProps = {
    readonly presetId: string;
    /** What a physical preset is measured at, so the hint below it is true. */
    readonly dpi: number;
    readonly disabled?: boolean;
    readonly onChange: (presetId: string) => void;
};

export function PresetPicker({ presetId, dpi, disabled = false, onChange }: PresetPickerProps) {
    const t = useTranslations("imageResizer.workbench");
    const format = useFormatter();

    const preset = findPreset(presetId);
    const group = preset?.group ?? "photo";
    const platform = preset?.platform ?? platformsInGroup(group)[0];

    const platforms = platformsInGroup(group);
    const options = presetsForPlatform(group, platform);

    function selectGroup(next: PresetGroup) {
        const firstPlatform = platformsInGroup(next)[0];
        const first = presetsForPlatform(next, firstPlatform)[0];

        if (first !== undefined) {
            onChange(first.id);
        }
    }

    function selectPlatform(next: string) {
        const first = presetsForPlatform(group, next)[0];

        if (first !== undefined) {
            onChange(first.id);
        }
    }

    return (
        <>
            <OptionSelect<PresetGroup>
                label={t("presetGroupLabel")}
                value={group}
                values={PRESET_GROUPS}
                disabled={disabled}
                items={Object.fromEntries(
                    PRESET_GROUPS.map((value) => [value, t(GROUP_LABEL_KEY[value])]),
                )}
                onChange={selectGroup}
            />

            <OptionSelect<string>
                label={t("presetPlatformLabel")}
                value={platform}
                values={platforms}
                disabled={disabled}
                items={Object.fromEntries(platforms.map((value) => [value, value]))}
                onChange={selectPlatform}
            />

            <OptionSelect<string>
                label={t("presetLabel")}
                // The label already carries the published number; the hint
                // carries what it comes to *here*, which is the number that
                // changes when the resolution does.
                hint={
                    preset === null
                        ? undefined
                        : presetDpi(preset.size) === null
                          ? t("presetHintPixels", {
                                width: format.number(presetPixels(preset.size, dpi).width),
                                height: format.number(presetPixels(preset.size, dpi).height),
                            })
                          : t("presetHint", {
                                width: format.number(presetPixels(preset.size, dpi).width),
                                height: format.number(presetPixels(preset.size, dpi).height),
                                dpi: format.number(dpi),
                            })
                }
                value={presetId}
                values={options.map((entry) => entry.id)}
                disabled={disabled}
                items={Object.fromEntries(options.map((entry) => [entry.id, entry.label]))}
                onChange={onChange}
            />
        </>
    );
}
