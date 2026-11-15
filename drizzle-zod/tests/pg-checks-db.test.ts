// Differential test: every value is checked by postgres (PGlite) and by the generated zod schema,
// and both must agree. Constraints the evaluator doesn't model may only ever be looser in zod.
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { bigint, integer, numeric, type PgColumnBuilder, pgDomain, pgTable, text } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { z } from 'zod/v4';
import { createInsertSchema } from '../src';

type Case = { sqlType: string; builder: () => PgColumnBuilder<any, any>; check: string; values: unknown[] };

const long = (n: number, ch = 'a') => ch.repeat(n);
const exact: Case[] = [
	{
		sqlType: 'text',
		builder: () => text(),
		check: 'length(TRIM(BOTH FROM VALUE)) >= 1 AND length(TRIM(BOTH FROM VALUE)) <= 100',
		values: [
			'',
			' ',
			'   ',
			'a',
			' a ',
			'\t',
			'\n',
			long(100),
			` ${long(100)} `,
			long(101),
			long(100, '😀'),
			long(101, '😀'),
		],
	},
	{
		sqlType: 'text',
		builder: () => text(),
		check: 'length(trim(VALUE)) BETWEEN 2 AND 5',
		values: ['a', ' a ', 'ab', '  ab  ', 'abcde', 'abcdef', '😀😀😀😀😀'],
	},
	{ sqlType: 'text', builder: () => text(), check: "VALUE ~ '^[A-Z]+$'", values: ['ABC', 'abc', '', 'AbC'] },
	{ sqlType: 'text', builder: () => text(), check: "VALUE ~* '^[a-z]+$'", values: ['ABC', 'abc', 'a1'] },
	{ sqlType: 'text', builder: () => text(), check: "VALUE !~ '\\d'", values: ['abc', 'a1'] },
	{
		sqlType: 'text',
		builder: () => text(),
		check: "VALUE LIKE '%@%.%'",
		values: ['a@b.c', 'ab', 'a@b', '@.', 'A@B.C'],
	},
	{ sqlType: 'text', builder: () => text(), check: "VALUE ILIKE 'x_%'", values: ['X1', 'x', 'yx', 'xy'] },
	{ sqlType: 'text', builder: () => text(), check: "VALUE NOT LIKE '% %'", values: ['ab', 'a b'] },
	{
		sqlType: 'text',
		builder: () => text(),
		check: "VALUE LIKE 'ab-%' AND VALUE !~ '[-]x'",
		values: ['ab-1', 'ab1', 'ab--x', 'ab-'],
	},
	{
		sqlType: 'text',
		builder: () => text(),
		check: "VALUE IN ('active', 'it''s')",
		values: ['active', "it's", 'other', ''],
	},
	{ sqlType: 'text', builder: () => text(), check: "VALUE <> ''", values: ['', 'a', ' '] },
	{ sqlType: 'text', builder: () => text(), check: "trim(VALUE) <> ''", values: ['', '  ', ' a', '\t'] },
	{
		sqlType: 'text',
		builder: () => text(),
		check: 'length(VALUE) >= 3 AND length(VALUE) <= 5',
		values: ['ab', 'abc', 'abcde', 'abcdef', '😀😀😀', '😀😀😀😀😀😀'],
	},
	{ sqlType: 'text', builder: () => text(), check: 'lower(VALUE) = VALUE', values: ['abc', 'Abc', '123'] },
	{
		sqlType: 'text',
		builder: () => text(),
		check: "char_length(VALUE) < 4 OR VALUE LIKE 'long%'",
		values: ['abc', 'abcd', 'longer', 'xlong'],
	},
	{ sqlType: 'text', builder: () => text(), check: 'VALUE IS NOT NULL AND length(VALUE) > 0', values: ['', 'a'] },
	{ sqlType: 'integer', builder: () => integer(), check: 'VALUE < 0 OR VALUE > 100', values: [-1, 0, 50, 100, 101] },
	{ sqlType: 'integer', builder: () => integer(), check: 'VALUE BETWEEN 18 AND 130', values: [17, 18, 130, 131] },
	{ sqlType: 'integer', builder: () => integer(), check: 'VALUE <> 7', values: [6, 7, 8] },
	{ sqlType: 'integer', builder: () => integer(), check: 'VALUE >= -10 AND VALUE < 7.9', values: [-11, -10, 7, 8] },
	{ sqlType: 'integer', builder: () => integer(), check: 'NOT (VALUE BETWEEN 1 AND 5)', values: [0, 1, 5, 6] },
	{ sqlType: 'integer', builder: () => integer(), check: '10 > VALUE', values: [9, 10] },
	{ sqlType: 'integer', builder: () => integer(), check: 'VALUE IN (1, 2, 3)', values: [0, 1, 3, 4] },
	{
		sqlType: 'numeric',
		builder: () => numeric(),
		check: 'VALUE >= 0.01 AND VALUE <= 999999.99',
		values: ['0', '0.00', '0.01', '0.010', '0.0099999', '999999.99', '1000000', '-1'],
	},
	{ sqlType: 'bigint', builder: () => bigint({ mode: 'bigint' }), check: 'VALUE > 10.5', values: [10n, 11n] },
	{
		sqlType: 'bigint',
		builder: () => bigint({ mode: 'bigint' }),
		check: 'VALUE <= -2.5',
		values: [-2n, -3n, -9223372036854775807n],
	},
];

