import {
    detectShellDialect,
    stripPrompt,
    tokenizeCommands,
    wordText,
    type ShellWord,
} from "@/modules/tools/domain/shell-tokenize";
import {
    SWITCH_KEYS,
    type ConversionNote,
    type DockerComposeFailure,
    type HealthcheckSpec,
    type ListKey,
    type MountSpec,
    type NetworkAttachment,
    type ScalarKey,
    type ServiceSpec,
    type SpecsResult,
    type SwitchKey,
    type UlimitSpec,
} from "../types";
import { MAX_INPUT_LENGTH } from "./constants";
import { wordToCompose } from "./interpolation";
import {
    MOUNT_OPTIONS,
    NETWORK_MODES,
    findLongFlag,
    findShortFlag,
    type RunFlag,
} from "./run-flags";
import { splitCsv } from "./csv";
import { assignServiceKeys } from "./service-names";

/** Words that end one command and start the next on the same line. */
const SEPARATORS = new Set(["&&", "||", ";", "|", "&"]);

const EXECUTABLES = new Set(["docker", "podman"]);

/** The service as it is being read — the same shape, still open for writing. */
type Draft = {
    containerName: string | null;
    entrypoint: string[] | null;
    scalars: Partial<Record<ScalarKey, string>>;
    lists: Partial<Record<ListKey, string[]>>;
    switches: SwitchKey[];
    mounts: MountSpec[];
    networkMode: string | null;
    networks: NetworkAttachment[];
    aliases: string[];
    ipv4: string | null;
    ipv6: string | null;
    health: { -readonly [K in keyof HealthcheckSpec]: HealthcheckSpec[K] } | null;
    ulimits: UlimitSpec[];
    logDriver: string | null;
    logOptions: [string, string][];
    stopTimeout: string | null;
    gpus: string | null;
    links: string[];
    volumesFrom: string[];
};

function emptyDraft(): Draft {
    return {
        containerName: null,
        entrypoint: null,
        scalars: {},
        lists: {},
        switches: [],
        mounts: [],
        networkMode: null,
        networks: [],
        aliases: [],
        ipv4: null,
        ipv6: null,
        health: null,
        ulimits: [],
        logDriver: null,
        logOptions: [],
        stopTimeout: null,
        gpus: null,
        links: [],
        volumesFrom: [],
    };
}

function pushUnique(target: string[], value: string): void {
    if (!target.includes(value)) {
        target.push(value);
    }
}

function splitCommands(commands: readonly (readonly ShellWord[])[]): ShellWord[][] {
    const out: ShellWord[][] = [];

    for (const command of commands) {
        let current: ShellWord[] = [];

        for (const word of command) {
            // Only an unquoted `&&` separates; `'&&'` is an argument.
            const separator =
                word.length === 1 && word[0].expandable && SEPARATORS.has(word[0].text);

            if (separator) {
                out.push(current);
                current = [];
            } else {
                current.push(word);
            }
        }

        out.push(current);
    }

    return out.filter((command) => command.length > 0);
}

/** The arguments after `docker run`, or null when the command is something else. */
function runArguments(command: readonly ShellWord[]): readonly ShellWord[] | null {
    const words = command.map(wordText);
    let index = words[0] === "sudo" ? 1 : 0;
    const executable =
        (words[index] ?? "")
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.exe$/i, "") ?? "";

    if (!EXECUTABLES.has(executable)) {
        return null;
    }

    index += 1;

    if (words[index] === "container") {
        index += 1;
    }

    return words[index] === "run" || words[index] === "create" ? command.slice(index + 1) : null;
}

/** A word from `start` onwards, keeping how each part was quoted. */
function sliceWord(word: ShellWord, start: number): ShellWord {
    const out: { text: string; expandable: boolean }[] = [];
    let offset = 0;

    for (const segment of word) {
        const end = offset + segment.text.length;

        if (end > start) {
            out.push({
                text: segment.text.slice(Math.max(0, start - offset)),
                expandable: segment.expandable,
            });
        }

        offset = end;
    }

    return out;
}

