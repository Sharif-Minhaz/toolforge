"use client";

import { useTranslations } from "next-intl";

import { OptionSelect, OptionSwitch } from "@/modules/tools/components/option-controls";
import {
    headersStyleApplies,
    includeResponseApplies,
    runtimeApplies,
    styleApplies,
} from "../domain/targets";
import {
    CODE_STYLES,
    CODE_TARGETS,
    FETCH_RUNTIMES,
    HEADERS_STYLES,
    INDENT_WIDTHS,
    SHELL_DIALECTS,
    type CodeOptions,
    type CurlDirection,
    type CurlOptions,
} from "../types";

type ConversionOptionsProps = {
    direction: CurlDirection;
    code: CodeOptions;
    curl: CurlOptions;
    onCodeChange: (patch: Partial<CodeOptions>) => void;
    onCurlChange: (patch: Partial<CurlOptions>) => void;
};

/**
 * The panel shows the set that matches the direction: shell quoting has nothing
 * to say about a `fetch` snippet, and a Headers instance has nothing to say
 * about a command. Within the code set, a control a target ignores is disabled
 * with the reason under it — never left present and inert.
 */
export function ConversionOptions({
    direction,
    code,
    curl,
    onCodeChange,
    onCurlChange,
}: ConversionOptionsProps) {
    const t = useTranslations("curl.workbench");
    const tTargets = useTranslations("curl.targets");
    const tRuntimes = useTranslations("curl.runtimes");
    const tStyles = useTranslations("curl.styles");
    const tHeaders = useTranslations("curl.headersStyles");
    const tIndents = useTranslations("curl.indents");
    const tShells = useTranslations("curl.shells");

    if (direction === "codeToCurl") {
        return (
            <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-xs">{t("optionsTitle")}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                    <OptionSelect
                        label={t("shell")}
                        hint={t("shellHint")}
                        value={curl.shell}
                        values={SHELL_DIALECTS}
                        items={Object.fromEntries(
                            SHELL_DIALECTS.map((shell) => [shell, tShells(shell)]),
                        )}
                        onChange={(shell) => onCurlChange({ shell })}
                    />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                    <OptionSwitch
                        label={t("multiLine")}
                        hint={t("multiLineHint")}
                        checked={curl.multiLine}
                        onCheckedChange={(multiLine) => onCurlChange({ multiLine })}
                    />
                    <OptionSwitch
                        label={t("longFlags")}
                        hint={t("longFlagsHint")}
                        checked={curl.longFlags}
                        onCheckedChange={(longFlags) => onCurlChange({ longFlags })}
                    />
                    <OptionSwitch
                        label={t("explicitMethod")}
                        hint={t("explicitMethodHint")}
                        checked={curl.explicitMethod}
                        onCheckedChange={(explicitMethod) => onCurlChange({ explicitMethod })}
                    />
                </div>
            </div>
        );
    }

    const runtimeOff = !runtimeApplies(code.target);
    const styleOff = !styleApplies(code.target);
    const headersOff = !headersStyleApplies(code.target);
    const responseOff = !includeResponseApplies(code.target);

    return (
        <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">{t("optionsTitle")}</p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <OptionSelect
                    label={t("target")}
                    hint={t("targetHint")}
                    value={code.target}
                    values={CODE_TARGETS}
                    items={Object.fromEntries(
                        CODE_TARGETS.map((target) => [target, tTargets(target)]),
                    )}
                    onChange={(target) => onCodeChange({ target })}
                />
                <OptionSelect
                    label={t("runtime")}
                    hint={runtimeOff ? t("runtimeUnavailable") : t("runtimeHint")}
                    value={code.runtime}
                    values={FETCH_RUNTIMES}
                    disabled={runtimeOff}
                    items={Object.fromEntries(
                        FETCH_RUNTIMES.map((runtime) => [runtime, tRuntimes(runtime)]),
                    )}
                    onChange={(runtime) => onCodeChange({ runtime })}
                />
                <OptionSelect
                    label={t("style")}
                    hint={styleOff ? t("styleUnavailable") : t("styleHint")}
                    value={code.style}
                    values={CODE_STYLES}
                    disabled={styleOff}
                    items={Object.fromEntries(CODE_STYLES.map((style) => [style, tStyles(style)]))}
                    onChange={(style) => onCodeChange({ style })}
                />
                <OptionSelect
                    label={t("indent")}
                    hint={t("indentHint")}
                    value={code.indent}
                    values={INDENT_WIDTHS}
                    items={Object.fromEntries(
                        INDENT_WIDTHS.map((indent) => [indent, tIndents(indent)]),
                    )}
                    onChange={(indent) => onCodeChange({ indent })}
                />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <OptionSelect
                    label={t("headersStyle")}
                    hint={headersOff ? t("headersStyleUnavailable") : t("headersStyleHint")}
                    value={code.headersStyle}
                    values={HEADERS_STYLES}
                    disabled={headersOff}
                    items={Object.fromEntries(
                        HEADERS_STYLES.map((style) => [style, tHeaders(style)]),
                    )}
                    onChange={(headersStyle) => onCodeChange({ headersStyle })}
                />
                <OptionSwitch
                    label={t("includeResponse")}
                    hint={responseOff ? t("includeResponseUnavailable") : t("includeResponseHint")}
                    checked={code.includeResponse}
                    disabled={responseOff}
                    onCheckedChange={(includeResponse) => onCodeChange({ includeResponse })}
                />
            </div>
        </div>
    );
}
