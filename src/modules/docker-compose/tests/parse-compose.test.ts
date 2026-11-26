import { describe, expect, test } from "bun:test";

import { parseComposeFile } from "@/modules/docker-compose/domain/parse-compose";
import type { ConversionNote, ServiceSpec } from "@/modules/docker-compose/types";

function read(input: string): {
    services: readonly ServiceSpec[];
    notes: readonly ConversionNote[];
} {
    const result = parseComposeFile(input);

    if (!result.ok) {
        throw new Error(`expected services, got ${result.reason}`);
    }

    return result;
}

function service(body: string, extra = ""): ServiceSpec {
    return read(`services:\n  app:\n    image: x\n${body}\n${extra}`).services[0];
}

describe("parseComposeFile — refusals", () => {
    test("names the empty, the malformed and the not-compose", () => {
        expect(parseComposeFile("")).toEqual({ ok: false, reason: "empty" });
        expect(parseComposeFile("services:\n  a: [1,\n b: 2")).toMatchObject({
            ok: false,
            reason: "invalid_yaml",
            line: 3,
        });
        expect(parseComposeFile("just: a mapping")).toEqual({ ok: false, reason: "not_compose" });
        expect(parseComposeFile("services: {}")).toEqual({ ok: false, reason: "not_compose" });
    });

    test("refuses an alias bomb instead of expanding it", () => {
        const layers = ["a: &a [x, x, x, x, x, x, x, x, x, x]"];

        for (let index = 1; index < 6; index += 1) {
            const prev = String.fromCharCode(96 + index);
            const name = String.fromCharCode(97 + index);

            layers.push(`${name}: &${name} [${Array(10).fill(`*${prev}`).join(", ")}]`);
        }

        expect(parseComposeFile(`${layers.join("\n")}\nservices: {}`)).toEqual({
            ok: false,
            reason: "invalid_yaml",
        });
    });

    test("a service that only builds has nothing to run", () => {
        expect(parseComposeFile("services:\n  app:\n    build: .")).toEqual({
            ok: false,
            reason: "no_runnable_service",
        });

        const { notes } = read(
            "services:\n  app:\n    build: .\n  db:\n    image: x\n    build: .",
        );

        expect(notes).toEqual([
            { id: "noImage", kind: "dropped", detail: "app" },
            { id: "buildIgnored", kind: "adapted", detail: "db" },
        ]);
    });
});

describe("parseComposeFile — reading it the way compose reads it", () => {
    test("follows merge keys", () => {
        const { services } = read(
            "x-base: &base\n  restart: always\nservices:\n  app:\n    <<: *base\n    image: x",
        );

        expect(services[0].scalars.restart).toBe("always");
    });

    test("reads a leading-zero number as octal, as compose's YAML reader does", () => {
        expect(service("    cpu_shares: 010").scalars.cpu_shares).toBe("8");
        expect(
            service(
                "    volumes:\n      - type: tmpfs\n        target: /t\n        tmpfs:\n          mode: 01770",
            ).mounts[0].options,
        ).toEqual([["tmpfs-mode", "1770"]]);
    });

    test("stops a command string where compose stops it, and says so", () => {
        const { services, notes } = read(
            'services:\n  app:\n    image: x\n    command: echo "a && b" && rm -rf /tmp/x',
        );

        expect(services[0].command).toEqual(["echo", "a && b"]);
        expect(notes).toEqual([{ id: "commandCut", kind: "dropped", detail: "app.command" }]);
    });

    test("reads every spelling of the list-or-dict keys", () => {
        const spec = service(
            [
                "    environment:",
                "      A: 1",
                "      B: 'two words'",
                "      C:",
                "    labels: [x=y]",
                "    extra_hosts:",
                "      db: 10.0.0.5",
                "    dns: 1.1.1.1",
                "    env_file:",
                "      - path: ./a.env",
                "        required: false",
                "    devices:",
                "      - source: /dev/sda",
                "        target: /dev/xvda",
                "        permissions: rwm",
            ].join("\n"),
        );

        expect(spec.lists.environment).toEqual(["A=1", "B=two words", "C"]);
        expect(spec.lists.labels).toEqual(["x=y"]);
        expect(spec.lists.extra_hosts).toEqual(["db:10.0.0.5"]);
        expect(spec.lists.dns).toEqual(["1.1.1.1"]);
        expect(spec.lists.env_file).toEqual(["./a.env"]);
        expect(spec.lists.devices).toEqual(["/dev/sda:/dev/xvda:rwm"]);
    });

    test("writes the long port syntax back in the short one docker run takes", () => {
        const spec = service(
            [
                "    ports:",
                "      - target: 80",
                "        published: 8080",
                "        host_ip: 127.0.0.1",
                "      - target: 53",
                "        protocol: udp",
                "      - target: 9000",
                "        published: 9000",
                "        host_ip: '::1'",
            ].join("\n"),
        );

        expect(spec.lists.ports).toEqual(["127.0.0.1:8080:80", "53/udp", "[::1]:9000:9000"]);
    });

    test("reads healthchecks, ulimits, logging and the grace period", () => {
        const spec = service(
            [
                "    healthcheck:",
                "      test: curl -f http://localhost",
                "      retries: 3",
                "    ulimits:",
                "      nproc: 512",
                "      nofile: { soft: 1024, hard: 2048 }",
                "    logging:",
                "      driver: json-file",
                "      options: { max-size: 10m, max-file: 3 }",
                "    stop_grace_period: 1m30s",
            ].join("\n"),
        );

        expect(spec.healthcheck?.test).toEqual(["CMD-SHELL", "curl -f http://localhost"]);
        expect(spec.healthcheck?.retries).toBe("3");
        expect(spec.ulimits).toEqual([
            { name: "nproc", soft: "512", hard: null },
            { name: "nofile", soft: "1024", hard: "2048" },
        ]);
        expect(spec.logging).toEqual({
            driver: "json-file",
            options: [
                ["max-size", "10m"],
                ["max-file", "3"],
            ],
        });
        expect(spec.stopTimeout).toBe("90");
    });

    test("names a grace period docker run cannot hold in whole seconds", () => {
        const { notes } = read("services:\n  app:\n    image: x\n    stop_grace_period: 1500ms");

        expect(notes).toEqual([
            { id: "unreadableValue", kind: "dropped", detail: "app.stop_grace_period" },
        ]);
    });
});

