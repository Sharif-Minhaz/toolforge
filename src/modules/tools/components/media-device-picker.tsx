"use client";

import { useTranslations } from "next-intl";

import { OptionSelect } from "@/modules/tools/components/option-controls";
import type { MediaDevice, MediaKind } from "../domain/media-devices";

/** Stands for "let the system choose". Real ids are hashes, or `default` for audio. */
const SYSTEM_DEFAULT = "system-default";

type MediaDevicePickerProps = {
    kind: MediaKind;
    devices: readonly MediaDevice[];
    /** The device in use or chosen, or `null` while the system default answers. */
    value: string | null;
    disabled?: boolean;
    onChange: (deviceId: string) => void;
};

/**
 * The input picker. Before access is allowed the browser names nothing, so the
 * list holds only the default and says why; a device the browser left unnamed
 * is numbered rather than shown blank.
 */
export function MediaDevicePicker({
    kind,
    devices,
    value,
    disabled,
    onChange,
}: MediaDevicePickerProps) {
    const t = useTranslations("mediaDevices.picker");

    const ids = devices.map((device) => device.id);
    const chosen = value !== null && ids.includes(value) ? value : SYSTEM_DEFAULT;
    const values = chosen === SYSTEM_DEFAULT ? [SYSTEM_DEFAULT, ...ids] : ids;
    const items: Record<string, string> = { [SYSTEM_DEFAULT]: t("default", { kind }) };

    for (const device of devices) {
        items[device.id] = device.label ?? t("unnamed", { kind, position: device.position });
    }

    return (
        <OptionSelect
            label={t("label", { kind })}
            hint={devices.length === 0 ? t("hintEmpty", { kind }) : undefined}
            value={chosen}
            items={items}
            values={values}
            disabled={disabled === true || devices.length === 0}
            onChange={(next) => {
                if (next !== SYSTEM_DEFAULT) {
                    onChange(next);
                }
            }}
        />
    );
}
