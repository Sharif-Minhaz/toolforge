"use client";

import { IconFileImport, IconLoader2, IconUpload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import {
    InputLimitMeter,
    useInputLimit,
    useInputLimitStatus,
} from "@/modules/tools/components/input-limit-meter";

import { StatusStrip } from "@/modules/tools/components/status-strip";

import { importOpenApi, type ImportReport } from "../actions/openapi";
import { MAX_OPENAPI_DOCUMENT_BYTES, WORKSPACE_NAME_LENGTH } from "../domain/constants";

type OpenApiImportProps = {
    workspaceId: string;
};

/**
 * Uploading or pasting an OpenAPI document.
 *
 * The file is read in the browser and sent as text rather than as a multipart
 * upload: it is a few hundred kilobytes at most, the Server Action boundary
 * already carries it, and reading it here means the paste box and the file
 * picker are one code path rather than two.
 *
 * The report afterwards is the point. An import that says "created 397" and
 * silently dropped three is worse than one that lists them — a silent
 * truncation reads as complete coverage.
 */
export function OpenApiImport({ workspaceId }: OpenApiImportProps) {
    const t = useTranslations("mockServer.import");
    const router = useRouter();

    const nameId = useId();
    const textId = useId();
    const fileRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState("");
    const [text, setText] = useState("");

    const byteLabel = useByteLabel();
    const nameLimit = useInputLimit(name.length, WORKSPACE_NAME_LENGTH.max);
    // Measured in UTF-16 units against a byte ceiling, which under-counts
    // non-ASCII — deliberately, because it is the same comparison the action
    // makes with `z.string().max()`. The parser applies the exact byte
    // measure afterwards; this is the half that has to agree with the box.
    const textLimit = useInputLimit(text.length, MAX_OPENAPI_DOCUMENT_BYTES);
    // The sentence under the box. Null while the document fits, so the
    // import's own failure keeps the strip to itself.
    const textStatus = useInputLimitStatus(textLimit, byteLabel);
    const [report, setReport] = useState<ImportReport | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    async function pickFile(file: File | undefined) {
        if (file === undefined) {
            return;
        }

        setText(await file.text());
        setFailure(null);

        if (name === "") {
            setName(file.name.replace(/\.(json|ya?ml)$/iu, ""));
        }
    }

    function submit() {
        if (pending || text.trim() === "") {
            return;
        }

        setFailure(null);
        setReport(null);

        startTransition(async () => {
            const result = await importOpenApi({ workspaceId, name, text });

            if (!result.ok) {
                setFailure(result.reason);

                return;
            }

            setReport(result);
            router.refresh();
        });
    }

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={nameId} className="text-xs">
                            {t("nameLabel")}
                        </Label>
                        <InputLimitMeter reading={nameLimit} />
                    </div>
                    <Input
                        id={nameId}
                        // `checkWorkspaceName` owns the real rule and falls back
                        // to the document's own title when this is blank.
                        maxLength={WORKSPACE_NAME_LENGTH.max}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t("namePlaceholder")}
                        autoComplete="off"
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">{t("fileLabel")}</Label>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".json,.yaml,.yml,application/json,text/yaml"
                        className="sr-only"
                        onChange={(event) => void pickFile(event.target.files?.[0])}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="w-fit gap-1.5"
                        onClick={() => fileRef.current?.click()}
                    >
                        <IconUpload className="size-4" aria-hidden="true" />
                        {t("chooseFile")}
                    </Button>
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-xs" id={textId}>
                    {t("textLabel")}
                </Label>
                <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                    {t("textHint")}
                </p>
                <CodeEditor
                    id={`${textId}-editor`}
                    value={text}
                    onChange={setText}
                    language="json"
                    placeholder='{ "openapi": "3.1.0", ... }'
                    className="min-h-64"
                />

                {/* Not capped with `maxLength`: a specification is pasted whole,
                    and silently trimming one at four megabytes would produce a
                    document that fails to parse for a reason nothing explains.
                    The meter says how far over it is and Import stays
                    unavailable until it fits. */}
                <div className="flex justify-end">
                    <InputLimitMeter reading={textLimit} format={byteLabel} always />
                </div>

                {textStatus !== null ? (
                    <StatusStrip tone={textStatus.tone} message={textStatus.message} />
                ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    disabled={pending || text.trim() === "" || textLimit.state === "over"}
                    onClick={submit}
                    className="gap-1.5"
                >
                    {pending ? (
                        <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <IconFileImport className="size-4" aria-hidden="true" />
                    )}
                    {t("importAction")}
                </Button>

                {failure !== null ? <StatusStrip tone="error" message={t("failed")} /> : null}
            </div>

            {report !== null ? (
                <section
                    aria-labelledby="import-report"
                    className="border-border/70 bg-card rounded-2xl border p-5"
                >
                    <h2 id="import-report" className="text-foreground text-sm font-semibold">
                        {t("reportTitle")}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                        {t("reportCreated", { count: report.created })}
                    </p>

                    {report.skipped.length > 0 ? (
                        <>
                            {/* Listed, never summarised away: a silent truncation
                                reads as complete coverage. */}
                            <p className="text-brand-amber mt-3 text-xs font-medium">
                                {t("reportSkipped", { count: report.skipped.length })}
                            </p>
                            <ul className="text-muted-foreground mt-1 flex flex-col gap-0.5">
                                {report.skipped.map((entry, index) => (
                                    <li
                                        key={`${entry.path}-${index}`}
                                        className="font-mono text-[0.6875rem]"
                                    >
                                        {entry.path || "—"} · {entry.reason}
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : null}

                    <Button
                        type="button"
                        size="sm"
                        className="mt-4"
                        onClick={() =>
                            router.push(`/mock/${workspaceId}/servers/${report.serverId}`)
                        }
                    >
                        {t("openServer")}
                    </Button>
                </section>
            ) : null}
        </div>
    );
}
