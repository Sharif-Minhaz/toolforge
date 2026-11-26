import { Document, Scalar, type Node } from "yaml";

import {
    LIST_KEYS,
    SCALAR_KEYS,
    SWITCH_KEYS,
    type MountSpec,
    type NetworkAttachment,
    type ScalarKey,
    type ServiceSpec,
} from "../types";
import { MOUNT_OPTIONS } from "./run-flags";
import { COMPOSE_KEY, toComposeKey } from "./service-names";
import { namedVolumeSource } from "./volumes";

/** Keys compose takes as a number, written as one so the file reads naturally. */
const NUMERIC_SCALARS: ReadonlySet<ScalarKey> = new Set([
    "cpus",
    "cpu_shares",
    "cpu_period",
    "cpu_quota",
    "cpu_rt_period",
    "cpu_rt_runtime",
    "cpu_count",
    "cpu_percent",
    "pids_limit",
    "oom_score_adj",
    "mem_swappiness",
]);

const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

type YamlValue = string | number | boolean | Node | YamlValue[] | { [key: string]: YamlValue };

function asNumberIfInteger(value: string): string | number {
    return INTEGER.test(value) ? Number(value) : value;
}

/** Ports read as sexagesimal numbers to a YAML 1.1 parser, so they are always quoted. */
function quoted(value: string): Scalar {
    const scalar = new Scalar(value);

    scalar.type = "QUOTE_DOUBLE";

    return scalar;
}

function optionValue(kind: (typeof MOUNT_OPTIONS)[number]["kind"], value: string): YamlValue {
    if (kind === "flag") {
        return !/^(false|0)$/i.test(value);
    }

    if (kind === "octal" && /^[0-7]+$/.test(value)) {
        const mode = new Scalar(Number.parseInt(value, 8));

        mode.format = "OCT";

        return mode;
    }

    return value;
}

function mountToYaml(mount: MountSpec): Record<string, YamlValue> {
    const out: Record<string, YamlValue> = { type: mount.type };

    if (mount.source !== null) {
        out.source = mount.source;
    }

    out.target = mount.target;

    if (mount.readOnly) {
        out.read_only = true;
    }

    for (const [option, value] of mount.options) {
        const known = MOUNT_OPTIONS.find((entry) => entry.option === option);

        if (known === undefined) {
            continue;
        }

        const written = optionValue(known.kind, value);

        if (known.group === null) {
            out[known.field] = written;
        } else {
            const group = (out[known.group] ??= {}) as Record<string, YamlValue>;

            group[known.field] = written;
        }
    }

    return out;
}

/** A key compose accepts for a network or volume, and the real name when the two differ. */
function declaration(name: string, body: Record<string, YamlValue>) {
    const key = COMPOSE_KEY.test(name) ? name : toComposeKey(name, "shared");

    return { key, body: key === name && !("name" in body) ? body : { name, ...body } };
}

function networksToYaml(networks: readonly NetworkAttachment[]): YamlValue {
    const plain = networks.every(
        (network) => network.aliases.length === 0 && network.ipv4 === null && network.ipv6 === null,
    );

    if (plain) {
        return networks.map((network) => declaration(network.name, {}).key);
    }

    return Object.fromEntries(
        networks.map((network) => {
            const body: Record<string, YamlValue> = {};

            if (network.aliases.length > 0) {
                body.aliases = [...network.aliases];
            }

            if (network.ipv4 !== null) {
                body.ipv4_address = network.ipv4;
            }

            if (network.ipv6 !== null) {
                body.ipv6_address = network.ipv6;
            }

            return [declaration(network.name, {}).key, body];
        }),
    );
}

