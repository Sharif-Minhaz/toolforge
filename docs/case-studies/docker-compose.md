# Docker Run ↔ Compose Converter
`src/modules/docker-compose/`. Reads `docker run` commands or a compose file into one
`ServiceSpec` per container and writes the other notation from it. The general
shape is [`../patterns/format-conversion.md`](../patterns/format-conversion.md);
this file is what is specific to Docker.

---

## Depend or implement
`composerize` / `decomposerize` (MIT) were the candidates. Rule 45 says the output is
read by somebody else, so depend on the _reference_ — but neither is the reference.
The references are the Docker CLI and compose-go, both Go. The npm ports pull
`composeverter` at the unpinned tag `latest`, `core-js@2` and a CLI prompt library
into a browser bundle, and parse argv with `yargs-parser`, which knows no Docker
arity. So the converter is implemented here, with `yaml@2` for the YAML, and checked
against the real references instead (below).

---

## The shell reader is the cURL one
`tools/domain/shell-tokenize.ts` moved out of `curl/` when this tool needed it. It
grew two things cURL never asked for, both behind `tokenizeCommands` so `tokenize`
returns exactly what it always did:

- **Commands end at an unquoted line break.** A paste is usually several
  `docker run`s, one per line; a `\` continuation still joins lines.
- **Every word remembers how it was quoted** (`ShellSegment.expandable`).

## A dollar is translated by where it stood
Compose interpolates every value: `${TAG}` and `$TAG` are variables, `$$` is a
literal. A shell expands `$` in unquoted and double-quoted text and nowhere else.
So `'pa$word'` must become `pa$$word`, and `"$HOME"` must stay `$HOME` — the same
characters, opposite meanings. A tokenizer that hands back plain strings has already
lost the difference, which is why the segments exist.

`$(pwd)` becomes `${PWD}`; any other `$(…)` is kept literal and named, because
compose cannot run anything. Going the other way, a variable is written inside
double quotes (`nginx:"${TAG}"`) so the shell fills it — POSIX shares compose's
`${NAME:-default}` syntax.

**`text.replaceAll("$", "$$")` is a no-op.** `$$` in a replacement string means one
`$`. Use a replacer function. This shipped once and only the round trip through
`docker compose config` caught it.

---

## Arity is recorded for every flag
`run-flags.ts` holds all of `docker run --help` plus the hidden aliases (`--net`,
`--dns-opt`), including the twenty-odd with no compose key. Guessing that
`--cidfile` is a switch makes the image `/tmp/id`. A flag outside the table is
named and read as a switch.

---

## Read YAML the way compose reads it
compose-go's YAML reader is not the 1.2 core schema:

| Input | 1.2 core | compose |
| --- | --- | --- |
| `cpu_shares: 010` | 10 | 8 — leading zero is octal |
| `command: a && b` | — | `["a"]` — its splitter stops at `;&|<>` and `#` |

Both are matched (`parse-compose.ts`), and the cut command gets a `commandCut` note
because the rest of it never ran under compose either.

The writer uses the YAML 1.1 schema so `restart: "no"`, `"yes"` and `"22:22"` come
out quoted. `tmpfs-mode=1770` is octal to Docker and a bit value to compose, so it is
written `01770`.

---

## Names compose would change
- A network a `docker run` joined already existed, so it is declared
  `external: true` — compose would otherwise create `<project>_<name>`.
- A named volume is declared with `name:` set to itself, so compose uses the volume
  the container already has rather than an empty `<project>_<name>`.
- The reverse notes both: `createNetwork` and `projectVolume`.
- Commands get `--name <service>` without a `container_name`, because on a shared
  network the container name is what the others resolve.

---

## Cross-verification
Run in a scratch directory, never in `bun test`:

1. Every generated `compose.yaml` validated against the compose-spec JSON schema
   (91 KB, too large to pin) and read by `docker compose config` (v2.40).
2. Every generated command run through `/bin/sh` with `docker()` defined to print
   its argv, compared with `tokenizeCommands`' reading of the same text.
3. compose → run → compose, and run → compose → run → compose, both normalised by
   `docker compose config` and compared, ignoring only what a note declares.

The pinned outputs in `emit-compose.test.ts` and `emit-run.test.ts` are from passing
runs. **cmd and PowerShell output is not generated**, and their reading is checked
only against this repo's tokenizer.
