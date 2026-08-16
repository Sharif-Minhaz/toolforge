import { describe, expect, test } from "bun:test";

import {
    BACKDROP_TOPICS,
    DEFAULT_BACKDROP_TOPIC,
    resolveSearchTerm,
    TOPIC_QUERIES,
} from "../domain/backdrop-topics";

describe("the topic list", () => {
    test("every topic has a search term", () => {
        for (const topic of BACKDROP_TOPICS) {
            expect(TOPIC_QUERIES[topic].trim().length).toBeGreaterThan(0);
        }
    });

    test("no two topics search for the same thing", () => {
        const terms = BACKDROP_TOPICS.map((topic) => TOPIC_QUERIES[topic]);

        expect(new Set(terms).size).toBe(BACKDROP_TOPICS.length);
    });

    test("every term is several words, which is what biases it away from people", () => {
        // A bare "nature" returns a good deal of *somebody hiking through*
        // nature. The extra nouns do the work a `-people` operator would.
        for (const topic of BACKDROP_TOPICS) {
            expect(TOPIC_QUERIES[topic].split(/\s+/).length).toBeGreaterThanOrEqual(3);
        }
    });

    test("no term mentions a person, which would defeat the point of the list", () => {
        for (const topic of BACKDROP_TOPICS) {
            expect(TOPIC_QUERIES[topic]).not.toMatch(
                /\b(person|people|man|woman|portrait|model)\b/i,
            );
        }
    });

    test("the default is one of the topics", () => {
        expect(BACKDROP_TOPICS).toContain(DEFAULT_BACKDROP_TOPIC);
    });
});

describe("resolveSearchTerm", () => {
    test("what the reader typed wins over the chip", () => {
        expect(resolveSearchTerm("library shelves", "nature")).toBe("library shelves");
    });

    test("an empty query falls back to the chip", () => {
        expect(resolveSearchTerm("", "forest")).toBe(TOPIC_QUERIES.forest);
        expect(resolveSearchTerm("   ", "beach")).toBe(TOPIC_QUERIES.beach);
    });

    test("no chip and no query still searches for somewhere, never for nothing", () => {
        // The one that matters: a caller that omits both must not slip past the
        // people-free bias by falling through to an empty term.
        expect(resolveSearchTerm("", undefined)).toBe(TOPIC_QUERIES[DEFAULT_BACKDROP_TOPIC]);
    });

    test("never returns an empty string, for any combination", () => {
        for (const topic of [...BACKDROP_TOPICS, undefined]) {
            for (const query of ["", "   ", "lake"]) {
                expect(resolveSearchTerm(query, topic).length).toBeGreaterThan(0);
            }
        }
    });

    test("trims, so a trailing space is not a different search", () => {
        expect(resolveSearchTerm("  lake  ", "nature")).toBe("lake");
    });
});
