import {
    IconBinary,
    IconBraces,
    IconCalendarTime,
    IconClockHour4,
    IconFingerprint,
    IconGitCompare,
    IconHash,
    IconKey,
    IconLetterCase,
    IconLink,
    IconLock,
    IconPalette,
    IconQrcode,
    IconRegex,
    IconTextSize,
    type IconProps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

import type { ToolIconName } from "../types";

const ICONS: Record<ToolIconName, ComponentType<IconProps>> = {
    fingerprint: IconFingerprint,
    binary: IconBinary,
    key: IconKey,
    hash: IconHash,
    braces: IconBraces,
    link: IconLink,
    regex: IconRegex,
    text: IconTextSize,
    palette: IconPalette,
    clock: IconClockHour4,
    calendar: IconCalendarTime,
    lock: IconLock,
    qrcode: IconQrcode,
    slug: IconLetterCase,
    diff: IconGitCompare,
};

type ToolIconProps = {
    name: ToolIconName;
    className?: string;
};

/** Resolves a catalog icon key to its Tabler component. */
export function ToolIcon({ name, className }: ToolIconProps) {
    const Icon = ICONS[name];

    return <Icon className={className} stroke={1.75} aria-hidden="true" />;
}
