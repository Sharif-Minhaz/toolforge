"use client";

import { IconAlertTriangle, IconDownload, IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { CodeBlock } from "@/modules/tools/components/code-block";
import { CopyIconSwap } from "@/modules/tools/components/copy-button";
import { copyText } from "@/modules/tools/domain/clipboard";
import { saveFile } from "@/modules/tools/domain/file-saver";

import type { CollectionModel, SchemaModel, SingularModel } from "../types";

type SchemaPanelProps = {
    schema: SchemaModel;
    sdl: string;
    serverKey: string;
};

/**
 * What the document turned into, printed where somebody can check it.
 *
 * This panel exists because **every name in a derived schema is a guess this
 * tool made**, and most of them are unremarkable while a few are not: an
 * inflector that reads `people` as `Peopl`, a hyphen repaired into a camel hump,
 * two keys that wanted one type name. Printing the derived name beside the
 * document key it came from is what turns a wrong guess from something a
 * consumer discovers in generated code into something the author sees before
 * anybody depends on it.
 *
 * The two downloads are the other half. An endpoint whose schema cannot leave it
 * is one no codegen tool can use, so `schema.graphql` and the introspection JSON
 * are both a button rather than something to work out with `curl`.
 */
export function SchemaPanel({ schema, sdl, serverKey }: SchemaPanelProps) {
    const t = useTranslations("graphqlServer.schema");
    const tSkip = useTranslations("graphqlServer.skipReasons");
    const tRename = useTranslations("graphqlServer.renameReasons");
    const tToast = useTranslations("graphqlServer.toast");
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const collections = schema.resources.filter(
        (resource): resource is CollectionModel => resource.kind === "collection",
    );
    const singulars = schema.resources.filter(
        (resource): resource is SingularModel => resource.kind === "singular",
    );
    const relations = schema.resources.flatMap((resource) =>
        resource.kind === "opaque"
            ? []
            : resource.relations.map((relation) => ({ from: resource.typeName, relation })),
    );

    async function copySdl() {
        const result = await copyText(sdl);

        if (result.ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2_000);

            return;
        }

        logEvent("error", "graphql_server.sdl_copy_failed", {
            error: describeError(result.reason),
        });
        toast.error(tToast("copyFailed"));
    }

    function downloadSdl() {
        try {
            saveFile({
                filename: `${serverKey}.schema.graphql`,
                mimeType: "application/graphql",
                content: sdl,
            });
        } catch (caught) {
            logEvent("error", "graphql_server.sdl_download_failed", {
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        }
    }

    /**
     * The introspection JSON, fetched from the endpoint rather than derived here.
     *
     * A second derivation would be a second thing to keep in step, and the whole
     * value of this file is that a consumer can trust it matches what the server
     * answers. Fetching it means the download is, by construction, exactly what
     * `apollo client:download-schema` would have got.
     */
    async function downloadIntrospection() {
        setDownloading(true);

        try {
            const response = await fetch(`/g/${serverKey}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ query: INTROSPECTION_QUERY }),
            });
            const body = await response.text();

            saveFile({
                filename: `${serverKey}.introspection.json`,
                mimeType: "application/json",
                content: body,
            });
        } catch (caught) {
            logEvent("error", "graphql_server.introspection_download_failed", {
                error: describeError(caught),
            });
            toast.error(tToast("downloadFailed"));
        } finally {
            setDownloading(false);
        }
    }

    if (schema.isEmpty) {
        return (
            <div className="border-border/70 rounded-2xl border border-dashed p-6 text-center">
                <p className="text-foreground text-sm leading-[1.3] font-medium">
                    {t("emptyTitle")}
                </p>
                <p className="text-muted-foreground mx-auto mt-1.5 max-w-[60ch] text-xs leading-relaxed">
                    {t("emptyBody")}
                </p>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-1.5">
                <h3 className="text-foreground text-sm leading-[1.3] font-semibold">
                    {t("title")}
                </h3>
                <p className="text-muted-foreground max-w-[68ch] text-xs leading-relaxed">
                    {t("description")}
                </p>
            </div>

            {/* Wide content scrolls inside its own container; the page never does. */}
            <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-xl border-collapse text-left text-xs">
                    <caption className="sr-only">{t("typesHeading")}</caption>
                    <thead>
                        <tr className="text-muted-foreground border-border/70 border-b">
                            <th scope="col" className="py-2 pr-3 font-medium">
                                {t("resourceColumn")}
                            </th>
                            <th scope="col" className="py-2 pr-3 font-medium">
                                {t("typeColumn")}
                            </th>
                            <th scope="col" className="py-2 pr-3 font-medium">
                                {t("queryColumn")}
                            </th>
                            <th scope="col" className="py-2 pr-3 font-medium">
                                {t("mutationColumn")}
                            </th>
                            <th scope="col" className="py-2 text-right font-medium">
                                {t("recordsColumn")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {collections.map((model) => (
                            <tr key={model.resource} className="border-border/50 border-b">
                                <td className="py-2 pr-3 font-mono">{model.resource}</td>
                                <td className="text-syntax-key py-2 pr-3 font-mono">
                                    {model.typeName}
                                </td>
                                <td className="text-muted-foreground py-2 pr-3 font-mono">
                                    {model.listField}, {model.singleField}, {model.connectionField}
                                </td>
                                <td className="text-muted-foreground py-2 pr-3 font-mono">
                                    {model.mutations.create}, {model.mutations.update},{" "}
                                    {model.mutations.patch}, {model.mutations.remove}
                                </td>
                                <td className="py-2 text-right tabular-nums">
                                    {model.recordCount}
                                </td>
                            </tr>
                        ))}
                        {singulars.map((model) => (
                            <tr key={model.resource} className="border-border/50 border-b">
                                <td className="py-2 pr-3 font-mono">{model.resource}</td>
                                <td className="text-syntax-key py-2 pr-3 font-mono">
                                    {model.typeName}
                                </td>
                                <td className="text-muted-foreground py-2 pr-3 font-mono">
                                    {model.queryField}
                                </td>
                                <td className="text-muted-foreground py-2 pr-3 font-mono">
                                    {model.mutations.update}, {model.mutations.patch}
                                </td>
                                <td className="text-muted-foreground py-2 text-right">
                                    {t("kindSingular")}
                                </td>
                            </tr>
                        ))}
                        {schema.resources
                            .filter((resource) => resource.kind === "opaque")
                            .map((resource) => (
                                <tr key={resource.resource} className="border-border/50 border-b">
                                    <td className="py-2 pr-3 font-mono">{resource.resource}</td>
                                    <td className="text-muted-foreground py-2 pr-3 font-mono">
                                        JSON
                                    </td>
                                    <td className="text-muted-foreground py-2 pr-3 font-mono">
                                        {resource.kind === "opaque" ? resource.queryField : ""}
                                    </td>
                                    <td className="text-muted-foreground py-2 pr-3">—</td>
                                    <td className="text-muted-foreground py-2 text-right">
                                        {t("kindOpaque")}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            <section aria-labelledby="relations-heading" className="flex flex-col gap-2">
                <h4
                    id="relations-heading"
                    className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase"
                >
                    {t("relationsHeading")}
                </h4>
                {relations.length === 0 ? (
                    <p className="text-muted-foreground max-w-[68ch] text-xs leading-relaxed">
                        {t("noRelations")}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-1">
                        {relations.map(({ from, relation }) => (
                            <li
                                key={`${from}.${relation.name}`}
                                className="text-muted-foreground font-mono text-xs"
                            >
                                {relation.cardinality === "one"
                                    ? t("relationOne", {
                                          from,
                                          field: relation.name,
                                          to: relation.targetType,
                                      })
                                    : t("relationMany", {
                                          from,
                                          field: relation.name,
                                          to: relation.targetType,
                                      })}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {schema.renamed.length > 0 ? (
                <section
                    aria-labelledby="renamed-heading"
                    className="border-border/70 bg-muted/30 rounded-xl border p-3"
                >
                    <h4
                        id="renamed-heading"
                        className="text-foreground flex items-center gap-1.5 text-xs leading-[1.3] font-semibold"
                    >
                        <IconInfoCircle
                            className="text-muted-foreground size-3.5 shrink-0"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                        {t("renamedHeading")}
                    </h4>
                    <ul className="mt-2 flex flex-col gap-1">
                        {schema.renamed.map((entry) => (
                            <li
                                key={`${entry.resource}-${entry.published}`}
                                className="text-muted-foreground text-xs leading-relaxed"
                            >
                                <code className="font-mono">{entry.resource}</code> →{" "}
                                <code className="text-syntax-key font-mono">{entry.published}</code>{" "}
                                — {tRename(entry.reason)}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {schema.skipped.length > 0 ? (
                <section
                    aria-labelledby="skipped-heading"
                    className="border-brand-amber/45 bg-brand-amber/6 rounded-xl border p-3"
                >
                    <h4
                        id="skipped-heading"
                        className="text-foreground flex items-center gap-1.5 text-xs leading-[1.3] font-semibold"
                    >
                        <IconAlertTriangle
                            className="text-brand-amber size-3.5 shrink-0"
                            stroke={1.9}
                            aria-hidden="true"
                        />
                        {t("skippedHeading")}
                    </h4>
                    <ul className="mt-2 flex flex-col gap-1">
                        {schema.skipped.map((entry) => (
                            <li
                                key={entry.resource}
                                className="text-muted-foreground text-xs leading-relaxed"
                            >
                                <code className="font-mono">{entry.resource}</code> —{" "}
                                {tSkip(entry.reason)}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            <section aria-labelledby="sdl-heading" className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4
                        id="sdl-heading"
                        className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.09em] uppercase"
                    >
                        {t("sdlLabel")}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={copySdl}
                        >
                            <CopyIconSwap copied={copied} />
                            {t("copySdl")}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={downloadSdl}
                        >
                            <IconDownload className="size-3.5" stroke={2} aria-hidden="true" />
                            {t("downloadSdl")}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={downloading}
                            onClick={downloadIntrospection}
                        >
                            <IconDownload className="size-3.5" stroke={2} aria-hidden="true" />
                            {t("downloadIntrospection")}
                        </Button>
                    </div>
                </div>

                <CodeBlock code={sdl} language="graphql" className="max-h-128 overflow-auto" />
            </section>
        </div>
    );
}

/**
 * The standard introspection document, sent to the live endpoint.
 *
 * Written out rather than imported from `graphql`'s `getIntrospectionQuery`,
 * because that import would pull the whole reference implementation into this
 * client island — the same rule that keeps `execute.ts` out of every component.
 * It is a string of GraphQL, and a string costs nothing.
 */
const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { ...FullType }
    directives { name description locations args { ...InputValue } }
  }
}
fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args { ...InputValue }
    type { ...TypeRef }
    isDeprecated
    deprecationReason
  }
  inputFields { ...InputValue }
  interfaces { ...TypeRef }
  enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
  possibleTypes { ...TypeRef }
}
fragment InputValue on __InputValue {
  name
  description
  type { ...TypeRef }
  defaultValue
}
fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
    }
  }
}`;
