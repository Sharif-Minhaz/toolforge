import { parseDocument, visit } from "yaml";

import { tokenize } from "@/modules/tools/domain/shell-tokenize";
import {
    LIST_KEYS,
    SCALAR_KEYS,
    SWITCH_KEYS,
    type ConversionNote,
    type HealthcheckSpec,
    type ListKey,
    type LoggingSpec,
    type MountSpec,
    type NetworkAttachment,
    type ScalarKey,
    type ServiceSpec,
    type SpecsResult,
    type SwitchKey,
    type UlimitSpec,
} from "../types";
import { MAX_INPUT_LENGTH, MAX_YAML_ALIASES } from "./constants";
import { MOUNT_OPTIONS } from "./run-flags";
import { namedVolumeSource, renameVolumeSource } from "./volumes";

type Json = Record<string, unknown>;

const LEGACY_OCTAL = /^0[0-7]+$/;

type Context = {
    readonly service: string;
    readonly notes: ConversionNote[];
    readonly networks: Json;
    readonly volumes: Json;
};

/** Keys every service may carry with no runtime meaning, and the top-level keys like them. */
const QUIET_TOP_LEVEL = new Set(["services", "networks", "volumes", "version", "name"]);

const HANDLED = new Set<string>([
    "image",
    "build",
    "container_name",
    "entrypoint",
    "command",
    "network_mode",
    "networks",
    "healthcheck",
    "ulimits",
    "logging",
    "stop_grace_period",
    "gpus",
    ...SCALAR_KEYS,
    ...SWITCH_KEYS,
    ...LIST_KEYS,
]);

function isRecord(value: unknown): value is Json {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
    if (typeof value === "string") {
        return value;
    }

    return typeof value === "number" || typeof value === "boolean" ? String(value) : null;
}

function present(item: string | null): item is string {
    return item !== null;
}

function unreadable(context: Context, key: string): null {
    context.notes.push({
        id: "unreadableValue",
        kind: "dropped",
        detail: `${context.service}.${key}`,
    });

    return null;
}

function skipped(context: Context, key: string): void {
    context.notes.push({
        id: "noRunEquivalent",
        kind: "dropped",
        detail: `${context.service}: ${key}`,
    });
}

/** A string, or a list of them — compose accepts either for most list keys. */
function stringList(value: unknown, context: Context, key: string): string[] | null {
    const items = Array.isArray(value) ? value : [value];
    const out = items.map(text);

    return out.every(present) ? out : unreadable(context, key);
}

/** `list_or_dict`: `["A=1"]` or `{ A: 1 }`, both read as `A=1`; `{ A: null }` is a bare `A`. */
function keyValueList(value: unknown, context: Context, key: string): string[] | null {
    if (!isRecord(value)) {
        return stringList(value, context, key);
    }

    const out: string[] = [];

    for (const [name, entry] of Object.entries(value)) {
        if (entry === null) {
            out.push(name);
            continue;
        }

        const written = text(entry);

        if (written === null) {
            return unreadable(context, key);
        }

        out.push(`${name}=${written}`);
    }

    return out;
}

function portToShort(port: unknown): string | null {
    if (!isRecord(port)) {
        return text(port);
    }

    const target = text(port.target);

    if (target === null) {
        return null;
    }

    const published = text(port.published);
    const hostIp = text(port.host_ip);
    const protocol = text(port.protocol);
    const host = hostIp?.includes(":") ? `[${hostIp}]` : hostIp;
    const mapped =
        host !== null
            ? `${host}:${published ?? ""}:${target}`
            : published !== null
              ? `${published}:${target}`
              : target;

    return protocol !== null && protocol !== "tcp" ? `${mapped}/${protocol}` : mapped;
}

function portList(value: unknown, context: Context): string[] | null {
    if (!Array.isArray(value)) {
        return unreadable(context, "ports");
    }

    const out = value.map(portToShort);

    return out.every(present) ? out : unreadable(context, "ports");
}

function hostList(value: unknown, context: Context): string[] | null {
    if (!isRecord(value)) {
        return stringList(value, context, "extra_hosts");
    }

    const out: string[] = [];

    for (const [host, addresses] of Object.entries(value)) {
        const list = stringList(addresses, context, "extra_hosts");

        if (list === null) {
            return null;
        }

        out.push(...list.map((address) => `${host}:${address}`));
    }

    return out;
}

function deviceList(value: unknown, context: Context): string[] | null {
    const items = Array.isArray(value) ? value : [value];
    const out: string[] = [];

    for (const item of items) {
        const written = isRecord(item)
            ? [text(item.source), text(item.target), text(item.permissions)]
                  .filter((part) => part !== null)
                  .join(":")
            : text(item);

        if (written === null || written.length === 0) {
            return unreadable(context, "devices");
        }

        out.push(written);
    }

    return out;
}

