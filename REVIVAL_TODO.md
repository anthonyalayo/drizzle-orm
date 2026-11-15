# pg-domain revival: TODO

Fork goal: postgres domains + column-level CHECKs (+ zod rules derived from CHECKs) on top of
the latest upstream `main`, published as `@anthonyalayo/drizzle-*`.

## In progress
- [x] Fix bugs found in review of `pg-domain-support` (ORM mapping, kit generate/push/pull, zod parser)
- [x] Keep snapshot format at v7 (v8 bump made the second `generate` exit with "unsupported version")
- [x] Rebase onto `upstream/main` in chunks, tests green after each chunk (6 chunks, now on 3bcb6a27e, 2026-11-13)
- [x] Publish `@anthonyalayo/drizzle-orm`, `-kit`, `-zod`, `-seed` 1.1.0 (`scripts/release-fork.mjs`, see FORK.md)

## zod v4 (latest: 4.6.7)
- [x] Port `drizzle-zod/src/checks.ts` to zod v4 (upstream moved drizzle-zod to `zod/v4` in May 2025)
- [x] Re-verify the soundness tests (never stricter than postgres) under zod v4

## Declarative error messages for generated schemas (colinhacks/zod#4057)
The issue asked for overriding messages on an existing schema without redefining it, e.g.
`schema.update({ 'firstName.min': 'too short' })`. It was closed pointing at error maps, and nothing
shipped in zod 4.6.x. drizzle-zod is the natural place to solve this for DB-derived schemas:
- [x] zod fork `@anthonyalayo/zod` 4.7.0 with `schema.update({ 'path.check': msg })` (works on drizzle-zod schemas)
- [x] CHECK-derived zod rules match postgres exactly (differential test against PGlite), labelled with the
      constraint name (`update({ 'field.<constraint>': msg })`, zod fork 4.7.1 check names)
- [x] Table-level CHECKs across several columns (e.g. `ends_at > starts_at`) as object-level zod refinements
      (1.2.2; zod fork 4.7.2 keyed refinements keep them through pick/omit/partial/extend)
- [x] Table-level single-column CHECKs (e.g. `messages_body_check`) as field rules (1.2.2)
- [ ] CHECKs on a column or domain that reject NULL (`x IS NOT NULL ...`) are applied inside `.nullable()`, so a
      NULL for a nullable column still passes zod (table checks handle this; NOT NULL is the usual way to say it)
- [ ] `real` columns compared to literals: values are rounded to float4 but literals are compared as float8
- [x] Use the CHECK constraint name as the default message/issue metadata for derived rules,
      e.g. `check('first_name_length', ...)` -> issue tagged `first_name_length`
- [x] API shape decided: `schema.update()` keyed by field + constraint name (zod fork), instead of a
      `messages` option on `createInsertSchema`
- [ ] Type-safe `update()` keys

## Next release (unpublished fixes on `pg-domain-revival`)
- [ ] 1.2.3: LIKE patterns containing `-` threw while building the schema (9bed68a76). No deployed project
      is affected (dispatchem has no LIKE checks; lecturelab doesn't use drizzle-zod)

## Known gaps (not yet handled)
- [x] Arrays of a domain living in a non-public schema (fixed with upstream's array unwrapping)
- [ ] `$defaultFn`/`$onUpdateFn` set on the builder wrapped by a domain aren't applied to the domain column
- [x] drizzle-seed support for domain columns (seeded as their base type)
- [ ] drizzle-seed doesn't respect CHECK constraints (domain or table) when generating values
- [ ] Upstream-only test failures seen while verifying (not caused by this fork): drizzle-seed
      `valuesFromArray unique generator test`; drizzle-kit `cli-*` fixture tests; sqlite suites need
      better-sqlite3 built for the local Node
- [x] Pull codegen suffix is configurable: `introspect: { schemaSuffix: false }` (1.2.1)
