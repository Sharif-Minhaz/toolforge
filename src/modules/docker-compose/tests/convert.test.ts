import { describe, expect, test } from "bun:test";

import { SAMPLE_COMPOSE, SAMPLE_RUN } from "@/modules/docker-compose/domain/constants";
import { convert } from "@/modules/docker-compose/domain/convert";
import { splitCsv, joinCsv } from "@/modules/docker-compose/domain/csv";
import { createDockerComposeExportFile } from "@/modules/docker-compose/domain/export";
import type { ServiceSpec } from "@/modules/docker-compose/types";

function servicesOf(direction: "runToCompose" | "composeToRun", input: string) {
    const result = convert(direction, input);

    if (!result.ok) {
        throw new Error(`expected a conversion, got ${result.reason}`);
    }

    return result;
}

/**
 * The invariant is the service, not the text: `-e` and `--env` say the same
 * thing. Every flag the table maps is in here at least once.
 */
const COMMANDS = [
    SAMPLE_RUN,
    `docker run -dit --name api --hostname api.local --domainname example.org -u 1000:1000 -w /srv \\
  --restart on-failure:3 --platform linux/amd64 --pull always \\
  -m 512m --memory-reservation 256m --memory-swap 1g --memory-swappiness 10 --shm-size 64m \\
  --cpus 1.5 -c 512 --cpuset-cpus 0-1 --pids-limit 200 --oom-score-adj 100 --oom-kill-disable \\
  --stop-signal SIGINT --stop-timeout 20 --pid host --ipc shareable --uts host --userns host \\
  --cgroupns private --init --read-only --privileged --use-api-socket --umask 0022 \\
  -p 80:80 -p 127.0.0.1:8443:443/tcp -p 53:53/udp --expose 3000 \\
  -v /data:/data:rw -v cache:/cache -v /anon --tmpfs /run:rw,size=64m \\
  --mount type=bind,source=/etc/app,target=/etc/app,readonly,bind-propagation=rshared \\
  --mount type=volume,src=models,dst=/models,volume-nocopy \\
  --mount type=tmpfs,target=/scratch,tmpfs-size=1048576,tmpfs-mode=1770 \\
  -e A=1 -e 'B=two words' -e PASSTHRU --env-file ./app.env --label-file ./labels \\
  -l com.example.team=core --annotation org.opencontainers.x=y \\
  --cap-add NET_ADMIN --cap-drop ALL --device /dev/fuse --device-cgroup-rule 'c 1:3 mr' \\
  --add-host db.internal:10.0.0.5 --dns 1.1.1.1 --dns-search example.org --dns-option ndots:2 \\
  --security-opt no-new-privileges:true --sysctl net.core.somaxconn=1024 --group-add audio \\
  --cgroup-parent /docker --isolation default --runtime runc --mac-address 92:d0:c6:0a:29:33 \\
  --cpu-period 100000 --cpu-quota 50000 --cpu-rt-period 1000 --cpu-rt-runtime 950 \\
  --cpu-count 2 --cpu-percent 50 \\
  --network backend --network-alias api-alias --ip 172.20.0.10 \\
  --health-cmd 'wget -qO- http://localhost:3000/health || exit 1' --health-interval 15s \\
  --health-timeout 3s --health-retries 4 --health-start-period 30s --health-start-interval 2s \\
  --ulimit nofile=1024:2048 --ulimit nproc=512 \\
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \\
  --gpus all --entrypoint /docker-entrypoint.sh \\
  ghcr.io/acme/api:1.4 serve --port 3000 'arg with spaces' "it's"`,
    `docker run --name dollars -e 'LITERAL=pa$word' -e EXPANDED="$HOME/x" -v "$(pwd)":/app alpine sh -c 'echo $HOME'`,
    "docker run --name api nginx\ndocker run --network container:api --volumes-from api:ro --link api:backend --link ext busybox",
    "docker run --entrypoint '' --no-healthcheck redis:7 redis-server --save ''",
    "docker run --network name=front,alias=web,ip=10.1.0.4 --network back --net host nginx",
];

describe("round trip at the model", () => {
    test.each(COMMANDS.map((command, index) => [index, command]))(
        "command %i reads back the same from its compose file",
        (_index, command) => {
            const there = servicesOf("runToCompose", command);
            const back = servicesOf("composeToRun", there.output);

            expect(back.services).toEqual(there.services);
        },
    );

    test("a compose file survives the trip through docker run", () => {
        const withoutName = (service: ServiceSpec) => ({ ...service, containerName: null });
        const there = servicesOf("composeToRun", SAMPLE_COMPOSE);
        const back = servicesOf("runToCompose", there.output);
        const original = servicesOf("composeToRun", SAMPLE_COMPOSE).services.map(withoutName);

        // The exec-form healthcheck is the one declared change (`healthcheckShell`).
        expect(back.services.map(withoutName)).toEqual(
            original.map((service) =>
                service.healthcheck === null
                    ? service
                    : {
                          ...service,
                          healthcheck: {
                              ...service.healthcheck,
                              test: ["CMD-SHELL", "pg_isready -U postgres"],
                          },
                      },
            ),
        );
    });
});

describe("convert", () => {
    test("passes a refusal through unchanged", () => {
        expect(convert("runToCompose", "")).toEqual({ ok: false, reason: "empty" });
        expect(convert("composeToRun", "services: [")).toMatchObject({ reason: "invalid_yaml" });
    });

    test("lists a repeated note once", () => {
        const { notes } = servicesOf("runToCompose", "docker run --rm a\ndocker run --rm b");

        expect(notes).toEqual([{ id: "autoRemove", kind: "dropped", detail: "--rm" }]);
    });
});

describe("csv", () => {
    test("quotes a field holding a comma or a quote, and reads it back", () => {
        const fields = ["type=bind", "source=/a,b", 'target=/say "hi"'];
        const joined = joinCsv(fields);

        expect(joined).toBe('type=bind,"source=/a,b","target=/say ""hi"""');
        expect(splitCsv(joined)).toEqual(fields);
    });
});

describe("createDockerComposeExportFile", () => {
    test("names the file the way compose finds it, and makes the script a script", () => {
        expect(createDockerComposeExportFile("runToCompose", "services: {}\n")).toEqual({
            filename: "compose.yaml",
            mimeType: "application/yaml;charset=utf-8",
            content: "services: {}\n",
        });
        expect(createDockerComposeExportFile("composeToRun", "docker run x")).toEqual({
            filename: "docker-run.sh",
            mimeType: "text/x-shellscript;charset=utf-8",
            content: "#!/bin/sh\ndocker run x\n",
        });
    });
});