function envFileList(value: unknown, context: Context): string[] | null {
    const items = Array.isArray(value) ? value : [value];
    const out = items.map((item) => (isRecord(item) ? text(item.path) : text(item)));

    return out.every(present) ? out : unreadable(context, "env_file");
}

/**
 * A named volume is the one place compose renames something behind the
 * reader's back: an undeclared-name `pgdata` becomes `<project>_pgdata`, which
 * a bare `docker run -v pgdata:…` will never find.
 */
function resolveVolumeName(source: string, context: Context): string {
    const declared = context.volumes[source];
    const name = isRecord(declared) ? text(declared.name) : null;

    if (name !== null) {
        return name;
    }

    const external =
        isRecord(declared) && declared.external !== undefined && declared.external !== false;

    if (!external) {
        context.notes.push({ id: "projectVolume", kind: "adapted", detail: source });
    }

    return source;
}

function readMount(volume: Json, context: Context): MountSpec | null {
    const type = text(volume.type);
    const target = text(volume.target);

    if (type === null || target === null) {
        return unreadable(context, "volumes");
    }

    const rawSource = text(volume.source);
    const source =
        rawSource !== null && type === "volume" ? resolveVolumeName(rawSource, context) : rawSource;
    const options: [string, string][] = [];

    for (const option of MOUNT_OPTIONS) {
        const group = option.group === null ? volume : volume[option.group];
        const raw = isRecord(group) ? group[option.field] : undefined;
        const value =
            option.kind === "octal" && typeof raw === "number" ? raw.toString(8) : text(raw);

        if (value !== null) {
            options.push([option.option, value]);
        }
    }

    for (const groupName of ["bind", "volume", "tmpfs", "image"] as const) {
        const group = volume[groupName];

        if (!isRecord(group)) {
            continue;
        }

        for (const field of Object.keys(group)) {
            const mapped = MOUNT_OPTIONS.some(
                (option) => option.group === groupName && option.field === field,
            );

            if (!mapped) {
                skipped(context, `volumes.${groupName}.${field}`);
            }
        }
    }

    const readOnly = volume.read_only === true || volume.read_only === "true";

    return { type, source, target, readOnly, options };
}

function readVolumes(value: unknown, context: Context) {
    const volumes: string[] = [];
    const mounts: MountSpec[] = [];

    if (!Array.isArray(value)) {
        unreadable(context, "volumes");

        return { volumes, mounts };
    }

    for (const item of value) {
        if (isRecord(item)) {
            const mount = readMount(item, context);

            if (mount !== null) {
                mounts.push(mount);
            }

            continue;
        }

        const short = text(item);

        if (short === null) {
            unreadable(context, "volumes");
            continue;
        }

        const named = namedVolumeSource(short);
        const resolved = named === null ? null : resolveVolumeName(named, context);

        volumes.push(
            resolved === null || resolved === named ? short : renameVolumeSource(short, resolved),
        );
    }

    return { volumes, mounts };
}

function readList(key: ListKey, value: unknown, context: Context): string[] | null {
    switch (key) {
        case "ports":
            return portList(value, context);
        case "environment":
        case "labels":
        case "annotations":
        case "sysctls":
            return keyValueList(value, context, key);
        case "extra_hosts":
            return hostList(value, context);
        case "devices":
            return deviceList(value, context);
        case "env_file":
            return envFileList(value, context);
        default:
            return stringList(value, context, key);
    }
}

/** A network the service joins, by the name Docker knows it as. */
function readNetworks(value: unknown, context: Context): NetworkAttachment[] {
    if (!Array.isArray(value) && !isRecord(value)) {
        unreadable(context, "networks");

        return [];
    }

    const entries = Array.isArray(value)
        ? value.map((name): [string, unknown] => [String(name), null])
        : Object.entries(value);

    const out: NetworkAttachment[] = [];

    for (const [key, body] of entries) {
        // The project's own network: docker run's default bridge is the nearest thing.
        if (key === "default") {
            continue;
        }

        const declared = context.networks[key];
        const name = (isRecord(declared) ? text(declared.name) : null) ?? key;
        const external =
            isRecord(declared) && declared.external !== undefined && declared.external !== false;

        if (!external) {
            context.notes.push({ id: "createNetwork", kind: "adapted", detail: name });
        }

        const settings = isRecord(body) ? body : {};

        for (const field of Object.keys(settings)) {
            if (!["aliases", "ipv4_address", "ipv6_address"].includes(field)) {
                skipped(context, `networks.${key}.${field}`);
            }
        }

        out.push({
            name,
            aliases:
                settings.aliases === undefined
                    ? []
                    : (stringList(settings.aliases, context, "networks") ?? []),
            ipv4: text(settings.ipv4_address),
            ipv6: text(settings.ipv6_address),
        });
    }

    return out;
}

