import {
    IconArrowsMinimize,
    IconBinary,
    IconBraces,
    IconCalendarTime,
    IconClockHour4,
    IconEraser,
    IconFingerprint,
    IconGitCompare,
    IconHash,
    IconKey,
    IconLetterCase,
    IconLink,
    IconLock,
    IconMarkdown,
    IconPalette,
    IconPhotoScan,
    IconQrcode,
    IconScissors,
    IconRegex,
    IconTextScan2,
    IconTextSize,
    IconWorldWww,
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
    world: IconWorldWww,
    markdown: IconMarkdown,
    regex: IconRegex,
    text: IconTextSize,
    palette: IconPalette,
    clock: IconClockHour4,
    calendar: IconCalendarTime,
    lock: IconLock,
    qrcode: IconQrcode,
    scissors: IconScissors,
    slug: IconLetterCase,
    diff: IconGitCompare,
    photo: IconPhotoScan,
    scan: IconTextScan2,
    eraser: IconEraser,
    compress: IconArrowsMinimize,
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
