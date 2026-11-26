import { describe, expect, test } from "bun:test";

import { parseRunCommands } from "@/modules/docker-compose/domain/parse-run";
import type { ConversionNote, ServiceSpec } from "@/modules/docker-compose/types";

function read(input: string): {
    services: readonly ServiceSpec[];
    notes: readonly ConversionNote[];
} {
    const result = parseRunCommands(input);

    if (!result.ok) {
        throw new Error(`expected services, got ${result.reason}`);
    }

    return result;
}

function only(input: string): ServiceSpec {
    const { services } = read(input);

    expect(services).toHaveLength(1);

    return services[0];
}

describe("parseRunCommands — the CLI's own grammar", () => {
    test("stops reading flags at the image; everything after it is the command", () => {
        const service = only("docker run -e A=1 alpine:3 sh -c 'echo -e hi' -p 80:80");

        expect(service.image).toBe("alpine:3");
        expect(service.command).toEqual(["sh", "-c", "echo -e hi", "-p", "80:80"]);
        expect(service.lists.environment).toEqual(["A=1"]);
        expect(service.lists.ports).toBeUndefined();
    });

    test("clusters short flags and lets the last one carry its value", () => {
        const service = only("docker run -dit -p8080:80 -e=FOO=bar -dp 9000:9000 nginx");

        expect(service.switches).toEqual(["stdin_open", "tty"]);
        expect(service.lists.ports).toEqual(["8080:80", "9000:9000"]);
        expect(service.lists.environment).toEqual(["FOO=bar"]);
    });

    test("reads `--flag=value` and switches a boolean back off with `=false`", () => {
        const service = only("docker run --name=web --privileged=false --init=true nginx");

        expect(service.containerName).toBe("web");
        expect(service.switches).toEqual(["init"]);
    });

    test("knows the arity of flags it has no compose key for", () => {
        // `--cidfile` takes a value; reading it as a switch would make the image `/tmp/id`.
        const { services, notes } = read("docker run --cidfile /tmp/id -P --sig-proxy=false nginx");

        expect(services[0].image).toBe("nginx");
        expect(notes).toEqual([
            { id: "noComposeEquivalent", kind: "dropped", detail: "--cidfile" },
            { id: "noComposeEquivalent", kind: "dropped", detail: "-P" },
        ]);
    });

    test("names an unknown flag rather than guessing at it", () => {
        const { notes } = read("docker run --made-up nginx");

        expect(notes).toEqual([{ id: "unknownFlag", kind: "dropped", detail: "--made-up" }]);
    });

    test("names -d and --rm, which compose has no key for", () => {
        const { notes } = read("docker run -d --rm nginx");

        expect(notes.map((note) => note.id)).toEqual(["detach", "autoRemove"]);
    });

    test("refuses a flag left without its value, and a command without an image", () => {
        expect(parseRunCommands("docker run nginx --name")).toMatchObject({ ok: true });
        expect(parseRunCommands("docker run --name")).toEqual({
            ok: false,
            reason: "missing_value",
            token: "--name",
        });
        expect(parseRunCommands("docker run -d")).toEqual({ ok: false, reason: "missing_image" });
    });

    test("names the empty, the oversized and the unbalanced", () => {
        expect(parseRunCommands("  ")).toEqual({ ok: false, reason: "empty" });
        expect(parseRunCommands(`docker run ${"x".repeat(100_001)}`)).toEqual({
            ok: false,
            reason: "too_long",
        });
        expect(parseRunCommands("docker run -e 'A=1 nginx")).toEqual({
            ok: false,
            reason: "unbalanced_quote",
        });
    });
});

describe("parseRunCommands — several commands", () => {
    test("splits at line breaks and unquoted separators, never inside quotes", () => {
        const { services, notes } = read(
            "docker network create app && docker run --name a nginx\n" +
                "docker run --name b redis sh -c 'x && y'",
        );

        expect(services.map((service) => service.key)).toEqual(["a", "b"]);
        expect(services[1].command).toEqual(["sh", "-c", "x && y"]);
        expect(notes).toEqual([
            { id: "notDockerRun", kind: "dropped", detail: "docker network create" },
        ]);
    });

    test("accepts sudo, podman, `docker container run` and `docker create`", () => {
        const { services } = read(
            [
                "sudo docker run nginx",
                "podman run redis",
                "docker container run postgres",
                "/usr/bin/docker create alpine",
            ].join("\n"),
        );

        expect(services.map((service) => service.image)).toEqual([
            "nginx",
            "redis",
            "postgres",
            "alpine",
        ]);
    });

    test("refuses input with no docker run in it at all", () => {
        expect(parseRunCommands("echo hello")).toEqual({ ok: false, reason: "no_run_command" });
    });

    test("keys services by container name, else by image, never twice", () => {
        const { services } = read(
            "docker run ghcr.io/acme/api:1.4@sha256:abc\ndocker run nginx\ndocker run nginx:1.27\ndocker run --name Web_1 nginx",
        );

        expect(services.map((service) => service.key)).toEqual([
            "api",
            "nginx",
            "nginx-2",
            "Web_1",
        ]);
    });
});

