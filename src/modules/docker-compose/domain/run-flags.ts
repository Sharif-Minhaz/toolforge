import type { ListKey, ScalarKey, SwitchKey } from "../types";

/**
 * Every `docker run` flag, including the ones nothing here maps.
 *
 * Arity is what a tolerant reader may not guess: assume an unknown flag takes a
 * value and it eats the image; assume it does not and its value becomes the
 * image. So the table records `takesValue` even for flags with no compose home,
 * and being _ignored_ stays survivable while being _mis-split_ stays impossible.
 * Taken from `docker run --help` (Docker 29) plus the hidden aliases it still
 * accepts.
 */

export type FlagTarget =
    | { readonly kind: "scalar"; readonly key: ScalarKey }
    | { readonly kind: "list"; readonly key: ListKey }
    | { readonly kind: "switch"; readonly key: SwitchKey }
    /** Read and written by hand: it needs more than one key, or a lookup. */
    | { readonly kind: "special" }
    /** A real flag that compose has no key for. */
    | { readonly kind: "none" };

export type RunFlag = {
    readonly long: string;
    readonly short?: string;
    readonly takesValue: boolean;
    readonly target: FlagTarget;
    /** Written as `-p` rather than `--publish`: the spelling everybody reads. */
    readonly writeShort?: true;
};

const scalar = (key: ScalarKey): FlagTarget => ({ kind: "scalar", key });
const list = (key: ListKey): FlagTarget => ({ kind: "list", key });
const toggle = (key: SwitchKey): FlagTarget => ({ kind: "switch", key });
const SPECIAL: FlagTarget = { kind: "special" };
const NONE: FlagTarget = { kind: "none" };

