# Documentation Is Part of the Change

Code and the documents describing it ship together. Documentation drift is a
defect in the change that caused it, never a follow-up ticket — a reader landing
on the README should never be told a shipped tool is still planned, or be given a
variable list that does not start the app.

---

## When a new tool ships

Flipping a catalog entry to `status: "available"` obliges all of:

- **`README.md`** — add the tool to the **Tools** table with its route, category
  and a one-line description, and remove it from the planned list underneath.
- **`example.env`** — every variable the tool reads, with a comment saying what
  it is for and what happens when it is blank.
- **`README.md` environment table** — the same variables, with whether they are
  required and what degrades without them.
- **`README.md` configuration table** — any new config file, or a change to what
  an existing one is responsible for.
- **`CONTRIBUTING.md`** — only when the tool changes how contributors work: a new
  shared component worth reusing, a new directory in the module layout, a new
  verification step.
- **`docs/`** — when the tool establishes a pattern the next one should follow
  (`docs/patterns/`) or cost a defect the next author would otherwise repeat
  (`docs/case-studies/`). Add the row to the tables in
  [`docs/README.md`](../README.md) and, when the module gets a design note, to
  the module table in [`docs/architecture.md`](../architecture.md).
- **`CLAUDE.md`** — only when the tool adds or changes a **rule**. Rules live
  there; reasoning lives in `docs/`. If you find yourself writing a paragraph in
  `CLAUDE.md`, it belongs in `docs/` with a one-line rule pointing at it.

## When anything else changes

- A new script in `package.json` → the **Scripts** table.
- A new environment variable → `example.env` and the environment table, together.
- A new directory under `src/modules/<feature>/` → the project-structure block in
  `README.md` and in [`docs/architecture.md`](../architecture.md).
- A new top-level config file → the configuration table.
- A dependency that changes how the project is run or built → **Getting
  started**.
- A new file under `docs/` → a row in the map and the by-subsystem table in
  [`docs/README.md`](../README.md).

## The rule

Before calling any change done, re-read the sections of `README.md` and `docs/`
it touches and ask whether they are still true. If a table, list, or count has
gone stale, it is part of this change, not the next one.

## Where knowledge goes

```
The change taught something. Where does it go?

Is it a rule the next author must not break?
├─ Yes → one line in CLAUDE.md + its reasoning in the matching docs/ file.
└─ No.
   Would a second tool copy this shape?
   ├─ Yes → docs/patterns/<shape>.md
   └─ No.
      Is it a defect specific to one subsystem?
      ├─ Yes → docs/case-studies/<module>.md
      └─ No  → a comment at the line, and nothing in docs/.
```

Never state the same reasoning in two files. The second one gets a link.
