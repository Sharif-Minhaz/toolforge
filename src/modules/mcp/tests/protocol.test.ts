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

    test("puts the summary in the text content a client shows", async () => {
        const result = await client.callTool({
            name: "toolforge_slug_create",
            arguments: { text: "Héllo, World!" },
        });
        const [block] = result.content as { type: string; text: string }[];

        expect(block?.type).toBe("text");
        expect(block?.text).toBe("hello-world");
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
});