export const RUN_FLAGS: readonly RunFlag[] = [
    { long: "add-host", takesValue: true, target: list("extra_hosts") },
    { long: "annotation", takesValue: true, target: list("annotations") },
    { long: "attach", short: "a", takesValue: true, target: NONE },
    { long: "blkio-weight", takesValue: true, target: NONE },
    { long: "blkio-weight-device", takesValue: true, target: NONE },
    { long: "cap-add", takesValue: true, target: list("cap_add") },
    { long: "cap-drop", takesValue: true, target: list("cap_drop") },
    { long: "cgroup-parent", takesValue: true, target: scalar("cgroup_parent") },
    { long: "cgroupns", takesValue: true, target: scalar("cgroup") },
    { long: "cidfile", takesValue: true, target: NONE },
    { long: "cpu-count", takesValue: true, target: scalar("cpu_count") },
    { long: "cpu-percent", takesValue: true, target: scalar("cpu_percent") },
    { long: "cpu-period", takesValue: true, target: scalar("cpu_period") },
    { long: "cpu-quota", takesValue: true, target: scalar("cpu_quota") },
    { long: "cpu-rt-period", takesValue: true, target: scalar("cpu_rt_period") },
    { long: "cpu-rt-runtime", takesValue: true, target: scalar("cpu_rt_runtime") },
    { long: "cpu-shares", short: "c", takesValue: true, target: scalar("cpu_shares") },
    { long: "cpus", takesValue: true, target: scalar("cpus") },
    { long: "cpuset-cpus", takesValue: true, target: scalar("cpuset") },
    { long: "cpuset-mems", takesValue: true, target: NONE },
    { long: "detach", short: "d", takesValue: false, target: SPECIAL },
    { long: "detach-keys", takesValue: true, target: NONE },
    { long: "device", takesValue: true, target: list("devices") },
    { long: "device-cgroup-rule", takesValue: true, target: list("device_cgroup_rules") },
    { long: "device-read-bps", takesValue: true, target: NONE },
    { long: "device-read-iops", takesValue: true, target: NONE },
    { long: "device-write-bps", takesValue: true, target: NONE },
    { long: "device-write-iops", takesValue: true, target: NONE },
    { long: "disable-content-trust", takesValue: false, target: NONE },
    { long: "dns", takesValue: true, target: list("dns") },
    { long: "dns-option", takesValue: true, target: list("dns_opt") },
    { long: "dns-opt", takesValue: true, target: list("dns_opt") },
    { long: "dns-search", takesValue: true, target: list("dns_search") },
    { long: "domainname", takesValue: true, target: scalar("domainname") },
    { long: "entrypoint", takesValue: true, target: SPECIAL },
    { long: "env", short: "e", takesValue: true, target: list("environment"), writeShort: true },
    { long: "env-file", takesValue: true, target: list("env_file") },
    { long: "expose", takesValue: true, target: list("expose") },
    { long: "gpus", takesValue: true, target: SPECIAL },
    { long: "group-add", takesValue: true, target: list("group_add") },
    { long: "health-cmd", takesValue: true, target: SPECIAL },
    { long: "health-interval", takesValue: true, target: SPECIAL },
    { long: "health-retries", takesValue: true, target: SPECIAL },
    { long: "health-start-interval", takesValue: true, target: SPECIAL },
    { long: "health-start-period", takesValue: true, target: SPECIAL },
    { long: "health-timeout", takesValue: true, target: SPECIAL },
    { long: "help", takesValue: false, target: NONE },
    { long: "hostname", short: "h", takesValue: true, target: scalar("hostname") },
    { long: "init", takesValue: false, target: toggle("init") },
    { long: "interactive", short: "i", takesValue: false, target: toggle("stdin_open") },
    { long: "io-maxbandwidth", takesValue: true, target: NONE },
    { long: "io-maxiops", takesValue: true, target: NONE },
    { long: "ip", takesValue: true, target: SPECIAL },
    { long: "ip6", takesValue: true, target: SPECIAL },
    { long: "ipc", takesValue: true, target: scalar("ipc") },
    { long: "isolation", takesValue: true, target: scalar("isolation") },
    { long: "kernel-memory", takesValue: true, target: NONE },
    { long: "label", short: "l", takesValue: true, target: list("labels") },
    { long: "label-file", takesValue: true, target: list("label_file") },
    { long: "link", takesValue: true, target: SPECIAL },
    { long: "link-local-ip", takesValue: true, target: NONE },
    { long: "log-driver", takesValue: true, target: SPECIAL },
    { long: "log-opt", takesValue: true, target: SPECIAL },
    { long: "mac-address", takesValue: true, target: scalar("mac_address") },
    { long: "memory", short: "m", takesValue: true, target: scalar("mem_limit") },
    { long: "memory-reservation", takesValue: true, target: scalar("mem_reservation") },
    { long: "memory-swap", takesValue: true, target: scalar("memswap_limit") },
    { long: "memory-swappiness", takesValue: true, target: scalar("mem_swappiness") },
    { long: "mount", takesValue: true, target: SPECIAL },
    { long: "name", takesValue: true, target: SPECIAL },
    { long: "network", takesValue: true, target: SPECIAL },
    { long: "net", takesValue: true, target: SPECIAL },
    { long: "network-alias", takesValue: true, target: SPECIAL },
    { long: "net-alias", takesValue: true, target: SPECIAL },
    { long: "no-healthcheck", takesValue: false, target: SPECIAL },
    { long: "oom-kill-disable", takesValue: false, target: toggle("oom_kill_disable") },
    { long: "oom-score-adj", takesValue: true, target: scalar("oom_score_adj") },
    { long: "pid", takesValue: true, target: scalar("pid") },
    { long: "pids-limit", takesValue: true, target: scalar("pids_limit") },
    { long: "platform", takesValue: true, target: scalar("platform") },
    { long: "privileged", takesValue: false, target: toggle("privileged") },
    { long: "publish", short: "p", takesValue: true, target: list("ports"), writeShort: true },
    { long: "publish-all", short: "P", takesValue: false, target: NONE },
    { long: "pull", takesValue: true, target: scalar("pull_policy") },
    { long: "quiet", short: "q", takesValue: false, target: NONE },
    { long: "read-only", takesValue: false, target: toggle("read_only") },
    { long: "restart", takesValue: true, target: scalar("restart") },
    { long: "rm", takesValue: false, target: SPECIAL },
    { long: "runtime", takesValue: true, target: scalar("runtime") },
    { long: "security-opt", takesValue: true, target: list("security_opt") },
    { long: "shm-size", takesValue: true, target: scalar("shm_size") },
    { long: "sig-proxy", takesValue: false, target: NONE },
    { long: "stop-signal", takesValue: true, target: scalar("stop_signal") },
    { long: "stop-timeout", takesValue: true, target: SPECIAL },
    { long: "storage-opt", takesValue: true, target: NONE },
    { long: "sysctl", takesValue: true, target: list("sysctls") },
    { long: "tmpfs", takesValue: true, target: list("tmpfs") },
    { long: "tty", short: "t", takesValue: false, target: toggle("tty") },
    { long: "ulimit", takesValue: true, target: SPECIAL },
    { long: "umask", takesValue: true, target: scalar("umask") },
    { long: "use-api-socket", takesValue: false, target: toggle("use_api_socket") },
    { long: "user", short: "u", takesValue: true, target: scalar("user") },
    { long: "userns", takesValue: true, target: scalar("userns_mode") },
    { long: "uts", takesValue: true, target: scalar("uts") },
    { long: "volume", short: "v", takesValue: true, target: list("volumes"), writeShort: true },
    { long: "volume-driver", takesValue: true, target: NONE },
    { long: "volumes-from", takesValue: true, target: SPECIAL },
    { long: "workdir", short: "w", takesValue: true, target: scalar("working_dir") },
];