// not modelled: zod must accept everything postgres accepts (and may accept more)
const looser: Case[] = [
	{ sqlType: 'text', builder: () => text(), check: "VALUE > 'm'", values: ['a', 'z'] },
	{ sqlType: 'text', builder: () => text(), check: "VALUE ~ '\\mword\\M'", values: ['a word here', 'swordfish'] },
	{ sqlType: 'text', builder: () => text(), check: "md5(VALUE) <> ''", values: ['a'] },
];

let db: PGlite;
beforeAll(async () => {
	db = new PGlite();
});
afterAll(async () => {
	await db.close();
});

async function postgresAccepts(domain: string, value: unknown): Promise<boolean> {
	try {
		await db.query(`SELECT $1::${domain}`, [typeof value === 'bigint' ? value.toString() : value]);
		return true;
	} catch (e: any) {
		if (e?.code === '23514') return false; // check_violation
		throw e;
	}
}

async function run(cases: Case[], prefix: string, mode: 'exact' | 'looser') {
	for (const [i, c] of cases.entries()) {
		const domain = `${prefix}${i}`;
		await db.exec(`CREATE DOMAIN ${domain} AS ${c.sqlType} CHECK (${c.check});`);
		const d = pgDomain(domain, c.builder().checkConstraint(sql.raw(c.check)));
		// tables are built dynamically here, so their static type is unknown
		const field = (createInsertSchema(pgTable(`t_${domain}`, { v: d('v') as any })) as any).shape['v'] as z.ZodType;
		for (const value of c.values) {
			const pg = await postgresAccepts(domain, value);
			const zod = field.safeParse(value).success;
			const label = `${c.check} with ${JSON.stringify(typeof value === 'bigint' ? `${value}n` : value)}`;
			if (mode === 'exact') expect(zod, label).toBe(pg);
			else if (pg) expect(zod, label).toBe(true);
		}
	}
}

describe('CHECK constraints in zod agree with postgres', () => {
	test('modelled expressions match exactly', () => run(exact, 'dx', 'exact'));
	test('unmodelled expressions are never stricter', () => run(looser, 'dl', 'looser'));
});

test('rules are labelled with the constraint name and have readable default messages', () => {
	const limitedText = pgDomain(
		'limited_text',
		text()
			.notNull()
			.checkConstraint(
				'limited_text_check',
				sql`CHECK (((length(TRIM(BOTH FROM VALUE)) >= 1) AND (length(TRIM(BOTH FROM VALUE)) <= 100)))`,
			),
	);
	const users = pgTable('users', {
		firstName: limitedText('first_name'),
		age: integer('age').checkConstraint(sql`age >= 18`),
		code: text('code').checkConstraint(sql`code ~ '^[A-Z]{3}$'`),
	});
	const base = createInsertSchema(users);
	const issues = (s: typeof base, v: unknown) => s.safeParse(v).error?.issues.map((i) => i.message);

	expect(issues(base, { firstName: '   ', age: 17, code: 'ab' })).toEqual([
		'Must be at least 1 character, not counting leading or trailing spaces',
		'Too small: expected number to be >=18',
		'Invalid string: must match pattern /^[A-Z]{3}$/u',
	]);

	// zero-config names: the domain's named check, and drizzle-kit's default name for the unnamed column checks
	const friendly = base.update({
		'firstName.limited_text_check': 'Enter a first name (up to 100 characters)',
		'age.users_age_check': 'You must be 18 or older',
		'code.users_code_check': 'Use three capital letters',
	});
	expect(issues(friendly, { firstName: '', age: 17, code: 'ab' })).toEqual([
		'Enter a first name (up to 100 characters)',
		'You must be 18 or older',
		'Use three capital letters',
	]);
	expect(issues(friendly, { firstName: long(101), age: 18, code: 'ABC' })).toEqual([
		'Enter a first name (up to 100 characters)',
	]);
	expect(friendly.safeParse({ firstName: ` ${long(100)} `, age: 18, code: 'ABC' }).success).toBe(true);
});
