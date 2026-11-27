"use client";

import { IconMouse, IconTarget } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ComponentProps } from "react";

import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/modules/tools/components/segmented-control";
import { MOUSE_TESTER_MODES, type MouseTesterMode } from "../types";
import { AimPanel } from "./aim-panel";
import { MouseTesterWorkbench } from "./mouse-tester-workbench";

const MODE_ICONS = { buttons: IconMouse, aim: IconTarget } as const;

type MouseTesterModesProps = {
    initialMode: MouseTesterMode;
    buttons: ComponentProps<typeof MouseTesterWorkbench>;
    aim: ComponentProps<typeof AimPanel>;
};

/**
 * The button test and the aim trainer behind one switch. Both stay mounted and
 * the inactive one is hidden, so a session's counts survive a look at the
 * other — and since each listens only inside its own area, a hidden one hears
 * nothing.
 */
export function MouseTesterModes({ initialMode, buttons, aim }: MouseTesterModesProps) {
    const t = useTranslations("mouseTester.modes");
    const labelId = useId();
    const [mode, setMode] = useState(initialMode);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <Label id={labelId} className="text-muted-foreground text-xs">
                    {t("label")}
                </Label>
                <div className="w-full max-w-md">
                    <SegmentedControl
                        options={MOUSE_TESTER_MODES.map((value) => ({
                            value,
                            label: t(`options.${value}`),
                            Icon: MODE_ICONS[value],
                        }))}
                        value={mode}
                        labelId={labelId}
                        layoutId="mouse-tester-mode-indicator"
                        onChange={setMode}
                    />
                </div>
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {t(`hints.${mode}`)}
                </p>
            </div>

            <div hidden={mode !== "buttons"}>
                <MouseTesterWorkbench {...buttons} />
            </div>
            <div hidden={mode !== "aim"}>
                <AimPanel {...aim} />
            </div>
        </div>
    );
}
