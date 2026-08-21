import {
    IconServer2,
    IconArrowsMinimize,
    IconBackground,
    IconBinary,
    IconBlur,
    IconBraces,
    IconCalendarTime,
    IconCertificate,
    IconClockHour4,
    IconCrop,
    IconDatabaseCog,
    IconDice5,
    IconEraser,
    IconFileTypePdf,
    IconFingerprint,
    IconGitCompare,
    IconHash,
    IconHtml,
    IconKey,
    IconLetterCase,
    IconLetterCaseToggle,
    IconLink,
    IconLock,
    IconLockCode,
    IconMarkdown,
    IconMathFunction,
    IconNetwork,
    IconPalette,
    IconPhotoScan,
    IconQrcode,
    IconRadar2,
    IconScissors,
    IconRegex,
    IconShieldLock,
    IconTerminal2,
    IconTextScan2,
    IconTextSize,
    IconTopologyStar3,
    IconTransform,
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
    html: IconHtml,
    regex: IconRegex,
    text: IconTextSize,
    palette: IconPalette,
    clock: IconClockHour4,
    calendar: IconCalendarTime,
    lock: IconLock,
    qrcode: IconQrcode,
    scissors: IconScissors,
    slug: IconLetterCase,
    case: IconLetterCaseToggle,
    math: IconMathFunction,
    diff: IconGitCompare,
    photo: IconPhotoScan,
    scan: IconTextScan2,
    eraser: IconEraser,
    background: IconBackground,
    compress: IconArrowsMinimize,
    crop: IconCrop,
    transform: IconTransform,
    blur: IconBlur,
    terminal: IconTerminal2,
    radar: IconRadar2,
    database: IconDatabaseCog,
    network: IconNetwork,
    server: IconServer2,
    graph: IconTopologyStar3,
    shield: IconShieldLock,
    certificate: IconCertificate,
    dice: IconDice5,
    "lock-code": IconLockCode,
    "file-pdf": IconFileTypePdf,
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