function readHealthcheck(value: unknown, context: Context): HealthcheckSpec | null {
    if (!isRecord(value)) {
        return unreadable(context, "healthcheck");
    }

    const test =
        typeof value.test === "string"
            ? ["CMD-SHELL", value.test]
            : value.test === undefined
              ? null
              : stringList(value.test, context, "healthcheck.test");

    return {
        test,
        interval: text(value.interval),
        timeout: text(value.timeout),
        retries: text(value.retries),
        startPeriod: text(value.start_period),
        startInterval: text(value.start_interval),
        disable: value.disable === true || value.disable === "true",
    };
}

function readUlimits(value: unknown, context: Context): UlimitSpec[] {
    if (!isRecord(value)) {
        unreadable(context, "ulimits");

        return [];
    }

    const out: UlimitSpec[] = [];

    for (const [name, limit] of Object.entries(value)) {
        const soft = isRecord(limit) ? text(limit.soft) : text(limit);
        const hard = isRecord(limit) ? text(limit.hard) : null;

        if (soft === null) {
            unreadable(context, `ulimits.${name}`);
            continue;
        }

        out.push({ name, soft, hard });
    }

    return out;
}

function readLogging(value: unknown, context: Context): LoggingSpec | null {
    if (!isRecord(value)) {
        return unreadable(context, "logging");
    }

    const options = isRecord(value.options)
        ? Object.entries(value.options).flatMap(([key, option]): [string, string][] => {
              const written = text(option);

              return written === null ? [] : [[key, written]];
          })
        : [];

    return { driver: text(value.driver), options };
}

const DURATION_PART = /(\d+(?:\.\d+)?)(h|ms|m|s|us|µs|ns)/gy;

const UNIT_SECONDS: Record<string, number> = {
    h: 3600,
    m: 60,
    s: 1,
    ms: 1e-3,
    us: 1e-6,
    µs: 1e-6,
    ns: 1e-9,
};

/** A Go duration as whole seconds — the only unit `--stop-timeout` takes. */
function durationSeconds(value: string): string | null {
    if (/^\d+$/.test(value)) {
        return value;
    }

    let seconds = 0;
    let read = 0;

    DURATION_PART.lastIndex = 0;

    for (let match = DURATION_PART.exec(value); match !== null; match = DURATION_PART.exec(value)) {
        seconds += Number(match[1]) * UNIT_SECONDS[match[2]];
        read = DURATION_PART.lastIndex;
    }

    const whole = Math.round(seconds * 1e6) / 1e6;

    return read === value.length && read > 0 && Number.isInteger(whole) ? String(whole) : null;
}

/**
 * Where compose stops reading a command string. Its splitter treats the first
 * unquoted `;`, `&`, `|`, `<`, `>` or word-initial `#` as the end, and drops
 * the rest without a word — so `a && b` runs `a`. Matched, and said out loud.
 */
function commandEnd(value: string): number {
    let quote: string | null = null;

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];

        if (quote !== null) {
            if (char === quote) {
                quote = null;
            } else if (char === "\\" && quote === '"') {
                index += 1;
            }
        } else if (char === "\\") {
            index += 1;
        } else if (char === "'" || char === '"') {
            quote = char;
        } else if (
            ";&|<>".includes(char) ||
            (char === "#" && /^\s?$/.test(value[index - 1] ?? ""))
        ) {
            return index;
        }
    }

    return value.length;
}

/** `command: npm run start` is split the way compose splits it: shell words. */
function commandList(value: unknown, context: Context, key: string): string[] | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "string") {
        const end = commandEnd(value);
        const words = tokenize(value.slice(0, end), "posix");

        if (end < value.length) {
            context.notes.push({
                id: "commandCut",
                kind: "dropped",
                detail: `${context.service}.${key}`,
            });
        }

        return words.ok ? [...words.tokens] : unreadable(context, key);
    }

    return stringList(value, context, key);
}