function parseMount(value: string, notes: ConversionNote[]): MountSpec | null {
    let type = "volume";
    let source: string | null = null;
    let target: string | null = null;
    let readOnly = false;
    const options: [string, string][] = [];

    for (const field of splitCsv(value)) {
        const eq = field.indexOf("=");
        const key = (eq === -1 ? field : field.slice(0, eq)).trim().toLowerCase();
        const fieldValue = eq === -1 ? "" : field.slice(eq + 1);

        if (key === "type") {
            type = fieldValue;
        } else if (key === "source" || key === "src") {
            source = fieldValue;
        } else if (key === "target" || key === "destination" || key === "dst") {
            target = fieldValue;
        } else if (key === "readonly" || key === "ro") {
            readOnly = eq === -1 || /^(true|1)$/i.test(fieldValue);
        } else if (MOUNT_OPTIONS.some((option) => option.option === key)) {
            options.push([key, eq === -1 ? "true" : fieldValue]);
        } else {
            notes.push({ id: "noComposeEquivalent", kind: "dropped", detail: `--mount ${key}` });
        }
    }

    if (target === null) {
        notes.push({ id: "unreadableValue", kind: "dropped", detail: `--mount ${value}` });

        return null;
    }

    const rank = (key: string) => MOUNT_OPTIONS.findIndex((option) => option.option === key);

    return {
        type,
        source,
        target,
        readOnly,
        options: options.sort((a, b) => rank(a[0]) - rank(b[0])),
    };
}

function parseNetwork(draft: Draft, value: string, notes: ConversionNote[]): void {
    if (!value.includes("=")) {
        if (NETWORK_MODES.has(value) || value.startsWith("container:")) {
            draft.networkMode = value === "default" ? "bridge" : value;
        } else {
            draft.networks.push({ name: value, aliases: [], ipv4: null, ipv6: null });
        }

        return;
    }

    // The long form, `name=app,alias=web,ip=10.0.0.5` (Docker 25 and later).
    let name: string | null = null;
    const aliases: string[] = [];
    let ipv4: string | null = null;
    let ipv6: string | null = null;

    for (const field of splitCsv(value)) {
        const eq = field.indexOf("=");
        const key = field.slice(0, eq);
        const fieldValue = field.slice(eq + 1);

        if (key === "name") {
            name = fieldValue;
        } else if (key === "alias") {
            aliases.push(fieldValue);
        } else if (key === "ip") {
            ipv4 = fieldValue;
        } else if (key === "ip6") {
            ipv6 = fieldValue;
        } else {
            notes.push({ id: "noComposeEquivalent", kind: "dropped", detail: `--network ${key}` });
        }
    }

    if (name === null) {
        notes.push({ id: "unreadableValue", kind: "dropped", detail: `--network ${value}` });

        return;
    }

    draft.networks.push({ name, aliases, ipv4, ipv6 });
}

function health(draft: Draft): NonNullable<Draft["health"]> {
    draft.health ??= {
        test: null,
        interval: null,
        timeout: null,
        retries: null,
        startPeriod: null,
        startInterval: null,
        disable: false,
    };

    return draft.health;
}

function parseUlimit(value: string): UlimitSpec | null {
    const match = /^([a-z]+)=(-?\d+)(?::(-?\d+))?$/.exec(value);

    return match ? { name: match[1], soft: match[2], hard: match[3] ?? null } : null;
}