const BY_LONG = new Map(RUN_FLAGS.map((flag) => [flag.long, flag]));
const BY_SHORT = new Map(
    RUN_FLAGS.flatMap((flag) => (flag.short === undefined ? [] : [[flag.short, flag] as const])),
);

export function findLongFlag(name: string): RunFlag | undefined {
    return BY_LONG.get(name);
}

export function findShortFlag(letter: string): RunFlag | undefined {
    return BY_SHORT.get(letter);
}

/**
 * The flag that writes a compose key back out. The first entry wins, so an
 * alias (`--dns-opt`) never replaces the documented spelling.
 */
const FLAG_FOR_KEY = new Map<string, RunFlag>();

for (const flag of RUN_FLAGS) {
    const { target } = flag;

    if (target.kind === "scalar" || target.kind === "list" || target.kind === "switch") {
        if (!FLAG_FOR_KEY.has(target.key)) {
            FLAG_FOR_KEY.set(target.key, flag);
        }
    }
}

/** `-p` or `--hostname`: how the writer spells the flag for a compose key. */
export function flagSpelling(key: ScalarKey | ListKey | SwitchKey): string {
    const flag = FLAG_FOR_KEY.get(key);

    if (flag === undefined) {
        throw new Error(`no docker run flag writes ${key}`);
    }

    return flag.writeShort && flag.short !== undefined ? `-${flag.short}` : `--${flag.long}`;
}

/**
 * `--mount` keys compose has a field for, and where that field lives. `octal`
 * is a file mode: `tmpfs-mode=1770` is octal to Docker, and compose wants the
 * same bits as a number.
 */
export const MOUNT_OPTIONS = [
    { option: "bind-propagation", group: "bind", field: "propagation", kind: "text" },
    { option: "bind-recursive", group: "bind", field: "recursive", kind: "text" },
    { option: "volume-nocopy", group: "volume", field: "nocopy", kind: "flag" },
    { option: "volume-subpath", group: "volume", field: "subpath", kind: "text" },
    { option: "tmpfs-size", group: "tmpfs", field: "size", kind: "text" },
    { option: "tmpfs-mode", group: "tmpfs", field: "mode", kind: "octal" },
    { option: "image-subpath", group: "image", field: "subpath", kind: "text" },
    { option: "consistency", group: null, field: "consistency", kind: "text" },
] as const;

/** `docker run --network` values that are a mode rather than a network's name. */
export const NETWORK_MODES = new Set(["host", "none", "bridge", "default"]);