function readService(key: string, value: Json, context: Context): ServiceSpec | null {
    const image = text(value.image);

    if (image === null) {
        context.notes.push({ id: "noImage", kind: "dropped", detail: key });

        return null;
    }

    if (value.build !== undefined) {
        context.notes.push({ id: "buildIgnored", kind: "adapted", detail: key });
    }

    const scalars: Partial<Record<ScalarKey, string>> = {};
    const lists: Partial<Record<ListKey, readonly string[]>> = {};
    const switches: SwitchKey[] = [];
    let mounts: MountSpec[] = [];

    for (const scalar of SCALAR_KEYS) {
        if (value[scalar] !== undefined) {
            const written = text(value[scalar]);

            if (written === null) {
                unreadable(context, scalar);
            } else {
                scalars[scalar] = written;
            }
        }
    }

    for (const name of SWITCH_KEYS) {
        const flag = value[name];

        if (flag === true || (typeof flag === "string" && /^(true|yes|on)$/i.test(flag))) {
            switches.push(name);
        }
    }

    for (const list of LIST_KEYS) {
        if (value[list] === undefined || value[list] === null) {
            continue;
        }

        if (list === "volumes") {
            const read = readVolumes(value.volumes, context);

            lists.volumes = read.volumes;
            mounts = read.mounts;
            continue;
        }

        const read = readList(list, value[list], context);

        if (read !== null) {
            lists[list] = read;
        }
    }

    for (const field of Object.keys(value)) {
        if (!HANDLED.has(field) && !field.startsWith("x-")) {
            skipped(context, field);
        }
    }

    const stopGrace = text(value.stop_grace_period);
    const stopTimeout = stopGrace === null ? null : durationSeconds(stopGrace);

    if (stopGrace !== null && stopTimeout === null) {
        unreadable(context, "stop_grace_period");
    }

    const gpus = text(value.gpus);

    if (value.gpus !== undefined && gpus !== "all") {
        skipped(context, "gpus");
    }

    return {
        key,
        image,
        containerName: text(value.container_name),
        entrypoint: commandList(value.entrypoint, context, "entrypoint"),
        command: commandList(value.command, context, "command"),
        scalars,
        lists,
        switches,
        mounts,
        networkMode: text(value.network_mode),
        networks: value.networks === undefined ? [] : readNetworks(value.networks, context),
        healthcheck:
            value.healthcheck === undefined ? null : readHealthcheck(value.healthcheck, context),
        ulimits: value.ulimits === undefined ? [] : readUlimits(value.ulimits, context),
        logging: value.logging === undefined ? null : readLogging(value.logging, context),
        stopTimeout,
        gpus: gpus === "all" ? gpus : null,
    };
}

/** Reads a compose file into the containers `docker run` would have to start. */
export function parseComposeFile(input: string): SpecsResult {
    if (input.trim().length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (input.length > MAX_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    // `<<: *defaults` is how compose files share settings, so merge keys are on.
    const doc = parseDocument(input, { merge: true });
    const [error] = doc.errors;

    if (error !== undefined) {
        return { ok: false, reason: "invalid_yaml", line: error.linePos?.[0].line };
    }

    // Compose's reader takes `010` as octal, the YAML 1.1 way; the 1.2 core
    // schema reads ten. Agree with the reader the file was written for.
    visit(doc, {
        Scalar(_key, node) {
            if (typeof node.value === "number" && LEGACY_OCTAL.test(node.source ?? "")) {
                node.value = Number.parseInt(node.source ?? "", 8);
            }
        },
    });

    let root: unknown;

    try {
        root = doc.toJS({ maxAliasCount: MAX_YAML_ALIASES });
    } catch {
        // Only the alias ceiling throws here, and it is a refusal, not a crash.
        return { ok: false, reason: "invalid_yaml" };
    }

    if (!isRecord(root) || !isRecord(root.services) || Object.keys(root.services).length === 0) {
        return { ok: false, reason: "not_compose" };
    }

    const notes: ConversionNote[] = [];
    const networks = isRecord(root.networks) ? root.networks : {};
    const volumes = isRecord(root.volumes) ? root.volumes : {};

    for (const key of Object.keys(root)) {
        if (!QUIET_TOP_LEVEL.has(key) && !key.startsWith("x-")) {
            notes.push({ id: "noRunEquivalent", kind: "dropped", detail: key });
        }
    }

    const services: ServiceSpec[] = [];

    for (const [key, value] of Object.entries(root.services)) {
        const context: Context = { service: key, notes, networks, volumes };

        if (!isRecord(value)) {
            notes.push({ id: "unreadableValue", kind: "dropped", detail: key });
            continue;
        }

        const service = readService(key, value, context);

        if (service !== null) {
            services.push(service);
        }
    }

    if (services.length === 0) {
        return { ok: false, reason: "no_runnable_service" };
    }

    const isolated = services.every(
        (service) => service.networks.length === 0 && service.networkMode === null,
    );

    if (services.length > 1 && isolated) {
        notes.push({ id: "defaultNetwork", kind: "adapted" });
    }

    return { ok: true, services, notes };
}
