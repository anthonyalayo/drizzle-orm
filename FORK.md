# @anthonyalayo/drizzle-* fork

Upstream [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) `main` (drizzle-orm 0.45.x line) plus:

- **PostgreSQL domains**: `pgDomain(name, builder)` / `pgSchema(...).domain(name, builder)`, usable as columns,
  arrays, and bases of other domains; supported by drizzle-kit `generate` / `migrate` / `push` / `pull` / `export`
  (create, alter default / not null / checks, rename, move schema, drop) and drizzle-seed.
- **Column-level checks**: `integer().checkConstraint(sql\`...\`)` (named or unnamed) become table constraints.
- **drizzle-zod rules derived from CHECK constraints** (domain, column and table checks) that accept exactly
  what postgres accepts: comparisons, `BETWEEN`, `AND`/`OR`/`NOT`, `IN` and `= ANY (ARRAY[...])`,
  `IS [NOT] NULL`, `LIKE`/`ILIKE`, `~`/`~*`/`!~`, `length()`/`char_length()`, `trim()`/`btrim()`/`ltrim()`/`rtrim()`,
  `lower()`/`upper()`, value-preserving casts and `'...'::date`/`::timestamp` literals. Postgres semantics are kept:
  three-valued NULL logic, TRIM strips spaces only, length counts characters, `numeric(p, s)` and `timestamp(p)`
  round their input first, exact decimal comparison, timestamps compared at microsecond precision. A differential
  test checks every rule against a real postgres, as written and as `pg_get_constraintdef` prints it. Expressions
  outside that set (string ordering, session time zone, other functions) are left to the database.
- **Checks across columns** (`check('events_ends_after_starts', sql\`${t.endsAt} > ${t.startsAt}\`)`) become
  object-level rules, reported on the first column they read ("Must be after starts at"). They run once the
  columns they read are valid, are skipped while one of those columns is omitted (update schemas), and survive
  `.pick()`/`.omit()`/`.partial()`/`.extend()` with the zod fork (dropped when a column they read is removed).

## Install

Use npm aliases so all imports (`drizzle-orm`, `drizzle-orm/pg-core`, `drizzle-kit`, ...) stay unchanged:

```json
{
	"dependencies": {
		"drizzle-orm": "npm:@anthonyalayo/drizzle-orm@^1.2.2",
		"drizzle-zod": "npm:@anthonyalayo/drizzle-zod@^1.2.2",
		"drizzle-seed": "npm:@anthonyalayo/drizzle-seed@^1.2.2",
		"zod": "npm:@anthonyalayo/zod@^4.7.2"
	},
	"devDependencies": {
		"drizzle-kit": "npm:@anthonyalayo/drizzle-kit@^1.2.2"
	}
}
```

drizzle-zod targets zod v4. The `zod` alias above is optional: stock `zod@^3.25 || ^4` works, while the
[@anthonyalayo/zod](https://github.com/anthonyalayo/zod) fork adds `schema.update()` for overriding the
messages of generated schemas (colinhacks/zod#6758), and lets refinements that declare the keys they read survive
`.pick()`/`.omit()`/`.partial()`/`.extend()` (stock zod throws on those once a table has a check across columns):

```ts
const insertUser = createInsertSchema(users).update({
	'firstName.limited_text_check': 'Enter a first name (up to 100 characters)', // by CHECK constraint name
	'age.min.18': 'must be an adult', // "path.check.value" picks one of several same-named checks
	email: 'email must be text', // "path" alone: the field's own type error
});
```

Every CHECK-derived rule carries its constraint name (unnamed checks use drizzle-kit's names:
`<domain>_check`, `<table>_check`, `<table>_<column>_check`, then `..._check1`, ... counted across the table) and a readable default message such as
"Must be at most 100 characters, not counting leading or trailing spaces".

Paths descend through object fields, `[]` array elements and wrappers like `.optional()`/`.nullable()`;
check names are the method names (`min`, `max`, `length`, `gt`, `gte`, `lt`, `lte`, `regex`, `email`,
`startsWith`, `int`, `refine`, ...). Keys that match nothing throw.

## Example

```ts
import { sql } from 'drizzle-orm';
import { check, integer, pgDomain, pgSchema, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

export const app = pgSchema('app');
export const email = app.domain('email', text().notNull().checkConstraint(sql`VALUE ~ '^[^@]+@[^@]+$'`));
export const positive = pgDomain('positive', integer().checkConstraint(sql`VALUE > 0`));

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	email: email('email'),
	age: positive('age'),
	score: integer('score').checkConstraint(sql`score BETWEEN 0 AND 100`),
});

export const events = pgTable('events', {
	id: serial('id').primaryKey(),
	startsAt: timestamp('starts_at').notNull(),
	endsAt: timestamp('ends_at').notNull(),
}, (t) => [check('events_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`)]);

// issue on endsAt: "Must be after starts at"; a check across columns is addressed by its name alone
const insertEvent = createInsertSchema(events).update({ events_ends_after_starts: 'End after the start' });
```

## Pull naming

`drizzle-kit pull` suffixes schema-scoped entities with their schema (`userRoleInApp`). Set
`introspect: { schemaSuffix: false }` in `drizzle.config.ts` to keep plain names (`userRole`); names must then be
unique across schemas.

## Releasing

```sh
pnpm install && pnpm build
node scripts/release-fork.mjs            # dry run
node scripts/release-fork.mjs --publish --otp=123456  # npm auth for @anthonyalayo + 2FA code
```

Sources keep upstream's package names; the script renames/versions only `dist/package.json`, so
rebasing onto upstream stays conflict-free. See `REVIVAL_TODO.md` for open items.
