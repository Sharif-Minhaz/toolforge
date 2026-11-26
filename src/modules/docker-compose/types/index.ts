/**
 * Both directions meet at `ServiceSpec`, the container one `docker run` starts
 * and one compose service describes. A command is read into specs and the specs
 * are written out as YAML; YAML is read into the same specs and written out as
 * commands. Nothing rewrites one syntax into the other directly, so the two
 * directions cannot develop separate opinions about what `-p` means.
 *
 * Every string in a spec is in compose's interpolation form: `$$` is a literal
 * dollar and `${NAME}` is a variable. That is the one spelling both ends share —
 * compose reads it verbatim and the shell writer turns a variable back into
 * something the shell expands.
 */

export const DOCKER_COMPOSE_DIRECTIONS = ["runToCompose", "composeToRun"] as const;

export type DockerComposeDirection = (typeof DOCKER_COMPOSE_DIRECTIONS)[number];

/** Compose keys that hold one string, each with exactly one `docker run` flag. */
export const SCALAR_KEYS = [
    "hostname",
    "domainname",
    "user",
    "working_dir",
    "restart",
    "platform",
    "pull_policy",
    "mem_limit",
    "mem_reservation",
    "memswap_limit",
    "mem_swappiness",
    "shm_size",
    "cpus",
    "cpu_shares",
    "cpuset",
    "cpu_period",
    "cpu_quota",
    "cpu_rt_period",
    "cpu_rt_runtime",
    "cpu_count",
    "cpu_percent",
    "pids_limit",
    "oom_score_adj",
    "stop_signal",
    "pid",
    "ipc",
    "uts",
    "userns_mode",
    "cgroup",
    "cgroup_parent",
    "isolation",
    "runtime",
    "mac_address",
    "umask",
] as const;

export type ScalarKey = (typeof SCALAR_KEYS)[number];

/** Compose keys that hold a list, each filled by one repeatable flag. */
export const LIST_KEYS = [
    "ports",
    "expose",
    "volumes",
    "tmpfs",
    "environment",
    "env_file",
    "labels",
    "label_file",
    "annotations",
    "cap_add",
    "cap_drop",
    "devices",
    "device_cgroup_rules",
    "extra_hosts",
    "dns",
    "dns_search",
    "dns_opt",
    "security_opt",
    "sysctls",
    "group_add",
    "links",
    "external_links",
    "volumes_from",
] as const;

export type ListKey = (typeof LIST_KEYS)[number];

/** Compose keys that are `true` or absent, each one valueless flag. */
export const SWITCH_KEYS = [
    "privileged",
    "stdin_open",
    "tty",
    "init",
    "read_only",
    "oom_kill_disable",
    "use_api_socket",
] as const;

export type SwitchKey = (typeof SWITCH_KEYS)[number];

/** A long-syntax volume — what `--mount` writes. */
export type MountSpec = {
    readonly type: string;
    readonly source: string | null;
    readonly target: string;
    readonly readOnly: boolean;
    /** `--mount` keys with a compose home, in `bind-propagation` spelling. */
    readonly options: readonly (readonly [string, string])[];
};

export type NetworkAttachment = {
    readonly name: string;
    readonly aliases: readonly string[];
    readonly ipv4: string | null;
    readonly ipv6: string | null;
};

export type HealthcheckSpec = {
    /** `["CMD-SHELL", …]`, `["CMD", …]` or `["NONE"]`; null when only timings are set. */
    readonly test: readonly string[] | null;
    readonly interval: string | null;
    readonly timeout: string | null;
    readonly retries: string | null;
    readonly startPeriod: string | null;
    readonly startInterval: string | null;
    readonly disable: boolean;
};

export type UlimitSpec = {
    readonly name: string;
    readonly soft: string;
    readonly hard: string | null;
};

export type LoggingSpec = {
    readonly driver: string | null;
    readonly options: readonly (readonly [string, string])[];
};

export type ServiceSpec = {
    /** The compose service name. */
    readonly key: string;
    readonly image: string;
    readonly containerName: string | null;
    /** Null is the image's own; an empty list is "none". */
    readonly entrypoint: readonly string[] | null;
    readonly command: readonly string[] | null;
    readonly scalars: Readonly<Partial<Record<ScalarKey, string>>>;
    readonly lists: Readonly<Partial<Record<ListKey, readonly string[]>>>;
    readonly switches: readonly SwitchKey[];
    readonly mounts: readonly MountSpec[];
    readonly networkMode: string | null;
    readonly networks: readonly NetworkAttachment[];
    readonly healthcheck: HealthcheckSpec | null;
    readonly ulimits: readonly UlimitSpec[];
    readonly logging: LoggingSpec | null;
    /** Whole seconds, which is all `--stop-timeout` takes. */
    readonly stopTimeout: string | null;
    readonly gpus: string | null;
};

/* --------------------------------------------------------------- notes --- */

/**
 * Everything a conversion could not carry across unchanged. Each id is a
 * message key. `dropped` is gone and changes what runs; `adapted` survived as
 * something that does not look like it.
 */
export const CONVERSION_NOTES = [
    "notDockerRun",
    "unknownFlag",
    "noComposeEquivalent",
    "detach",
    "autoRemove",
    "commandSubstitution",
    "pwdVariable",
    "externalNetwork",
    "noRunEquivalent",
    "unreadableValue",
    "noImage",
    "buildIgnored",
    "createNetwork",
    "projectVolume",
    "defaultNetwork",
    "interpolation",
    "healthcheckShell",
    "entrypointSplit",
    "commandCut",
] as const;

export type ConversionNoteId = (typeof CONVERSION_NOTES)[number];

export type ConversionNoteKind = "dropped" | "adapted";

export type ConversionNote = {
    readonly id: ConversionNoteId;
    readonly kind: ConversionNoteKind;
    /** Interpolated into the message — a flag, a key, a name. */
    readonly detail?: string;
};

/* ------------------------------------------------------------- results --- */

export type DockerComposeFailureReason =
    | "empty"
    | "too_long"
    | "unbalanced_quote"
    | "no_run_command"
    | "missing_value"
    | "missing_image"
    | "invalid_yaml"
    | "not_compose"
    | "no_runnable_service";

export type DockerComposeFailure = {
    readonly ok: false;
    readonly reason: DockerComposeFailureReason;
    /** The flag that wanted a value, when there is one. */
    readonly token?: string;
    /** 1-based, for a YAML error. */
    readonly line?: number;
};

export type SpecsResult =
    | {
          readonly ok: true;
          readonly services: readonly ServiceSpec[];
          readonly notes: readonly ConversionNote[];
      }
    | DockerComposeFailure;

export type ConversionResult =
    | {
          readonly ok: true;
          readonly output: string;
          readonly services: readonly ServiceSpec[];
          readonly notes: readonly ConversionNote[];
      }
    | DockerComposeFailure;
