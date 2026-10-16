"use client";

import {
    IconDownload,
    IconKeyboard,
    IconLock,
    IconLockOpen,
    IconRefresh,
} from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ToolForgeMark, ToolForgeWordmark } from "@/components/brand/toolforge-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { OptionSelect } from "@/modules/tools/components/option-controls";
import { StatusStrip } from "@/modules/tools/components/status-strip";
import { saveFile } from "@/modules/tools/domain/file-saver";
import { combosFor } from "../domain/combos";
import {
    BOOT_PROTOCOL_KEYS,
    KEY_FAULT_WINDOW_STEP_MS,
    MAX_KEY_FAULT_WINDOW_MS,
    MIN_KEY_FAULT_WINDOW_MS,
} from "../domain/constants";
import { detectLayoutFamily, keyLabel } from "../domain/labels";
import { buildLayout } from "../domain/layouts";
import { keyboardProgress } from "../domain/progress";
import { buildKeyboardReport } from "../domain/report";
import { applyKeyInput, createKeySession, heldCodes } from "../domain/session";
import {
    KEY_LABEL_SYSTEMS,
    KEYBOARD_SIZES,
    KEYBOARD_STANDARDS,
    type KeyboardSize,
    type KeyboardStandard,
    type KeyInput,
    type KeyLabelSystem,
} from "../types";
import { CombosPanel } from "./combos-panel";
import { KeyboardView, type KeyState } from "./keyboard-view";
import { LockLights } from "./lock-lights";
import { useKeyboardCapture } from "./use-keyboard-capture";
import { useKeyboardReportText } from "./use-keyboard-report-text";
import { useLayoutMap } from "./use-layout-map";

/** How many of the keys still to test are named before "and N more". */
const UNTESTED_SHOWN = 24;

/** How many recent presses the strip under the board draws; the fade hides the overflow. */
const HISTORY_SHOWN = 24;

type KeyboardTesterWorkbenchProps = {
    initialSize: KeyboardSize;
    initialStandard: KeyboardStandard;
    initialSystem: KeyLabelSystem;
    initialFaultWindow: number;
};