describe("parseRunCommands — dollars, by where they stood", () => {
    test("a single-quoted dollar is literal, a double-quoted variable stays a variable", () => {
        const service = only(
            `docker run -e 'PASS=pa$word' -e HOME_DIR="$HOME/x" -e TAG=\${TAG:-latest} -e PID=$$ nginx`,
        );

        expect(service.lists.environment).toEqual([
            "PASS=pa$$word",
            "HOME_DIR=$HOME/x",
            "TAG=${TAG:-latest}",
            "PID=$$$$",
        ]);
    });

    test("$(pwd) becomes ${PWD}; any other substitution is named and kept literal", () => {
        const { services, notes } = read('docker run -v "$(pwd)":/app -e NOW=`date` alpine');

        expect(services[0].lists.volumes).toEqual(["${PWD}:/app"]);
        expect(services[0].lists.environment).toEqual(["NOW=`date`"]);
        expect(notes).toEqual([
            { id: "pwdVariable", kind: "adapted", detail: "$(pwd)" },
            { id: "commandSubstitution", kind: "dropped", detail: "`date`" },
        ]);
    });
});

describe("parseRunCommands — flags with more than one key", () => {
    test("reads the mount, the healthcheck, the ulimits and the logging", () => {
        const service = only(
            [
                "docker run",
                "--mount type=bind,src=/etc/app,dst=/etc/app,ro,bind-propagation=rshared",
                "--mount 'type=volume,source=data,target=/d,volume-driver=local'",
                "--health-cmd 'curl -f http://localhost/' --health-retries 3 --no-healthcheck",
                "--ulimit nofile=1024:2048 --ulimit nproc=512",
                "--log-driver json-file --log-opt max-size=10m",
                "--stop-timeout 20 --gpus all --entrypoint ''",
                "nginx",
            ].join(" "),
        );

        expect(service.mounts).toEqual([
            {
                type: "bind",
                source: "/etc/app",
                target: "/etc/app",
                readOnly: true,
                options: [["bind-propagation", "rshared"]],
            },
            { type: "volume", source: "data", target: "/d", readOnly: false, options: [] },
        ]);
        expect(service.healthcheck).toEqual({
            test: ["CMD-SHELL", "curl -f http://localhost/"],
            interval: null,
            timeout: null,
            retries: "3",
            startPeriod: null,
            startInterval: null,
            disable: true,
        });
        expect(service.ulimits).toEqual([
            { name: "nofile", soft: "1024", hard: "2048" },
            { name: "nproc", soft: "512", hard: null },
        ]);
        expect(service.logging).toEqual({ driver: "json-file", options: [["max-size", "10m"]] });
        expect(service.stopTimeout).toBe("20");
        expect(service.gpus).toBe("all");
        expect(service.entrypoint).toEqual([]);
    });

    test("tells a network mode from a network, and gives aliases to the network beside them", () => {
        const { services, notes } = read(
            "docker run --network host nginx\n" +
                "docker run --network app --network-alias web --ip 10.0.0.2 nginx\n" +
                "docker run --network name=front,alias=f,ip6=::2 nginx\n" +
                "docker run --network-alias lonely nginx",
        );

        expect(services[0].networkMode).toBe("host");
        expect(services[1].networks).toEqual([
            { name: "app", aliases: ["web"], ipv4: "10.0.0.2", ipv6: null },
        ]);
        expect(services[2].networks).toEqual([
            { name: "front", aliases: ["f"], ipv4: null, ipv6: "::2" },
        ]);
        expect(notes).toContainEqual({
            id: "noComposeEquivalent",
            kind: "dropped",
            detail: "--network-alias",
        });
        expect(notes).toContainEqual({ id: "externalNetwork", kind: "adapted", detail: "app" });
    });

    test("names a container from the same paste as its service, anything else as a container", () => {
        const { services } = read(
            [
                "docker run --name api nginx",
                "docker run --network container:api --link api:backend --link other --volumes-from api:ro busybox",
                "docker run --volumes-from elsewhere busybox",
            ].join("\n"),
        );

        expect(services[1].networkMode).toBe("service:api");
        expect(services[1].lists.links).toEqual(["api:backend"]);
        expect(services[1].lists.external_links).toEqual(["other"]);
        expect(services[1].lists.volumes_from).toEqual(["api:ro"]);
        expect(services[2].lists.volumes_from).toEqual(["container:elsewhere"]);
    });
});

describe("parseRunCommands — Windows shells", () => {
    test("reads PowerShell's backtick and cmd's caret continuations", () => {
        for (const input of [
            'docker run `\n  -e "GREETING=hello world" `\n  nginx',
            'docker run ^\n  -e "GREETING=hello world" ^\n  nginx',
        ]) {
            expect(only(input).lists.environment).toEqual(["GREETING=hello world"]);
        }
    });

    test("treats a dollar as literal outside POSIX, where no shell expanded it", () => {
        expect(only('docker run `\n -e "A=$x" nginx').lists.environment).toEqual(["A=$$x"]);
    });
});
