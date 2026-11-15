# @anthonyalayo/drizzle-* fork

Upstream [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) `main` (drizzle-orm 0.45.x line) plus:

- **PostgreSQL domains**: `pgDomain(name, builder)` / `pgSchema(...).domain(name, builder)`, usable as columns,
  arrays, and bases of other domains; supported by drizzle-kit `generate` / `migrate` / `push` / `pull` / `export`
  (create, alter default / not null / checks, rename, move schema, drop) and drizzle-seed.
- **Column-level checks**: `integer().checkConstraint(sql\`...\`)` (named or unnamed) become table constraints.
- **drizzle-zod rules derived from CHECK constraints** (ranges, lengths, `~`/`~*`, `LIKE`/`ILIKE`, `IN`, `<> ''`).
  Derived rules may be looser than the database but never stricter.

## Install

Use npm aliases so all imports (`drizzle-orm`, `drizzle-orm/pg-core`, `drizzle-kit`, ...) stay unchanged:

```json
{
	"dependencies": {
		"drizzle-orm": "npm:@anthonyalayo/drizzle-orm@^1.1.0",
		"drizzle-zod": "npm:@anthonyalayo/drizzle-zod@^1.1.0",
		"drizzle-seed": "npm:@anthonyalayo/drizzle-seed@^1.1.0"
	},
	"devDependencies": {
		"drizzle-kit": "npm:@anthonyalayo/drizzle-kit@^1.1.0"
	}
}
```

drizzle-zod 1.1.x targets zod v4 (`zod@^3.25` provides it via `zod/v4`).

## Example

```ts
import { sql } from 'drizzle-orm';
import { integer, pgDomain, pgSchema, pgTable, serial, text } from 'drizzle-orm/pg-core';

export const app = pgSchema('app');
export const email = app.domain('email', text().notNull().checkConstraint(sql`VALUE ~ '^[^@]+@[^@]+$'`));
export const positive = pgDomain('positive', integer().checkConstraint(sql`VALUE > 0`));

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	email: email('email'),
	age: positive('age'),
	score: integer('score').checkConstraint(sql`score BETWEEN 0 AND 100`),
});
```

## Releasing

```sh
pnpm install && pnpm build
node scripts/release-fork.mjs            # dry run
node scripts/release-fork.mjs --publish --otp=123456  # npm auth for @anthonyalayo + 2FA code
```

Sources keep upstream's package names; the script renames/versions only `dist/package.json`, so
rebasing onto upstream stays conflict-free. See `REVIVAL_TODO.md` for open items.