describe("parseComposeFile — what compose would have named differently", () => {
    test("uses a volume's declared name, and warns when compose would prefix it", () => {
        const { services, notes } = read(
            [
                "services:",
                "  app:",
                "    image: x",
                "    volumes:",
                "      - data:/data",
                "      - cache:/cache:ro",
                "      - ./host:/host",
                "volumes:",
                "  data:",
                "    name: real-data",
                "  cache:",
            ].join("\n"),
        );

        expect(services[0].lists.volumes).toEqual([
            "real-data:/data",
            "cache:/cache:ro",
            "./host:/host",
        ]);
        expect(notes).toEqual([{ id: "projectVolume", kind: "adapted", detail: "cache" }]);
    });

    test("joins networks by their real names and says which ones need creating", () => {
        const { services, notes } = read(
            [
                "services:",
                "  app:",
                "    image: x",
                "    networks:",
                "      default:",
                "      front:",
                "        aliases: [web]",
                "      back:",
                "networks:",
                "  front:",
                "    external: true",
                "    name: shared_front",
                "  back:",
            ].join("\n"),
        );

        expect(services[0].networks).toEqual([
            { name: "shared_front", aliases: ["web"], ipv4: null, ipv6: null },
            { name: "back", aliases: [], ipv4: null, ipv6: null },
        ]);
        expect(notes).toEqual([{ id: "createNetwork", kind: "adapted", detail: "back" }]);
    });

    test("warns that services lose name resolution off compose's shared network", () => {
        const { notes } = read("services:\n  a:\n    image: x\n  b:\n    image: y");

        expect(notes).toEqual([{ id: "defaultNetwork", kind: "adapted" }]);
    });

    test("names every key docker run has no flag for, and ignores extensions", () => {
        const { notes } = read(
            [
                "x-meta: 1",
                "secrets:",
                "  s: { file: ./s }",
                "services:",
                "  app:",
                "    image: x",
                "    x-note: hi",
                "    depends_on: [db]",
                "    deploy: { replicas: 2 }",
                "    network_mode: host",
            ].join("\n"),
        );

        expect(notes).toEqual([
            { id: "noRunEquivalent", kind: "dropped", detail: "secrets" },
            { id: "noRunEquivalent", kind: "dropped", detail: "app: depends_on" },
            { id: "noRunEquivalent", kind: "dropped", detail: "app: deploy" },
        ]);
    });
});