export function KeyboardTesterWorkbench({
    initialSize,
    initialStandard,
    initialSystem,
    initialFaultWindow,
}: KeyboardTesterWorkbenchProps) {
    const t = useTranslations("keyboardTester.workbench");
    const tSizes = useTranslations("keyboardTester.sizes");
    const tStandards = useTranslations("keyboardTester.standards");
    const tSystems = useTranslations("keyboardTester.systems");
    const tFamilies = useTranslations("keyboardTester.families");
    const tToast = useTranslations("keyboardTester.toast");
    const tRollover = useTranslations("keyboardTester.rollover");
    const formatter = useFormatter();
    const reportText = useKeyboardReportText();

    const rootRef = useRef<HTMLDivElement>(null);
    const areaRef = useRef<HTMLDivElement>(null);
    const areaHintId = useId();
    const windowLabelId = useId();

    const [size, setSize] = useState(initialSize);
    const [standard, setStandard] = useState(initialStandard);
    const [system, setSystem] = useState(initialSystem);
    const [faultWindowMs, setFaultWindowMs] = useState(initialFaultWindow);
    const [session, setSession] = useState(createKeySession);

    const record = useCallback(
        (input: KeyInput) =>
            setSession((current) => applyKeyInput(current, input, { faultWindowMs })),
        [faultWindowMs],
    );

    const capture = useKeyboardCapture(areaRef, rootRef, record);
    const layoutMap = useLayoutMap();

    // Pure and cheap, so derived on every render rather than stored: the
    // board, its progress and its chords all follow the three selects at once.
    const layout = buildLayout(size, standard);
    const progress = keyboardProgress(session, layout);
    const combos = combosFor(layout.codes);
    const held = heldCodes(session);
    const family = layoutMap === null ? null : detectLayoutFamily(layoutMap);
    const latest = session.history[0];

    const labelOf = (code: string) => keyLabel(code, system, layoutMap);
    const nameOf = (code: string) => labelOf(code).main;

    function stateOf(code: string): KeyState {
        const stats = session.keys[code];

        if (stats?.held === true) {
            return "held";
        }

        if ((stats?.chatter ?? 0) > 0) {
            return "chatter";
        }

        return (stats?.presses ?? 0) > 0 ? "tested" : "untested";
    }

    function handleReset() {
        setSession(createKeySession());
        areaRef.current?.focus();
    }

    function handleDownload() {
        const generated = new Date();
        const content = buildKeyboardReport(
            { session, progress, combos: combos.map((combo) => combo.id) },
            reportText({
                generated,
                userAgent: navigator.userAgent,
                board: `${tSizes(size)} · ${tStandards(standard)}`,
                family: family === null ? null : tFamilies(family),
                faultWindowMs,
                nameOf,
            }),
        );
        const filename = `keyboard-test-${generated.toISOString().slice(0, 10)}.txt`;

        try {
            saveFile({ filename, mimeType: "text/plain;charset=utf-8", content });
            toast.success(tToast("downloaded", { filename }));
        } catch (caught) {
            logEvent("error", "keyboard_tester.download_failed", { error: describeError(caught) });
            toast.error(tToast("downloadFailed"));
        }
    }

    const percent = progress.total === 0 ? 0 : progress.tested / progress.total;
    const rollover =
        session.peakHeld.others > BOOT_PROTOCOL_KEYS
            ? "nkro"
            : session.peakHeld.others === BOOT_PROTOCOL_KEYS
              ? "six"
              : "unknown";

    return (
        <Card
            ref={rootRef}
            className="gap-0 overflow-hidden p-0 [&:fullscreen]:overflow-auto [&:fullscreen]:rounded-none"
        >
            {/* 1 — what is being tested, and what to do with the result. */}
            <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:p-5 lg:flex-row lg:items-end">
                <div className="grid flex-1 gap-3 sm:grid-cols-3">
                    <OptionSelect
                        label={t("size")}
                        value={size}
                        values={KEYBOARD_SIZES}
                        items={Object.fromEntries(
                            KEYBOARD_SIZES.map((value) => [value, tSizes(value)]),
                        )}
                        onChange={setSize}
                    />
                    <OptionSelect
                        label={t("standard")}
                        value={standard}
                        values={KEYBOARD_STANDARDS}
                        items={Object.fromEntries(
                            KEYBOARD_STANDARDS.map((value) => [value, tStandards(value)]),
                        )}
                        onChange={setStandard}
                    />
                    <OptionSelect
                        label={t("labels")}
                        value={system}
                        values={KEY_LABEL_SYSTEMS}
                        items={Object.fromEntries(
                            KEY_LABEL_SYSTEMS.map((value) => [value, tSystems(value)]),
                        )}
                        onChange={setSystem}
                    />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={handleDownload}
                        disabled={latest === undefined}
                    >
                        <IconDownload className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("downloadReport")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={handleReset}
                        disabled={latest === undefined}
                    >
                        <IconRefresh className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("reset")}
                    </Button>
                </div>
            </div>

            {/* 2 — the board, and what it just heard. */}
            <div className="flex flex-col gap-3 p-4 sm:p-5">
                {capture.unidentified > 0 && (
                    <StatusStrip tone="warning" message={t("virtualKeyboard")} />
                )}

                {/* Focus is the switch: while this has it, every key belongs
                    to the test; click anywhere else, or hold Escape, and the
                    page gets its keyboard back. */}
                <div
                    ref={areaRef}
                    role="application"
                    tabIndex={0}
                    aria-label={t("areaLabel")}
                    aria-describedby={areaHintId}
                    className={cn(
                        "bg-muted/20 relative rounded-2xl p-3 outline-none sm:p-4",
                        "ring-2 transition-[box-shadow] duration-200 ring-inset",
                        capture.focused ? "ring-primary/70" : "ring-border/70",
                    )}
                >
                    <div className="overflow-x-auto">
                        <div className="min-w-[44rem]">
                            <KeyboardView
                                layout={layout}
                                indicator={
                                    // Two rows, as on the boards it copies:
                                    // the lights across the top, the maker's
                                    // name under them.
                                    <div className="flex h-full flex-col items-center justify-center gap-[0.45em]">
                                        <LockLights locks={capture.locks} />
                                        <span className="flex items-center gap-[0.35em] opacity-80">
                                            <ToolForgeMark className="size-[1.25em]" />
                                            <ToolForgeWordmark className="text-[0.95em]" />
                                        </span>
                                    </div>
                                }
                                labelOf={labelOf}
                                stateOf={stateOf}
                                fnLabel={t("fn")}
                            />
                        </div>
                    </div>

                    {!capture.focused && (
                        <div className="bg-background/70 absolute inset-0 grid place-items-center rounded-2xl backdrop-blur-[2px]">
                            <span className="bg-card ring-border inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-sm ring-1">
                                <IconKeyboard
                                    className="text-primary size-4"
                                    stroke={1.8}
                                    aria-hidden="true"
                                />
                                {t("start")}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p
                        id={areaHintId}
                        className="text-muted-foreground inline-flex items-center gap-2 text-[0.75rem] leading-5"
                    >
                        <span
                            aria-hidden="true"
                            className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                capture.focused ? "bg-primary" : "bg-muted-foreground/40",
                            )}
                        />
                        {capture.focused ? t("capturing") : t("notCapturing")}
                    </p>
                    <span className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem]">
                        {family !== null && (
                            <span>{t("detectedLayout", { family: tFamilies(family) })}</span>
                        )}
                        {/* The lights in words, and drawn here too on boards
                            whose drawing has no corner for them. */}
                        <span className="inline-flex items-center gap-2">
                            {layout.indicatorArea === null && (
                                <LockLights locks={capture.locks} className="text-[0.75rem]" />
                            )}
                            <span className={layout.indicatorArea === null ? "sr-only" : undefined}>
                                {capture.locks === null
                                    ? t("locksUnknown")
                                    : t("locks", {
                                          num: capture.locks.NumLock ? "on" : "off",
                                          caps: capture.locks.CapsLock ? "on" : "off",
                                          scroll: capture.locks.ScrollLock ? "on" : "off",
                                      })}
                            </span>
                        </span>
                    </span>
                </div>

                <InfoRow label={t("historyLabel")}>
                    {latest === undefined ? (
                        <span className="text-muted-foreground text-[0.75rem]">
                            {t("lastNone")}
                        </span>
                    ) : (
                        // One line, newest first, fading out to the right: the
                        // strip says what just happened, and the counts below
                        // say everything else.
                        <ol
                            aria-live="polite"
                            className="flex min-w-0 flex-1 gap-1 overflow-hidden [mask-image:linear-gradient(to_right,black_80%,transparent)]"
                        >
                            {session.history.slice(0, HISTORY_SHOWN).map((entry, index) => (
                                <li
                                    key={entry.id}
                                    className={cn(
                                        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[0.6875rem] whitespace-nowrap ring-1 ring-inset",
                                        entry.chatter
                                            ? "bg-destructive/10 text-destructive ring-destructive/40"
                                            : index === 0
                                              ? "bg-primary/10 ring-primary/40 text-foreground"
                                              : "ring-border text-muted-foreground",
                                    )}
                                >
                                    {nameOf(entry.code)}
                                    {entry.chatter && entry.interval !== null && (
                                        <span>
                                            {t("interval", {
                                                value: formatter.number(Math.round(entry.interval)),
                                            })}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </InfoRow>

                {progress.tested > 0 && (
                    <InfoRow
                        label={t("untestedTitle", {
                            count: formatter.number(progress.untested.length),
                        })}
                    >
                        <span
                            className={cn(
                                "text-[0.75rem] leading-5",
                                progress.untested.length === 0 && "text-success",
                            )}
                        >
                            {progress.untested.length === 0
                                ? t("allTested")
                                : [
                                      progress.untested
                                          .slice(0, UNTESTED_SHOWN)
                                          .map(nameOf)
                                          .join(" · "),
                                      progress.untested.length > UNTESTED_SHOWN
                                          ? t("andMore", {
                                                count: formatter.number(
                                                    progress.untested.length - UNTESTED_SHOWN,
                                                ),
                                            })
                                          : "",
                                  ].join(" ")}
                        </span>
                    </InfoRow>
                )}

                {progress.extra.length > 0 && (
                    <InfoRow label={t("extraKeys")}>
                        <ul className="flex flex-wrap gap-1">
                            {progress.extra.map((code) => (
                                <li
                                    key={code}
                                    className={cn(
                                        "rounded-md px-1.5 py-0.5 font-mono text-[0.6875rem] ring-1 ring-inset",
                                        held.has(code)
                                            ? "bg-primary text-primary-foreground ring-primary"
                                            : "bg-success/15 ring-success/50",
                                    )}
                                >
                                    {code}
                                </li>
                            ))}
                        </ul>
                    </InfoRow>
                )}
            </div>

            {/* 3 — the readings, one card each, all the same height. */}
            <div className="border-border/70 grid gap-3 border-t p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
                <Reading
                    label={t("tested")}
                    value={
                        <>
                            {formatter.number(progress.tested)}
                            <span className="text-muted-foreground text-base font-normal">
                                {" / "}
                                {formatter.number(progress.total)}
                            </span>
                        </>
                    }
                >
                    <span
                        role="progressbar"
                        aria-label={t("tested")}
                        aria-valuemin={0}
                        aria-valuemax={progress.total}
                        aria-valuenow={progress.tested}
                        className="bg-muted block h-1.5 overflow-hidden rounded-full"
                    >
                        <span
                            className="bg-success block h-full rounded-full transition-[width] duration-200"
                            style={{ width: `${percent * 100}%` }}
                        />
                    </span>
                    <span>
                        {t("percent", {
                            value: formatter.number(percent, {
                                style: "percent",
                                maximumFractionDigits: 0,
                            }),
                        })}
                    </span>
                </Reading>

                <Reading
                    label={tRollover("title")}
                    value={tRollover("peakValue", {
                        count: formatter.number(session.peakHeld.total),
                    })}
                >
                    <span>
                        {tRollover("peakDetail", {
                            others: formatter.number(session.peakHeld.others),
                            modifiers: formatter.number(session.peakHeld.modifiers),
                            held: formatter.number(held.size),
                        })}
                    </span>
                    <span>{tRollover(`verdict.${rollover}`)}</span>
                </Reading>

                <Reading
                    label={t("chatterTitle")}
                    value={formatter.number(progress.chattering.length)}
                    alert={progress.chattering.length > 0}
                >
                    {progress.chattering.length === 0 ? (
                        <span>{progress.tested === 0 ? t("chatterIdle") : t("chatterNone")}</span>
                    ) : (
                        <span className="flex flex-wrap gap-1">
                            {progress.chattering.map(({ code, count }) => (
                                <span
                                    key={code}
                                    className="bg-destructive/10 text-destructive ring-destructive/40 rounded px-1.5 py-0.5 font-mono text-[0.6875rem] ring-1 ring-inset"
                                >
                                    {t("chatterKey", {
                                        key: nameOf(code),
                                        count: formatter.number(count),
                                    })}
                                </span>
                            ))}
                        </span>
                    )}
                    <span className="mt-auto flex flex-col gap-1.5 pt-1">
                        <span className="flex items-center justify-between gap-2">
                            <span id={windowLabelId}>{t("faultWindow")}</span>
                            <span className="text-foreground font-mono tabular-nums">
                                {t("ms", { value: formatter.number(faultWindowMs) })}
                            </span>
                        </span>
                        <Slider
                            aria-labelledby={windowLabelId}
                            min={MIN_KEY_FAULT_WINDOW_MS}
                            max={MAX_KEY_FAULT_WINDOW_MS}
                            step={KEY_FAULT_WINDOW_STEP_MS}
                            value={faultWindowMs}
                            onValueChange={(value) =>
                                setFaultWindowMs(Array.isArray(value) ? value[0] : value)
                            }
                        />
                    </span>
                </Reading>

                <Reading
                    label={t("repeatTitle")}
                    value={
                        session.repeat === null
                            ? "—"
                            : t("repeatValue", {
                                  rate: formatter.number(session.repeat.perSecond, {
                                      maximumFractionDigits: 1,
                                  }),
                              })
                    }
                >
                    <span>
                        {session.repeat === null
                            ? t("repeatIdle")
                            : t("repeatDelay", {
                                  delay: formatter.number(Math.round(session.repeat.delayMs)),
                              })}
                    </span>
                    <span>{t("repeatHint")}</span>
                </Reading>
            </div>

            {/* 4 — ghosting chords. */}
            <div className="border-border/70 flex flex-col gap-3 border-t p-4 sm:p-5">
                <div className="flex flex-col gap-0.5">
                    <h3 className="text-sm font-medium">{tRollover("chordsTitle")}</h3>
                    <p className="text-muted-foreground max-w-[68ch] text-[0.75rem] leading-5">
                        {tRollover("hint")}
                    </p>
                </div>
                <CombosPanel combos={combos} passed={session.combos} held={held} nameOf={nameOf} />
            </div>

            {/* 5 — the keys a page cannot reach without asking. */}
            <div className="border-border/70 bg-muted/20 flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{t("systemKeysTitle")}</span>
                    {capture.systemKeys === "unsupported" ? (
                        <StatusStrip tone="warning" message={t("systemKeysUnsupported")} />
                    ) : (
                        <span className="text-muted-foreground max-w-[68ch] text-[0.75rem] leading-5">
                            {capture.systemKeys === "on"
                                ? t("systemKeysActive")
                                : t("systemKeysHint")}
                        </span>
                    )}
                </div>
                {capture.systemKeys === "on" ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={capture.releaseSystemKeys}
                    >
                        <IconLockOpen className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("systemKeysOff")}
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={capture.captureSystemKeys}
                    >
                        <IconLock className="size-3.5" stroke={1.8} aria-hidden="true" />
                        {t("systemKeysOn")}
                    </Button>
                )}
            </div>
        </Card>
    );
}

/** A labelled line under the board: what it is on the left, the content beside it. */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-muted-foreground w-36 shrink-0 text-[0.6875rem] font-medium tracking-wider uppercase">
                {label}
            </span>
            <div className="flex min-w-0 flex-1">{children}</div>
        </div>
    );
}

type ReadingProps = {
    label: string;
    value: ReactNode;
    /** The value is a count of faults, and it is not zero. */
    alert?: boolean;
    children: ReactNode;
};

/** One reading: a label, one large value, and the lines that explain it. */
function Reading({ label, value, alert = false, children }: ReadingProps) {
    return (
        <section className="ring-border/60 flex h-full min-w-0 flex-col gap-1.5 rounded-xl p-3.5 ring-1 ring-inset">
            <h3 className="text-muted-foreground text-[0.6875rem] font-medium tracking-wider uppercase">
                {label}
            </h3>
            <p
                className={cn(
                    "font-mono text-2xl font-semibold tabular-nums",
                    alert && "text-destructive",
                )}
            >
                {value}
            </p>
            <div className="text-muted-foreground flex flex-1 flex-col gap-1.5 text-[0.75rem] leading-5">
                {children}
            </div>
        </section>
    );
}
