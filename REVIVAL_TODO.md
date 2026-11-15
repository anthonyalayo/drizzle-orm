# pg-domain revival: TODO

Fork goal: postgres domains + column-level CHECKs (+ zod rules derived from CHECKs) on top of
the latest upstream `main`, published as `@anthonyalayo/drizzle-*`.

## In progress
- [x] Fix bugs found in review of `pg-domain-support` (ORM mapping, kit generate/push/pull, zod parser)
- [x] Keep snapshot format at v7 (v8 bump made the second `generate` exit with "unsupported version")
- [ ] Rebase onto `upstream/main` in chunks, tests green after each chunk
- [ ] Publish `@anthonyalayo/drizzle-orm`, `-kit`, `-zod`, `-seed`

## zod v4 (latest: 4.6.7)
- [x] Port `drizzle-zod/src/checks.ts` to zod v4 (upstream moved drizzle-zod to `zod/v4` in May 2025)
- [x] Re-verify the soundness tests (never stricter than postgres) under zod v4

## Declarative error messages for generated schemas (colinhacks/zod#4057)
The issue asked for overriding messages on an existing schema without redefining it, e.g.
`schema.update({ 'firstName.min': 'too short' })`. It was closed pointing at error maps, and nothing
shipped in zod 4.6.x. drizzle-zod is the natural place to solve this for DB-derived schemas:
- [ ] Use the CHECK constraint name as the default message/issue metadata for derived rules,
      e.g. `check('first_name_length', ...)` -> issue tagged `first_name_length`
- [ ] Option on `createInsertSchema`/`createSelectSchema`/`createSchemaFactory`, e.g.
      `{ messages: { firstName: { min: 'too short', max: 'too long' }, 'first_name_length': '...' } }`
- [ ] Decide on the API shape (per field+rule vs per constraint name); add type-safe keys

## Known gaps (not yet handled)
- [x] Arrays of a domain living in a non-public schema (fixed with upstream's array unwrapping)
- [ ] `$defaultFn`/`$onUpdateFn` set on the builder wrapped by a domain aren't applied to the domain column
- [ ] drizzle-seed support for domain columns
