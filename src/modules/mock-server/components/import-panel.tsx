"use client";

import { IconEraser, IconFileImport, IconLoader2, IconUpload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useByteLabel } from "@/modules/tools/components/byte-size";
import { CodeEditor } from "@/modules/tools/components/code-editor";
import {
    InputLimitMeter,
    useInputLimit,
    useInputLimitStatus,
} from "@/modules/tools/components/input-limit-meter";

import { StatusStrip } from "@/modules/tools/components/status-strip";

import { importDocument, type ImportReport } from "../actions/openapi";
import { MAX_OPENAPI_DOCUMENT_BYTES, WORKSPACE_NAME_LENGTH } from "../domain/constants";
import { EXAMPLE_SLOTS, EXAMPLE_SPECS, type ExampleSpec } from "../domain/example-specs";

type ImportPanelProps = {
    workspaceId: string;
};

/**
 * The refusals worth their own sentence.
 *
 * A reader can do something about each of these — shrink the document, bring a
 * different one, delete a server — and telling them "that could not be read"
 * instead would send somebody hunting for a syntax error in a file that parses
 * perfectly. Everything else collapses to the general message, because a
 * database that would not take a row is not a thing the reader can act on.
 *
 * Held as a literal union so the message keys are literal too.
 */
const NAMED_FAILURES = [
    "too_large",
    "unknown_format",
    "no_operations",
    "server_limit_reached",
] as const;

type NamedFailure = (typeof NAMED_FAILURES)[number] | "generic";

function namedFailure(reason: string): NamedFailure {
    return NAMED_FAILURES.find((name) => name === reason) ?? "generic";
}

/**
 * Uploading or pasting an API document.
 *
 * Two notations land in this one box — an OpenAPI or Swagger specification, and
 * a Postman collection — and the box does not ask which. There is no file name
 * on a paste, a dropdown to pick the format would be a question the document's
 * own first key already answers, and getting it wrong would refuse a perfectly
 * good file for the sake of a control nobody wants to operate.
 *
 * The file is read in the browser and sent as text rather than as a multipart
 * upload: it is a few hundred kilobytes at most, the Server Action boundary
 * already carries it, and reading it here means the paste box and the file
 * picker are one code path rather than two.
 *
 * The report afterwards is the point. An import that says "created 397" and
 * silently dropped three is worse than one that lists them — a silent
 * truncation reads as complete coverage. The same reasoning is why it counts
 * how many routes answer with a body the document actually supplied: a
 * collection saved without responses produces routes that all answer the same
 * placeholder, and a reader who is not told will read twelve working routes as
 * twelve imported ones.
 */
