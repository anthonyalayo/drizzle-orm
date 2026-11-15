// requires zod from @anthonyalayo/zod (schema.update(), see colinhacks/zod#6758)
import { type Equal, sql } from 'drizzle-orm';
import { integer, pgDomain, pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema } from '../src';
import { Expect } from './utils.ts';

const messages = (schema: { safeParse: (v: unknown) => any }, data: unknown): string[] | undefined =>
	schema.safeParse(data).error?.issues.map((i: { message: string }) => i.message);

test('override messages of generated schemas, including CHECK-derived rules', () => {
	const email = pgDomain('email', text().notNull().checkConstraint(sql`VALUE ~ '^[^@]+@[^@]+$'`));
	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		firstName: varchar('first_name', { length: 24 }).notNull().checkConstraint(sql`length(first_name) >= 3`),
		age: integer('age').checkConstraint(sql`age BETWEEN 18 AND 130`),
		email: email('email'),
	});

	const base = createInsertSchema(users);
	const insert = base.update({
		'firstName.min': 'too short',
		'firstName.max': 'too long',
		'age.min.18': 'must be an adult',
		'age.max.130': 'not a real age',
		'email.regex': 'not an email',
		age: 'age must be a number',
	});
	Expect<Equal<typeof insert, typeof base>>();

	expect(messages(insert, { firstName: 'ab', age: 3, email: 'x' })).toEqual([
		'too short',
		'must be an adult',
		'not an email',
	]);
	expect(messages(insert, { firstName: 'a'.repeat(25), age: 131, email: 'a@b' })).toEqual([
		'too long',
		'not a real age',
	]);
	expect(messages(insert, { firstName: 'abc', age: 'old', email: 'a@b' })).toEqual(['age must be a number']);
	expect(insert.parse({ firstName: 'abc', email: 'a@b' })).toEqual({ firstName: 'abc', email: 'a@b' });

	// the original schema keeps zod's default messages
	expect(messages(base, { firstName: 'ab', email: 'a@b' })?.[0]).not.toBe('too short');
	// the select schema can be updated independently
	expect(messages(createSelectSchema(users).update({ 'age.min.18': 'adult' }), {
		id: 1,
		firstName: 'abc',
		age: 1,
		email: 'a@b',
	})).toEqual(['adult']);
});

test('unknown keys are rejected so typos surface immediately', () => {
	const t = pgTable('t', { name: text('name').notNull() });
	expect(() => createInsertSchema(t).update({ 'name.min': 'x' })).toThrow('no "min" check found for "name.min"');
});
