import { describe, expect, test } from "bun:test";

import {
    findMcpTool,
    findRegistryProblems,
    listMcpToolsOfKind,
} from "@/modules/mcp/domain/registry";
import { MAX_MCP_TOOL_NAME_LENGTH, isValidMcpToolName } from "@/modules/mcp/domain/tool-name";
import { MCP_TOOLS } from "@/modules/mcp/tools";
import { getToolById } from "@/modules/tools/domain/tool-catalog";

/**
 * The invariants that hold across the whole registry.
 *
 * Every one of these is a mistake that type-checks: a duplicated name shadows a
 * tool silently, a hyphen in a name is accepted by our own code and rejected by
 * a client, and a tool whose `toolId` names nothing in the catalogue is a
 * broken link in the guide page's table.
 */

describe("the MCP registry", () => {
    test("has no duplicate, malformed or undescribed tools", () => {
        expect(findRegistryProblems(MCP_TOOLS)).toEqual([]);
    });

    test("exposes every tool under the toolforge prefix", () => {
        for (const tool of MCP_TOOLS) {
            expect(isValidMcpToolName(tool.name)).toBe(true);
            expect(tool.name.length).toBeLessThanOrEqual(MAX_MCP_TOOL_NAME_LENGTH);
        }
    });

    test("points every tool at a real catalogue entry", () => {
        for (const tool of MCP_TOOLS) {
            if (tool.toolId !== "catalog") {
                expect(getToolById(tool.toolId)).toBeDefined();
            }
        }
    });

    test("asks only for arguments it declares", () => {
        for (const tool of MCP_TOOLS) {
            const declared = Object.keys(tool.inputSchema.shape);
            const empty = tool.inputSchema.safeParse({});

            expect(declared.length).toBeGreaterThan(0);

            // An empty call is allowed to fail — most of these need something
            // to work on. What it must never do is complain about a key the
            // published schema does not mention, which is what a client would
            // have no way to satisfy.
            for (const issue of empty.error?.issues ?? []) {
                expect(declared).toContain(String(issue.path[0]));
            }
        }
    });

    test("defaults every optional argument, so a caller can omit it", () => {
        // The counterpart to the assertion above: whatever a tool does not
        // insist on, it must supply itself. A field that is neither required
        // nor defaulted arrives as `undefined` in a handler expecting a value,
        // which is a crash rather than a refusal. The two exceptions declare
        // themselves optional and are read with an explicit `undefined` check.
        const optional = new Set(["toolforge_catalog_list.category"]);
        const undefaulted: string[] = [];

        for (const tool of MCP_TOOLS) {
            const parsed = tool.inputSchema.safeParse({});

            if (!parsed.success) {
                continue;
            }

            for (const [key, value] of Object.entries(parsed.data)) {
                if (value === undefined && !optional.has(`${tool.name}.${key}`)) {
                    undefaulted.push(`${tool.name}.${key}`);
                }
            }
        }

        expect(undefaulted).toEqual([]);
    });

    test("keeps outbound requests to the tools that declare them", () => {
        const networked = listMcpToolsOfKind(MCP_TOOLS, "network").map((tool) => tool.name);

        // Deliberately exact rather than a lower bound. A tool that starts
        // making outbound requests without being declared `network` is exactly
        // the change this assertion exists to stop.
        expect(networked).toEqual(["toolforge_domain_inspector_inspect"]);
    });

    test("finds a tool by name and nothing by a near miss", () => {
        expect(findMcpTool(MCP_TOOLS, "toolforge_uuid_generate")?.toolId).toBe("uuid");
        expect(findMcpTool(MCP_TOOLS, "uuid_generate")).toBeUndefined();
    });
});

describe("findRegistryProblems", () => {
    const sound = MCP_TOOLS[0];

    test("names a duplicate", () => {
        expect(findRegistryProblems([sound, sound])).toEqual([
            `duplicate tool name: ${sound.name}`,
        ]);
    });

    test("names a malformed tool name", () => {
        expect(findRegistryProblems([{ ...sound, name: "toolforge-uuid-generate" }])).toEqual([
            "malformed tool name: toolforge-uuid-generate",
        ]);
    });

    test("names an empty description", () => {
        expect(findRegistryProblems([{ ...sound, description: "  " }])).toEqual([
            `missing description: ${sound.name}`,
        ]);
    });
});