/** Applies one flag. `spelled` is how the reader typed it, for the notes. */
function applyFlag(
    draft: Draft,
    flag: RunFlag,
    spelled: string,
    value: string | null,
    notes: ConversionNote[],
): void {
    const { target } = flag;

    if (target.kind === "none") {
        notes.push({ id: "noComposeEquivalent", kind: "dropped", detail: spelled });

        return;
    }

    if (target.kind === "switch") {
        if (!draft.switches.includes(target.key)) {
            draft.switches.push(target.key);
        }

        return;
    }

    if (value === null) {
        applyValuelessSpecial(draft, flag, notes);

        return;
    }

    if (target.kind === "scalar") {
        draft.scalars[target.key] = value;

        return;
    }

    if (target.kind === "list") {
        pushUnique((draft.lists[target.key] ??= []), value);

        return;
    }

    applySpecial(draft, flag.long, value, notes);
}

function applyValuelessSpecial(draft: Draft, flag: RunFlag, notes: ConversionNote[]): void {
    switch (flag.long) {
        case "detach":
            notes.push({ id: "detach", kind: "adapted", detail: "-d" });
            return;
        case "rm":
            notes.push({ id: "autoRemove", kind: "dropped", detail: "--rm" });
            return;
        case "no-healthcheck":
            health(draft).disable = true;
            return;
    }
}

function applySpecial(draft: Draft, long: string, value: string, notes: ConversionNote[]): void {
    switch (long) {
        case "name":
            draft.containerName = value;
            return;
        case "entrypoint":
            // `--entrypoint ''` clears the image's entrypoint, which compose spells `[]`.
            draft.entrypoint = value === "" ? [] : [value];
            return;
        case "network":
        case "net":
            parseNetwork(draft, value, notes);
            return;
        case "network-alias":
        case "net-alias":
            pushUnique(draft.aliases, value);
            return;
        case "ip":
            draft.ipv4 = value;
            return;
        case "ip6":
            draft.ipv6 = value;
            return;
        case "mount": {
            const mount = parseMount(value, notes);

            if (mount) {
                draft.mounts.push(mount);
            }

            return;
        }
        case "health-cmd":
            health(draft).test = ["CMD-SHELL", value];
            return;
        case "health-interval":
            health(draft).interval = value;
            return;
        case "health-timeout":
            health(draft).timeout = value;
            return;
        case "health-retries":
            health(draft).retries = value;
            return;
        case "health-start-period":
            health(draft).startPeriod = value;
            return;
        case "health-start-interval":
            health(draft).startInterval = value;
            return;
        case "ulimit": {
            const ulimit = parseUlimit(value);

            if (ulimit) {
                draft.ulimits = [...draft.ulimits.filter((u) => u.name !== ulimit.name), ulimit];
            } else {
                notes.push({ id: "unreadableValue", kind: "dropped", detail: `--ulimit ${value}` });
            }

            return;
        }
        case "log-driver":
            draft.logDriver = value;
            return;
        case "log-opt": {
            const eq = value.indexOf("=");

            if (eq === -1) {
                notes.push({
                    id: "unreadableValue",
                    kind: "dropped",
                    detail: `--log-opt ${value}`,
                });
            } else {
                draft.logOptions.push([value.slice(0, eq), value.slice(eq + 1)]);
            }

            return;
        }
        case "stop-timeout":
            if (/^-?\d+$/.test(value)) {
                draft.stopTimeout = value;
            } else {
                notes.push({
                    id: "unreadableValue",
                    kind: "dropped",
                    detail: `--stop-timeout ${value}`,
                });
            }

            return;
        case "gpus":
            if (value === "all") {
                draft.gpus = "all";
            } else {
                notes.push({
                    id: "noComposeEquivalent",
                    kind: "dropped",
                    detail: `--gpus ${value}`,
                });
            }

            return;
        case "link":
            pushUnique(draft.links, value);
            return;
        case "volumes-from":
            pushUnique(draft.volumesFrom, value);
            return;
    }
}

type ReadCommand =
    | {
          readonly ok: true;
          readonly draft: Draft;
          readonly image: string;
          readonly command: string[];
      }
    | DockerComposeFailure;

