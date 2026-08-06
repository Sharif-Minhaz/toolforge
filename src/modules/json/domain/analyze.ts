import type { JsonNode } from "../../tools/types/json-tree";
import type { JsonStats } from "../types";

type Tally = {
    objects: number;
    arrays: number;
    keys: number;
    strings: number;
    numbers: number;
    booleans: number;
    nulls: number;
    depth: number;
};

function walk(node: JsonNode, level: number, tally: Tally): void {
    switch (node.kind) {
        case "object":
            tally.objects += 1;
            tally.keys += node.members.length;
            tally.depth = Math.max(tally.depth, level + 1);

            for (const member of node.members) {
                walk(member.value, level + 1, tally);
            }

            return;
        case "array":
            tally.arrays += 1;
            tally.depth = Math.max(tally.depth, level + 1);

            for (const item of node.items) {
                walk(item, level + 1, tally);
            }

            return;
        case "string":
            tally.strings += 1;

            return;
        case "number":
            tally.numbers += 1;

            return;
        case "boolean":
            tally.booleans += 1;

            return;
        case "null":
            tally.nulls += 1;
    }
}

/**
 * Counts what a document is made of. `depth` is container nesting, so a bare
 * string or number is 0 and `{"a": {}}` is 2.
 */
export function analyzeJson(root: JsonNode): JsonStats {
    const tally: Tally = {
        objects: 0,
        arrays: 0,
        keys: 0,
        strings: 0,
        numbers: 0,
        booleans: 0,
        nulls: 0,
        depth: 0,
    };

    walk(root, 0, tally);

    return tally;
}
