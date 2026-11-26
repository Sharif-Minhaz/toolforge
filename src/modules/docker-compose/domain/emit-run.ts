import { quoteArgument } from "@/modules/tools/domain/shell-quote";
import {
    LIST_KEYS,
    SCALAR_KEYS,
    SWITCH_KEYS,
    type ConversionNote,
    type ListKey,
    type MountSpec,
    type ServiceSpec,
} from "../types";
import { joinCsv } from "./csv";
import { splitInterpolation } from "./interpolation";
import { flagSpelling } from "./run-flags";

const CONTINUATION = " \\\n  ";

/** Written by hand below, because they name another service. */
const RESOLVED_LISTS: ReadonlySet<ListKey> = new Set(["links", "external_links", "volumes_from"]);

export type EmitRunResult = {
    readonly output: string;
    readonly notes: readonly ConversionNote[];
};

/**
 * A compose value as one shell word. Literal text is single-quoted, so the
 * shell leaves it alone; a variable is left in double quotes, so the shell
 * fills it the way compose would have — the two share `${NAME:-default}`.
 */
export function shellWord(value: string, variables?: Set<string>): string {
    const parts = splitInterpolation(value);

    if (parts.every((part) => part.kind === "text")) {
        return quoteArgument(parts.map((part) => part.text).join(""), "posix");
    }

    return parts
        .map((part) => {
            if (part.kind === "text") {
                return quoteArgument(part.text, "posix");
            }

            variables?.add(part.name);

            return `"${part.source.replace(/["\\`]/g, "\\$&")}"`;
        })
        .join("");
}

function mountCsv(mount: MountSpec): string {
    const fields = [`type=${mount.type}`];

    if (mount.source !== null) {
        fields.push(`source=${mount.source}`);
    }

    fields.push(`target=${mount.target}`);

    if (mount.readOnly) {
        fields.push("readonly");
    }

    for (const [option, value] of mount.options) {
        fields.push(`${option}=${value}`);
    }

    return joinCsv(fields);
}

function serviceCommand(
    service: ServiceSpec,
    containerOf: (key: string) => string,
    variables: Set<string>,
    notes: ConversionNote[],
): string {
    // Detached, the way `docker compose up -d` starts a service, so the next
    // command in the script runs rather than waiting on this one.
    const lines = ["docker run -d"];
    const add = (flag: string, value?: string) => {
        lines.push(value === undefined ? flag : `${flag} ${shellWord(value, variables)}`);
    };
    const has = (key: (typeof SWITCH_KEYS)[number]) => service.switches.includes(key);
    const interactive = has("stdin_open") && has("tty");

    // `--name` even without `container_name`: on a shared network the
    // container's name is what the others resolve, as the service name was.
    add("--name", service.containerName ?? service.key);

    if (interactive) {
        add("-it");
    }

    for (const key of SWITCH_KEYS) {
        if (has(key) && !(interactive && (key === "stdin_open" || key === "tty"))) {
            add(flagSpelling(key));
        }
    }

    for (const key of SCALAR_KEYS) {
        const value = service.scalars[key];

        if (value !== undefined) {
            add(flagSpelling(key), value);
        }
    }

    for (const key of LIST_KEYS) {
        if (!RESOLVED_LISTS.has(key)) {
            for (const value of service.lists[key] ?? []) {
                add(flagSpelling(key), value);
            }
        }
    }

    for (const mount of service.mounts) {
        add("--mount", mountCsv(mount));
    }

    for (const link of service.lists.links ?? []) {
        const [key, alias] = link.split(":");

        add("--link", `${containerOf(key)}:${alias ?? key}`);
    }

    for (const link of service.lists.external_links ?? []) {
        add("--link", link);
    }

    for (const entry of service.lists.volumes_from ?? []) {
        const external = entry.startsWith("container:");
        const [source, mode] = (external ? entry.slice("container:".length) : entry).split(":");
        const container = external ? source : containerOf(source);

        add("--volumes-from", mode === undefined ? container : `${container}:${mode}`);
    }

    if (service.networkMode !== null) {
        const mode = service.networkMode;

        add(
            "--network",
            mode.startsWith("service:")
                ? `container:${containerOf(mode.slice("service:".length))}`
                : mode,
        );
    }

    for (const network of service.networks) {
        const extras = [
            ...network.aliases.map((alias) => `alias=${alias}`),
            ...(network.ipv4 === null ? [] : [`ip=${network.ipv4}`]),
            ...(network.ipv6 === null ? [] : [`ip6=${network.ipv6}`]),
        ];

        add(
            "--network",
            extras.length === 0 ? network.name : joinCsv([`name=${network.name}`, ...extras]),
        );
    }

    const health = service.healthcheck;

    if (health !== null) {
        const [form, ...args] = health.test ?? [];

        if (health.disable || form === "NONE") {
            add("--no-healthcheck");
        } else if (form === "CMD-SHELL") {
            add("--health-cmd", args.join(" "));
        } else if (form !== undefined) {
            // `--health-cmd` always goes through `sh -c`, so the exec form is
            // quoted back into one command line.
            const words = form === "CMD" ? args : [form, ...args];

            add("--health-cmd", words.map((word) => quoteArgument(word, "posix")).join(" "));
            notes.push({ id: "healthcheckShell", kind: "adapted", detail: service.key });
        }

        for (const [flag, value] of [
            ["--health-interval", health.interval],
            ["--health-timeout", health.timeout],
            ["--health-retries", health.retries],
            ["--health-start-period", health.startPeriod],
            ["--health-start-interval", health.startInterval],
        ] as const) {
            if (value !== null) {
                add(flag, value);
            }
        }
    }

    for (const ulimit of service.ulimits) {
        add(
            "--ulimit",
            `${ulimit.name}=${ulimit.soft}${ulimit.hard === null ? "" : `:${ulimit.hard}`}`,
        );
    }

    if (service.logging?.driver) {
        add("--log-driver", service.logging.driver);
    }

    for (const [key, value] of service.logging?.options ?? []) {
        add("--log-opt", `${key}=${value}`);
    }

    if (service.stopTimeout !== null) {
        add("--stop-timeout", service.stopTimeout);
    }

    if (service.gpus !== null) {
        add("--gpus", service.gpus);
    }

    let command = service.command ?? [];

    if (service.entrypoint !== null) {
        const [first, ...rest] = service.entrypoint;

        // `--entrypoint ''` is how docker run clears the image's entrypoint.
        add("--entrypoint", first ?? "");

        if (rest.length > 0) {
            command = [...rest, ...command];
            notes.push({ id: "entrypointSplit", kind: "adapted", detail: service.key });
        }
    }

    lines.push([service.image, ...command].map((word) => shellWord(word, variables)).join(" "));

    return lines.join(CONTINUATION);
}

/** The services as `docker run` commands, one per service, in file order. */
export function emitRunCommands(services: readonly ServiceSpec[]): EmitRunResult {
    const notes: ConversionNote[] = [];
    const variables = new Set<string>();
    const containerOf = (key: string) =>
        services.find((service) => service.key === key)?.containerName ?? key;
    const output = services
        .map((service) => serviceCommand(service, containerOf, variables, notes))
        .join("\n\n");

    if (variables.size > 0) {
        notes.push({ id: "interpolation", kind: "adapted", detail: [...variables].join(", ") });
    }

    return { output, notes };
}
