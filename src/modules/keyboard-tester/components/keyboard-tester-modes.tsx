"use client";

import { IconKeyboard, IconStopwatch } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ComponentProps } from "react";

import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/modules/tools/components/segmented-control";
import { KEYBOARD_TESTER_MODES, type KeyboardTesterMode } from "../types";
import { KeyboardTesterWorkbench } from "./keyboard-tester-workbench";
import { TypingPanel } from "./typing-panel";

const MODE_ICONS = { keys: IconKeyboard, typing: IconStopwatch } as const;

type KeyboardTesterModesProps = {
    initialMode: KeyboardTesterMode;
    keys: ComponentProps<typeof KeyboardTesterWorkbench>;
    typing: ComponentProps<typeof TypingPanel>;
};

/**
 * The key test and the typing test behind one switch.
 *
 * Both stay mounted and the inactive one is hidden, so flipping across to check
 * a speed and back keeps the keys already tested lit. Hidden is also what keeps
 * them from fighting over the keyboard: the key test only listens while its
 * area has focus, and a hidden area cannot have it.
 */
export function KeyboardTesterModes({ initialMode, keys, typing }: KeyboardTesterModesProps) {
    const t = useTranslations("keyboardTester.modes");
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
                        options={KEYBOARD_TESTER_MODES.map((value) => ({
                            value,
                            label: t(`options.${value}`),
                            Icon: MODE_ICONS[value],
                        }))}
                        value={mode}
                        labelId={labelId}
                        layoutId="keyboard-tester-mode-indicator"
                        onChange={setMode}
                    />
                </div>
                <p className="text-muted-foreground text-[0.6875rem] leading-[1.4]">
                    {t(`hints.${mode}`)}
                </p>
            </div>

            <div hidden={mode !== "keys"}>
                <KeyboardTesterWorkbench {...keys} />
            </div>
            <div hidden={mode !== "typing"}>
                <TypingPanel {...typing} />
            </div>
        </div>
    );
}