/**
 * The CLI's own rules: flags until the first positional, which is the image;
 * everything after it belongs to the container. Short flags cluster (`-it`,
 * `-dp 80:80`) and the last one in a cluster may carry its value attached.
 */
function readCommand(args: readonly ShellWord[], notes: ConversionNote[]): ReadCommand {
    const draft = emptyDraft();
    const value = (word: ShellWord) => wordToCompose(word, notes);
    let index = 0;

    while (index < args.length) {
        const word = args[index];
        const text = wordText(word);

        if (text === "--") {
            index += 1;
            break;
        }

        if (!text.startsWith("-") || text === "-") {
            break;
        }

        if (text.startsWith("--")) {
            const eq = text.indexOf("=");
            const name = text.slice(2, eq === -1 ? undefined : eq);
            const spelled = `--${name}`;
            const flag = findLongFlag(name);

            if (flag === undefined) {
                notes.push({ id: "unknownFlag", kind: "dropped", detail: spelled });
            } else if (!flag.takesValue) {
                // `--privileged=false` is how a boolean is switched back off.
                if (eq === -1 || !/^(false|0)$/i.test(text.slice(eq + 1))) {
                    applyFlag(draft, flag, spelled, null, notes);
                }
            } else if (eq !== -1) {
                applyFlag(draft, flag, spelled, value(sliceWord(word, eq + 1)), notes);
            } else {
                const next = args[index + 1];

                if (next === undefined) {
                    return { ok: false, reason: "missing_value", token: spelled };
                }

                applyFlag(draft, flag, spelled, value(next), notes);
                index += 1;
            }

            index += 1;
            continue;
        }

        for (let position = 1; position < text.length; position += 1) {
            const letter = text[position];
            const flag = findShortFlag(letter);
            const spelled = `-${letter}`;

            if (flag === undefined) {
                notes.push({ id: "unknownFlag", kind: "dropped", detail: spelled });
                continue;
            }

            if (!flag.takesValue) {
                applyFlag(draft, flag, spelled, null, notes);
                continue;
            }

            const offset = text[position + 1] === "=" ? position + 2 : position + 1;

            if (offset < text.length) {
                applyFlag(draft, flag, spelled, value(sliceWord(word, offset)), notes);
            } else {
                const next = args[index + 1];

                if (next === undefined) {
                    return { ok: false, reason: "missing_value", token: spelled };
                }

                applyFlag(draft, flag, spelled, value(next), notes);
                index += 1;
            }

            break;
        }

        index += 1;
    }

    const image = args[index];

    if (image === undefined) {
        return { ok: false, reason: "missing_image" };
    }

    return { ok: true, draft, image: value(image), command: args.slice(index + 1).map(value) };
}

function finishNetworks(draft: Draft, notes: ConversionNote[]): NetworkAttachment[] {
    const extras = draft.aliases.length > 0 || draft.ipv4 !== null || draft.ipv6 !== null;

    if (!extras) {
        return draft.networks;
    }

    // `--network-alias`, `--ip` and `--ip6` belong to the one network named beside them.
    const [first, ...rest] = draft.networks;

    if (first === undefined) {
        for (const [flag, present] of [
            ["--network-alias", draft.aliases.length > 0],
            ["--ip", draft.ipv4 !== null],
            ["--ip6", draft.ipv6 !== null],
        ] as const) {
            if (present) {
                notes.push({ id: "noComposeEquivalent", kind: "dropped", detail: flag });
            }
        }

        return [];
    }

    return [
        {
            name: first.name,
            aliases: [...first.aliases, ...draft.aliases.filter((a) => !first.aliases.includes(a))],
            ipv4: draft.ipv4 ?? first.ipv4,
            ipv6: draft.ipv6 ?? first.ipv6,
        },
        ...rest,
    ];
}

type Read = { readonly draft: Draft; readonly image: string; readonly command: string[] };

