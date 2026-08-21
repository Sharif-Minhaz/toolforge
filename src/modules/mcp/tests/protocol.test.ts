import { beforeAll, describe, expect, test } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { MCP_SERVER_NAME } from "@/modules/mcp/domain/constants";
import { buildMcpServer } from "@/modules/mcp/repository/server";
import { MCP_TOOLS } from "@/modules/mcp/tools";

/**
 * Verified against something that is not us.
 *
 * Everything else in this directory checks our own structures with our own
 * helpers, which cannot catch the failure that matters here: a tool set that is
 * internally consistent and still unreadable by an MCP client. The schemas are
 * Zod, the client wants JSON Schema, and the conversion between them happens
 * inside the SDK — so the only honest check is to drive the server with the
 * SDK's own `Client` over its own transport and read what comes back.
 *
 * That is the same doctrine the JSON Server Studio follows in its parity tests
 * and the Blurhash decoder in its reference test: when somebody else has to
 * read the output, somebody else's implementation has to be the judge.
 */

const client = new Client({ name: "toolforge-tests", version: "0.0.0" });

beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // No bearer token, which is the interesting configuration: it is what a
    // stranger's client arrives as.
    await buildMcpServer(null).connect(serverTransport);
    await client.connect(clientTransport);
});

describe("the handshake", () => {
    test("introduces ToolForge by name, version and icon", () => {
        const info = client.getServerVersion();

        expect(info?.name).toBe(MCP_SERVER_NAME);
        expect(info?.title).toBe("ToolForge");
        expect(info?.version).toMatch(/^\d+\.\d+\.\d+$/);

        // The icon is what a connector list shows beside the name. An absolute
        // URL, because a client resolves it against nothing.
        const icons = info?.icons ?? [];

        expect(icons.length).toBeGreaterThan(0);
        expect(icons[0]?.src).toMatch(/^https?:\/\//);
        expect(icons[0]?.mimeType).toBe("image/png");
    });

    test("advertises the tools capability", () => {
        expect(client.getServerCapabilities()?.tools).toBeDefined();
    });
});

describe("tools/list", () => {
    test("publishes every registered tool, with a schema and a description", async () => {
        const { tools } = await client.listTools();

        expect(tools.length).toBe(MCP_TOOLS.length);

        for (const tool of tools) {
            expect(tool.description ?? "").not.toBe("");
            // The SDK converts our Zod schema into JSON Schema here. A tool
            // whose schema cannot make that trip is unusable by any client.
            expect(tool.inputSchema.type).toBe("object");
        }
    });

    test("names them the way the registry does", async () => {
        const { tools } = await client.listTools();

        expect(tools.map((tool) => tool.name).toSorted()).toEqual(
            MCP_TOOLS.map((tool) => tool.name).toSorted(),
        );
    });
});

describe("tools/call", () => {
    test("generates UUIDs from an argument-free call", async () => {
        const result = await client.callTool({ name: "toolforge_uuid_generate", arguments: {} });
        const structured = result.structuredContent as { uuids: string[] };

        expect(result.isError).toBeFalsy();
        expect(structured.uuids).toHaveLength(1);
        expect(structured.uuids[0]).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });

    test("round-trips text through base64", async () => {
        const encoded = await client.callTool({
            name: "toolforge_base64_convert",
            arguments: { mode: "encode", text: "ToolForge ✅" },
        });
        const encodedOutput = (encoded.structuredContent as { output: string }).output;

        expect(encodedOutput).toBe("VG9vbEZvcmdlIOKchQ==");

        const decoded = await client.callTool({
            name: "toolforge_base64_convert",
            arguments: { mode: "decode", text: encodedOutput },
        });

        expect((decoded.structuredContent as { output: string }).output).toBe("ToolForge ✅");
    });

    test("reports a named refusal as an error rather than as an answer", async () => {
        const result = await client.callTool({
            name: "toolforge_base64_convert",
            arguments: { mode: "decode", text: "not base64!!" },
        });

        expect(result.isError).toBe(true);
        expect((result.structuredContent as { reason: string }).reason).toBe("invalid_character");
    });

    /*
     * The regression that made every tool useless in one client and fine in
     * another.
     *
     * The first version of this test asserted that the text block held the
     * summary — which it did, and which was the bug. A client that reads only
     * `content` (the claude.ai connector does) handed the model `Encoded 20
     * bytes` and no output, so the model did the work itself and reported that
     * the tool had returned nothing useful. Meanwhile Claude Code read
     * `structuredContent` and everything looked correct.
     *
     * So the assertion is now about the requirement rather than about what the
     * code happened to do: whichever field a client reads, it gets the same
     * complete answer.
     */
    test("puts the whole answer in the text block, not a summary of it", async () => {
        const result = await client.callTool({
            name: "toolforge_slug_create",
            arguments: { text: "Héllo, World!" },
        });
        const [block] = result.content as { type: string; text: string }[];

        expect(block?.type).toBe("text");

        const fromText: unknown = JSON.parse(block?.text ?? "");

        expect(fromText).toEqual(result.structuredContent as unknown as object);
        expect((fromText as { slug: string }).slug).toBe("hello-world");
        expect((fromText as { summary: string }).summary).toBe("hello-world");
    });

    test("carries the payload in the text block for every kind of tool", async () => {
        // One generator, one converter, one refusal — the three shapes a client
        // can be handed. A tool whose text block cannot be parsed, or whose
        // parsed form is missing the field the summary talks about, is a tool
        // that will look broken to whoever reads `content`.
        for (const [name, args, field] of [
            ["toolforge_uuid_generate", {}, "uuids"],
            ["toolforge_base64_convert", { text: "hi" }, "output"],
            ["toolforge_password_generate", {}, "password"],
            ["toolforge_qr_generate", { kind: "text", text: "hi" }, "svg"],
        ] as const) {
            const result = await client.callTool({ name, arguments: args });
            const [block] = result.content as { type: string; text: string }[];
            const parsed = JSON.parse(block?.text ?? "") as Record<string, unknown>;

            expect(parsed[field]).toBeDefined();
            expect(parsed).toEqual(result.structuredContent as unknown as Record<string, unknown>);
        }
    });

    test("refuses a networked tool when no token was presented", async () => {
        const result = await client.callTool({
            name: "toolforge_domain_inspector_inspect",
            arguments: { host: "example.com" },
        });

        expect(result.isError).toBe(true);
        expect((result.structuredContent as { reason: string }).reason).toBe("token_missing");
    });

    test("rejects arguments that do not match the schema", async () => {
        const result = await client.callTool({
            name: "toolforge_uuid_generate",
            arguments: { version: 3 },
        });

        expect(result.isError).toBe(true);
    });

    /*
     * The near-miss argument name.
     *
     * A loose Zod object strips a key it does not recognise, so asking the
     * secret generator for `bytes: 64` when the field is `byteLength` returned
     * a 32-byte secret and reported success. A model that guessed the name had
     * no way to tell it had been given half the entropy it asked for.
     */
    test("refuses an unknown argument instead of silently ignoring it", async () => {
        const result = await client.callTool({
            name: "toolforge_uuid_generate",
            arguments: { quantity: 2, quantitiy: 40 },
        });

        expect(result.isError).toBe(true);

        const text = (result.content as { text: string }[])[0]?.text ?? "";

        // The offending key is named, so the next attempt can be correct.
        expect(text).toContain("quantitiy");
    });
});

describe("the PDF converter over the wire", () => {
    /*
     * The end of the longest pipeline on this endpoint, driven through the
     * SDK's own client: Markdown in, a document model, a layout, an embedded
     * font read off disk, and PDF bytes back as base64.
     *
     * Worth doing here rather than only against the domain because two of those
     * steps are environment-specific — reading `public/fonts` and resolving
     * pdfmake's server build — and neither is exercised by a call that stays in
     * one process by accident.
     */
    test("writes a real PDF from Markdown", async () => {
        const result = await client.callTool({
            name: "toolforge_pdf_converter_convert",
            arguments: {
                filename: "notes.md",
                content: "# Release notes\n\nA paragraph, and a `code` span.\n",
            },
        });

        expect(result.isError).toBeFalsy();

        const structured = result.structuredContent as {
            filename: string;
            format: string;
            pdfBase64: string;
            byteLength: number;
        };

        expect(structured.filename).toBe("notes.pdf");
        expect(structured.format).toBe("markdown");
        expect(structured.byteLength).toBeGreaterThan(1_000);
        expect(atob(structured.pdfBase64.slice(0, 8)).startsWith("%PDF-")).toBe(true);
    });

    test("reports the scripts it has no font for rather than shipping empty boxes", async () => {
        const result = await client.callTool({
            name: "toolforge_pdf_converter_convert",
            arguments: { filename: "cjk.md", content: "# 見出し" },
        });

        expect(
            (result.structuredContent as { unsupportedScripts: string[] }).unsupportedScripts,
        ).toEqual(["cjk"]);
    });

    test("refuses an Office package sent as plain text, by name", async () => {
        const result = await client.callTool({
            name: "toolforge_pdf_converter_convert",
            arguments: { filename: "report.docx", content: "not a package" },
        });

        expect(result.isError).toBe(true);
        expect((result.structuredContent as { reason: string }).reason).toBe("binary_required");
    });

    test("refuses a pre-2007 binary with the advice that fixes it", async () => {
        const ole = new Uint8Array(64);

        ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

        const result = await client.callTool({
            name: "toolforge_pdf_converter_convert",
            arguments: {
                filename: "old.docx",
                content: btoa(String.fromCharCode(...ole)),
                encoding: "base64",
            },
        });

        expect(result.isError).toBe(true);
        expect((result.structuredContent as { reason: string }).reason).toBe(
            "legacy_office_format",
        );
    });
});

describe("the published schema", () => {
    test("tells a client that unknown arguments are not accepted", async () => {
        const { tools } = await client.listTools();

        for (const tool of tools) {
            expect(tool.inputSchema.additionalProperties).toBe(false);
        }
    });
});