function serviceToYaml(service: ServiceSpec, doc: Document): Record<string, YamlValue> {
    const out: Record<string, YamlValue> = { image: service.image };
    const flow = (items: readonly string[]) => doc.createNode([...items], { flow: true });

    if (service.containerName !== null) {
        out.container_name = service.containerName;
    }

    if (service.entrypoint !== null) {
        out.entrypoint = flow(service.entrypoint);
    }

    if (service.command !== null) {
        out.command = flow(service.command);
    }

    for (const key of SCALAR_KEYS) {
        const value = service.scalars[key];

        if (value !== undefined) {
            const numeric = key === "cpus" ? DECIMAL.test(value) : INTEGER.test(value);

            out[key] = NUMERIC_SCALARS.has(key) && numeric ? Number(value) : value;
        }
    }

    for (const key of SWITCH_KEYS) {
        if (service.switches.includes(key)) {
            out[key] = true;
        }
    }

    for (const key of LIST_KEYS) {
        const values = service.lists[key] ?? [];
        const extra = key === "volumes" ? service.mounts.map(mountToYaml) : [];

        if (values.length + extra.length === 0) {
            continue;
        }

        const written: YamlValue[] =
            key === "ports" || key === "expose" ? values.map(quoted) : [...values];

        out[key] = [...written, ...extra];
    }

    if (service.networkMode !== null) {
        out.network_mode = service.networkMode;
    }

    if (service.networks.length > 0) {
        out.networks = networksToYaml(service.networks);
    }

    if (service.healthcheck !== null) {
        const { test, interval, timeout, retries, startPeriod, startInterval, disable } =
            service.healthcheck;
        const check: Record<string, YamlValue> = {};

        if (disable) {
            check.disable = true;
        }

        if (test !== null) {
            check.test = flow(test);
        }

        for (const [key, value] of [
            ["interval", interval],
            ["timeout", timeout],
            ["start_period", startPeriod],
            ["start_interval", startInterval],
        ] as const) {
            if (value !== null) {
                check[key] = value;
            }
        }

        if (retries !== null) {
            check.retries = asNumberIfInteger(retries);
        }

        out.healthcheck = check;
    }

    if (service.ulimits.length > 0) {
        out.ulimits = Object.fromEntries(
            service.ulimits.map((ulimit) => [
                ulimit.name,
                ulimit.hard === null
                    ? asNumberIfInteger(ulimit.soft)
                    : {
                          soft: asNumberIfInteger(ulimit.soft),
                          hard: asNumberIfInteger(ulimit.hard),
                      },
            ]),
        );
    }

    if (service.logging !== null) {
        const logging: Record<string, YamlValue> = {};

        if (service.logging.driver !== null) {
            logging.driver = service.logging.driver;
        }

        if (service.logging.options.length > 0) {
            logging.options = Object.fromEntries(service.logging.options);
        }

        out.logging = logging;
    }

    if (service.stopTimeout !== null) {
        out.stop_grace_period = `${service.stopTimeout}s`;
    }

    if (service.gpus !== null) {
        out.gpus = service.gpus;
    }

    return out;
}

/**
 * Networks a `docker run` joined already existed — it fails otherwise — so they
 * are declared external rather than left for compose to create under a
 * project-prefixed name. Named volumes keep their exact name for the same
 * reason: `name:` makes compose use the volume the container already had.
 */
function topLevel(services: readonly ServiceSpec[]) {
    const networks: Record<string, YamlValue> = {};
    const volumes: Record<string, YamlValue> = {};

    for (const service of services) {
        for (const network of service.networks) {
            const { key, body } = declaration(network.name, { external: true });

            networks[key] = body;
        }

        const sources = [
            ...(service.lists.volumes ?? []).map(namedVolumeSource),
            ...service.mounts.map((mount) => (mount.type === "volume" ? mount.source : null)),
        ];

        for (const source of sources) {
            if (source !== null && COMPOSE_KEY.test(source)) {
                volumes[source] = { name: source };
            }
        }
    }

    return { networks, volumes };
}

/** The services as a `compose.yaml`. */
export function emitCompose(services: readonly ServiceSpec[]): string {
    const doc = new Document(undefined, { version: "1.1" });
    const { networks, volumes } = topLevel(services);
    const root: Record<string, YamlValue> = {
        services: Object.fromEntries(
            services.map((service) => [service.key, serviceToYaml(service, doc)]),
        ),
    };

    if (Object.keys(networks).length > 0) {
        root.networks = networks;
    }

    if (Object.keys(volumes).length > 0) {
        root.volumes = volumes;
    }

    doc.contents = doc.createNode(root);

    // Version 1.1 for the writer only: it quotes `no`, `on` and `22:22`, which a
    // YAML 1.1 reader would otherwise turn into a boolean and a number.
    return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}