/**
 * `--link db` and `--volumes-from db` name a container. When that container is
 * one of the commands in the same paste, compose names it as a service; when it
 * is not, compose has a separate spelling for "somebody else's container".
 */
function resolveContainers(reads: readonly Read[], keys: readonly string[]) {
    const keyFor = (container: string): string | undefined => {
        const index = reads.findIndex((read) => read.draft.containerName === container);

        return index === -1 ? undefined : keys[index];
    };

    return reads.map(({ draft }) => {
        const links: string[] = [];
        const externalLinks: string[] = [];
        const volumesFrom: string[] = [];

        for (const link of draft.links) {
            const [container, alias] = link.split(":");
            const key = keyFor(container);

            if (key === undefined) {
                pushUnique(externalLinks, link);
            } else {
                pushUnique(links, alias === undefined ? key : `${key}:${alias}`);
            }
        }

        for (const entry of draft.volumesFrom) {
            const [container, mode] = entry.split(":");
            const key = keyFor(container);
            const source = key ?? `container:${container}`;

            pushUnique(volumesFrom, mode === undefined ? source : `${source}:${mode}`);
        }

        const mode = draft.networkMode;
        const modeKey = mode?.startsWith("container:")
            ? keyFor(mode.slice("container:".length))
            : undefined;

        return {
            links,
            externalLinks,
            volumesFrom,
            networkMode: modeKey === undefined ? mode : `service:${modeKey}`,
        };
    });
}

/** Reads one or several `docker run` commands into the services they start. */
export function parseRunCommands(input: string): SpecsResult {
    if (input.trim().length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (input.length > MAX_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const tokenized = tokenizeCommands(stripPrompt(input), detectShellDialect(input));

    if (!tokenized.ok) {
        return tokenized;
    }

    const notes: ConversionNote[] = [];
    const reads: Read[] = [];

    for (const command of splitCommands(tokenized.commands)) {
        const args = runArguments(command);

        if (args === null) {
            notes.push({
                id: "notDockerRun",
                kind: "dropped",
                detail: command.slice(0, 3).map(wordText).join(" "),
            });
            continue;
        }

        const read = readCommand(args, notes);

        if (!read.ok) {
            return read;
        }

        reads.push(read);
    }

    if (reads.length === 0) {
        return { ok: false, reason: "no_run_command" };
    }

    const keys = assignServiceKeys(reads.map((read) => read.draft.containerName ?? read.image));
    const resolved = resolveContainers(reads, keys);

    const services = reads.map(({ draft, image, command }, index): ServiceSpec => {
        const { links, externalLinks, volumesFrom, networkMode } = resolved[index];
        const lists: Partial<Record<ListKey, readonly string[]>> = { ...draft.lists };

        if (links.length > 0) {
            lists.links = links;
        }

        if (externalLinks.length > 0) {
            lists.external_links = externalLinks;
        }

        if (volumesFrom.length > 0) {
            lists.volumes_from = volumesFrom;
        }

        return {
            key: keys[index],
            image,
            containerName: draft.containerName,
            entrypoint: draft.entrypoint,
            command: command.length > 0 ? command : null,
            scalars: draft.scalars,
            lists,
            // Table order, so a spec read from a command equals one read from YAML.
            switches: SWITCH_KEYS.filter((key) => draft.switches.includes(key)),
            mounts: draft.mounts,
            networkMode,
            networks: finishNetworks(draft, notes),
            healthcheck: draft.health,
            ulimits: draft.ulimits,
            logging:
                draft.logDriver === null && draft.logOptions.length === 0
                    ? null
                    : { driver: draft.logDriver, options: draft.logOptions },
            stopTimeout: draft.stopTimeout,
            gpus: draft.gpus,
        };
    });

    for (const name of new Set(
        services.flatMap((service) => service.networks.map((n) => n.name)),
    )) {
        notes.push({ id: "externalNetwork", kind: "adapted", detail: name });
    }

    return { ok: true, services, notes };
}
