/** What compose accepts as a service, network or volume key. */
export const COMPOSE_KEY = /^[a-zA-Z0-9._-]+$/;

/**
 * `ghcr.io/acme/api:1.4@sha256:…` → `api`. The registry, the path, the tag and
 * the digest all go; what is left is what a person would call the service.
 */
function imageName(image: string): string {
    const withoutDigest = image.split("@")[0];
    const last = withoutDigest.split("/").pop() ?? "";

    return last.split(":")[0];
}

export function toComposeKey(name: string, fallback: string): string {
    const key = name
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^[^a-zA-Z0-9]+/, "")
        .replace(/-+$/, "");

    return key.length > 0 ? key : fallback;
}

/**
 * One key per service, from the container's name where it has one and the
 * image's otherwise — a container name has no `/`, `:` or `@`, so the same
 * trim leaves it alone. Two `nginx` services become `nginx` and `nginx-2`
 * rather than one silently replacing the other.
 */
export function assignServiceKeys(names: readonly string[]): string[] {
    const taken = new Set<string>();

    return names.map((name) => {
        const base = toComposeKey(imageName(name), "app");
        let key = base;

        for (let suffix = 2; taken.has(key); suffix += 1) {
            key = `${base}-${suffix}`;
        }

        taken.add(key);

        return key;
    });
}
