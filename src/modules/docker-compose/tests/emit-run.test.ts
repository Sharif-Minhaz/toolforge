import { describe, expect, test } from "bun:test";

import { SAMPLE_COMPOSE } from "@/modules/docker-compose/domain/constants";
import { emitRunCommands, shellWord } from "@/modules/docker-compose/domain/emit-run";
import { parseComposeFile } from "@/modules/docker-compose/domain/parse-compose";
import { flagSpelling } from "@/modules/docker-compose/domain/run-flags";
import { LIST_KEYS, SCALAR_KEYS, SWITCH_KEYS } from "@/modules/docker-compose/types";

function runOf(yaml: string) {
    const result = parseComposeFile(yaml);

    if (!result.ok) {
        throw new Error(`expected services, got ${result.reason}`);
    }

    return emitRunCommands(result.services);
}

describe("shellWord", () => {
    test("single-quotes literal text and resolves compose's `$$`", () => {
        expect(shellWord("nginx:1.27")).toBe("nginx:1.27");
        expect(shellWord("two words")).toBe("'two words'");
        expect(shellWord("pa$$word")).toBe("'pa$word'");
        expect(shellWord("it's")).toBe("'it'\\''s'");
        expect(shellWord("")).toBe("''");
    });

    test("leaves a variable in double quotes, for the shell to fill as compose would", () => {
        const variables = new Set<string>();

        expect(shellWord("nginx:${TAG:-1.27}", variables)).toBe('nginx:"${TAG:-1.27}"');
        expect(shellWord("$HOME/a b", variables)).toBe("\"$HOME\"'/a b'");
        expect([...variables]).toEqual(["TAG", "HOME"]);
    });
});

describe("emitRunCommands", () => {
    /**
     * Pinned from a run whose words `/bin/sh` split exactly as this repo's
     * tokenizer reads them. Re-verify before changing it.
     */
    test("writes the sample as one detached command per service", () => {
        const { output, notes } = runOf(SAMPLE_COMPOSE);

        expect(output).toBe(`docker run -d \\
  --name web \\
  --restart unless-stopped \\
  -p 8080:80 \\
  -v ./site:/usr/share/nginx/html:ro \\
  -e NGINX_HOST=example.com \\
  nginx:1.27

docker run -d \\
  --name db \\
  -v pgdata:/var/lib/postgresql/data \\
  -e 'POSTGRES_PASSWORD=pa$$word' \\
  --health-cmd 'pg_isready -U postgres' \\
  --health-interval 10s \\
  postgres:"\${POSTGRES_TAG:-16}"`);
        expect(notes).toEqual([
            { id: "healthcheckShell", kind: "adapted", detail: "db" },
            { id: "interpolation", kind: "adapted", detail: "POSTGRES_TAG" },
        ]);
    });

    test("resolves another service to its container, and combines -i -t", () => {
        const { output } = runOf(
            [
                "services:",
                "  api:",
                "    image: x",
                "    container_name: acme-api",
                "    stdin_open: true",
                "    tty: true",
                "  worker:",
                "    image: x",
                "    network_mode: service:api",
                "    links: [api]",
                "    volumes_from: ['api:ro', 'container:other']",
            ].join("\n"),
        );

        expect(output).toContain("--name acme-api \\\n  -it \\\n");
        expect(output).toContain("--link acme-api:api");
        expect(output).toContain("--volumes-from acme-api:ro");
        expect(output).toContain("--volumes-from other");
        expect(output).toContain("--network container:acme-api");
    });

    test("moves entrypoint words past the first onto the command", () => {
        const { output, notes } = runOf(
            "services:\n  a:\n    image: x\n    entrypoint: [/bin/sh, -c]\n    command: [echo hi]",
        );

        expect(output).toEndWith("--entrypoint /bin/sh \\\n  x -c 'echo hi'");
        expect(notes).toEqual([{ id: "entrypointSplit", kind: "adapted", detail: "a" }]);
    });

    test("clears the entrypoint with an empty one", () => {
        expect(runOf("services:\n  a:\n    image: x\n    entrypoint: []").output).toContain(
            "--entrypoint ''",
        );
    });

    test("writes a mount back as the CSV `--mount` reads", () => {
        const { output } = runOf(
            [
                "services:",
                "  a:",
                "    image: x",
                "    volumes:",
                "      - type: bind",
                "        source: /a,b",
                "        target: /c",
                "        read_only: true",
                "        bind: { propagation: rshared }",
            ].join("\n"),
        );

        expect(output).toContain(
            `--mount 'type=bind,"source=/a,b",target=/c,readonly,bind-propagation=rshared'`,
        );
    });

    test("has a flag for every compose key the table maps", () => {
        for (const key of [...SCALAR_KEYS, ...SWITCH_KEYS]) {
            expect(flagSpelling(key)).toStartWith("-");
        }

        for (const key of LIST_KEYS) {
            if (!["links", "external_links", "volumes_from"].includes(key)) {
                expect(flagSpelling(key)).toStartWith("-");
            }
        }
    });
});
