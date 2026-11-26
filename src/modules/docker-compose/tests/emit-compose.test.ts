import { describe, expect, test } from "bun:test";

import { SAMPLE_RUN } from "@/modules/docker-compose/domain/constants";
import { emitCompose } from "@/modules/docker-compose/domain/emit-compose";
import { parseRunCommands } from "@/modules/docker-compose/domain/parse-run";

function composeOf(input: string): string {
    const result = parseRunCommands(input);

    if (!result.ok) {
        throw new Error(`expected services, got ${result.reason}`);
    }

    return emitCompose(result.services);
}

describe("emitCompose", () => {
    /**
     * Pinned from a run that passed the compose-spec JSON schema and
     * `docker compose config` (Compose v2.40). Re-verify before changing it.
     */
    test("writes the sample as a compose file Docker accepts", () => {
        expect(composeOf(SAMPLE_RUN)).toBe(`services:
  web:
    image: nginx:1.27
    container_name: web
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./site:/usr/share/nginx/html:ro
    environment:
      - NGINX_HOST=example.com
    networks:
      - app
    healthcheck:
      test: [CMD-SHELL, curl -f http://localhost/ || exit 1]
      interval: 30s
  db:
    image: postgres:16
    container_name: db
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=pa$$$$word
    networks:
      - app
networks:
  app:
    external: true
volumes:
  pgdata:
    name: pgdata
`);
    });

    test("quotes what a YAML 1.1 reader would turn into a boolean or a number", () => {
        const yaml = composeOf("docker run --restart no -p 22:22 -e ON=on --label yes nginx");

        expect(yaml).toContain('restart: "no"');
        expect(yaml).toContain('- "22:22"');
        expect(yaml).toContain('- "yes"');
    });

    test("writes numbers where compose takes them, and a file mode as octal", () => {
        const yaml = composeOf(
            "docker run --cpus 1.5 --pids-limit 100 -m 512m --mount type=tmpfs,target=/t,tmpfs-mode=1770 nginx",
        );

        expect(yaml).toContain("cpus: 1.5");
        expect(yaml).toContain("pids_limit: 100");
        expect(yaml).toContain("mem_limit: 512m");
        // `01770` is 1016 to compose's reader — the bits Docker meant by `1770`.
        expect(yaml).toContain("mode: 01770");
    });

    test("keeps a value with a newline or a colon intact", () => {
        const yaml = composeOf(`docker run -e $'NOTE=a\\nb' -e 'URL=http://x: y' nginx`);

        expect(yaml).toContain("- |-\n        NOTE=a\n        b");
        expect(yaml).toContain('- "URL=http://x: y"');
    });

    test("uses list form for networks until one needs settings", () => {
        expect(composeOf("docker run --network a --network b nginx")).toContain(
            "networks:\n      - a\n      - b",
        );
        expect(composeOf("docker run --network a --network-alias x --network b nginx")).toContain(
            "networks:\n      a:\n        aliases:\n          - x\n      b: {}",
        );
    });

    test("declares a name compose would not accept as a key under one it does", () => {
        const yaml = composeOf('docker run --network "${NET}" nginx');

        expect(yaml).toContain("networks:\n  NET:\n    name: ${NET}\n    external: true");
    });
});