export function ImportPanel({ workspaceId }: ImportPanelProps) {
    const t = useTranslations("mockServer.import");
    const router = useRouter();

    const nameId = useId();
    const textId = useId();
    const enforceId = useId();
    const exampleId = useId();
    const fileRef = useRef<HTMLInputElement>(null);
    const editorId = `${textId}-editor`;

    const [name, setName] = useState("");
    const [text, setText] = useState("");
    // On by default, because a document that marks a header required is
    // describing an API that refuses without it, and a mock that accepts
    // anything passes tests the real integration fails. Off is still one press
    // away, for somebody who wants the routes and not the contract.
    const [enforceRequired, setEnforceRequired] = useState(true);

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
    const [failure, setFailure] = useState<NamedFailure | null>(null);
    const [pending, startTransition] = useTransition();

    const filled = text !== "" || name !== "" || report !== null || failure !== null;

    /**
     * Fills the box from a bundled document.
     *
     * The name is overwritten rather than only filled when blank, which is the
     * opposite of what `pickFile` does — and deliberately: a file picker is one
     * choice, while these buttons are a list somebody tries in turn, and being
     * left with the previous example's name on the new document is the kind of
     * small wrongness nobody notices until the server is created.
     */
    function pickExample(spec: ExampleSpec) {
        setText(spec.document);
        setName(spec.serverName);
        setFailure(null);
        setReport(null);
    }

    async function pickFile(file: File | undefined) {
        if (file === undefined) {
            return;
        }

        setText(await file.text());
        setFailure(null);

        if (name === "") {
            // `.postman_collection` before the extension, because that is what
            // Postman's own exporter appends — and a server called
            // "Payments.postman_collection" is a file name somebody would then
            // have to go and edit.
            setName(
                file.name
                    .replace(/\.(json|ya?ml)$/iu, "")
                    .replace(/\.postman_collection$/iu, "")
                    .trim(),
            );
        }
    }

    /**
     * Empties the panel.
     *
     * A megabyte of pasted JSON cannot be cleared by selecting it — the box
     * scrolls — so without this the only way out of a document you changed your
     * mind about is to reload the page and lose the name with it.
     *
     * The enforce switch is deliberately left alone: it is a setting the reader
     * chose about how imports should work, not one of the fields they are
     * clearing, and resetting it under them would undo a decision they made on
     * purpose. Focus moves to the paste box, because the button is about to
     * disable itself and focus on a disabled control belongs to nothing.
     */
    function clear() {
        setText("");
        setName("");
        setReport(null);
        setFailure(null);

        // The value has to be cleared or picking the same file a second time
        // fires no `change` event and the panel would sit there looking broken.
        if (fileRef.current !== null) {
            fileRef.current.value = "";
        }

        document.getElementById(editorId)?.focus();
    }

    function submit() {
        if (pending || text.trim() === "") {
            return;
        }

        setFailure(null);
        setReport(null);

        startTransition(async () => {
            const result = await importDocument({ workspaceId, name, text, enforceRequired });

            if (!result.ok) {
                setFailure(namedFailure(result.reason));

                return;
            }

            setReport(result);
            router.refresh();
        });
    }

    return (
        <div className="flex min-w-0 flex-col gap-4">
            {/* Above the fields rather than beside the paste box: somebody who
                has arrived without a document needs the way in before they meet
                the empty editor, not after. */}
            <section aria-labelledby={exampleId} className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                    <h2 id={exampleId} className="text-foreground text-xs font-semibold">
                        {t("exampleLabel")}
                    </h2>
                    <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                        {t("exampleHint")}
                    </p>
                </div>

                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {EXAMPLE_SPECS.map((spec) => (
                        <li key={spec.id} className="min-w-0">
                            <button
                                type="button"
                                onClick={() => pickExample(spec)}
                                className="border-border/70 bg-card hover:border-brand-cyan/50 hover:bg-brand-cyan/4 focus-visible:ring-ring flex h-full min-w-0 flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                            >
                                {/* A chip the width of the mark, not of the card.
                                    These are other people's logos, drawn for
                                    whatever ground they were drawn for — bKash's
                                    is dark ink and magenta, invisible on a dark
                                    surface — so each one sits on its own light
                                    plate. Full-width that plate reads as a white
                                    bar stuck across the tile; sized to what is in
                                    it, it reads as a logo. */}
                                <span className="inline-flex h-7 w-fit max-w-full items-center rounded-md bg-white px-2 ring-1 ring-black/6">
                                    <Image
                                        src={spec.logo.src}
                                        alt=""
                                        width={spec.logo.width}
                                        height={spec.logo.height}
                                        className="h-4 w-auto max-w-full object-contain"
                                    />
                                </span>

                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="text-foreground text-xs leading-snug font-medium text-pretty">
                                        {t(`examples.${spec.id}`)}
                                    </span>
                                    <span className="text-muted-foreground text-[0.6875rem] leading-snug text-pretty">
                                        {t(`exampleSummaries.${spec.id}`)}
                                    </span>
                                </span>

                                {/* Pinned to the bottom, so the numbers line up
                                    across tiles whose descriptions run to
                                    different lengths. */}
                                <span className="text-muted-foreground/80 mt-auto pt-1 text-[0.625rem] tabular-nums">
                                    {t("exampleMeta", {
                                        operations: spec.operations,
                                        required: spec.requiredFields,
                                    })}
                                </span>
                            </button>
                        </li>
                    ))}

                    {/* The slots the catalogue has not filled yet. Inert, and
                        said so in words: an empty tile that looked pressable
                        would be a control that does nothing, and leaving them
                        out would make a shelf with room on it read as a shelf
                        of one. */}
                    {Array.from({ length: Math.max(0, EXAMPLE_SLOTS - EXAMPLE_SPECS.length) }).map(
                        (_, index) => (
                            <li
                                key={`slot-${index}`}
                                className="border-border/60 text-muted-foreground/70 flex min-h-28 min-w-0 items-center justify-center rounded-xl border border-dashed p-3.5 text-center text-[0.6875rem] leading-snug"
                            >
                                {t("examplePending")}
                            </li>
                        ),
                    )}
                </ul>
            </section>

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
                    id={editorId}
                    value={text}
                    onChange={setText}
                    language="json"
                    // Both shapes, because a box that only shows one reads as a
                    // box that only takes one.
                    placeholder='{ "openapi": "3.1.0", ... }   or   { "info": { ... }, "item": [ ... ] }'
                    className="min-h-64"
                />

                <div className="flex justify-end">
                    <InputLimitMeter reading={textLimit} format={byteLabel} always />
                </div>

                {textStatus !== null ? (
                    <StatusStrip tone={textStatus.tone} message={textStatus.message} />
                ) : null}
            </div>

            <div className="border-border/70 bg-card flex min-w-0 items-start justify-between gap-4 rounded-2xl border p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <Label htmlFor={enforceId} className="text-xs">
                        {t("enforceLabel")}
                    </Label>
                    <p className="text-muted-foreground text-[0.6875rem] leading-normal">
                        {t("enforceHint")}
                    </p>
                </div>
                <Switch
                    id={enforceId}
                    checked={enforceRequired}
                    onCheckedChange={setEnforceRequired}
                />
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

                <Button
                    type="button"
                    variant="outline"
                    // Disabled rather than hidden: a button that appears when
                    // you start typing is a button nobody knows is coming.
                    disabled={pending || !filled}
                    onClick={clear}
                    className="gap-1.5"
                >
                    <IconEraser className="size-4" aria-hidden="true" />
                    {t("clearAction")}
                </Button>

                {failure !== null ? (
                    <StatusStrip tone="error" message={t(`failures.${failure}`)} />
                ) : null}
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
                        {report.created > 0
                            ? ` ${t("reportExamples", { count: report.examples })}`
                            : ""}
                        {report.guarded > 0
                            ? ` ${t("reportGuarded", { count: report.guarded })}`
                            : ""}
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
