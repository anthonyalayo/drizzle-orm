#!/usr/bin/env node
// Publishes this fork's packages under the @anthonyalayo scope.
//
// Sources keep upstream's package names (so rebases on drizzle-team/drizzle-orm stay conflict-free);
// only the built dist/package.json is renamed and versioned here, right before packing.
//
// Consume with npm aliases so every `import ... from 'drizzle-orm'` keeps working:
//   "drizzle-orm": "npm:@anthonyalayo/drizzle-orm@^1.2.0"
//   "drizzle-kit": "npm:@anthonyalayo/drizzle-kit@^1.2.0"
//   "drizzle-zod": "npm:@anthonyalayo/drizzle-zod@^1.2.0"
//   "drizzle-seed": "npm:@anthonyalayo/drizzle-seed@^1.2.0"
//
// usage: node scripts/release-fork.mjs [--publish] [--otp=123456]   (default is a dry run)
//        expects packages to be built already (`pnpm build`)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCOPE = '@anthonyalayo';
const VERSION = '1.2.0';
const PACKAGES = ['drizzle-orm', 'drizzle-kit', 'drizzle-zod', 'drizzle-seed'];
const REPO = 'git+https://github.com/anthonyalayo/drizzle-orm.git';

const publish = process.argv.includes('--publish');
const root = new URL('..', import.meta.url).pathname;

for (const pkg of PACKAGES) {
	const dir = join(root, pkg);
	const dist = join(dir, 'dist');
	if (!existsSync(dist)) throw new Error(`${pkg}: dist/ missing, run \`pnpm build\` first`);

	// drizzle-kit's dist has no package.json/README until its own pack step copies them
	if (!existsSync(join(dist, 'package.json'))) copyFileSync(join(dir, 'package.json'), join(dist, 'package.json'));
	if (pkg === 'drizzle-kit') copyFileSync(join(dir, 'README.md'), join(dist, 'README.md'));

	const manifestPath = join(dist, 'package.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	// take upstream name/version/description from the source manifest so re-runs are idempotent
	const source = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
	const upstreamVersion = source.version;
	manifest.name = `${SCOPE}/${pkg}`;
	manifest.version = VERSION;
	manifest.description = `${
		source.description ?? pkg
	} (fork with PostgreSQL domain support, based on ${pkg}@${upstreamVersion})`;
	manifest.repository = { type: 'git', url: REPO };
	// provenance needs a CI OIDC identity; this is published from a workstation
	delete manifest.publishConfig;
	writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');

	for (const f of readdirSync(dir)) if (f.endsWith('.tgz')) rmSync(join(dir, f));
	const tgzName = execFileSync('npm', ['pack', '--pack-destination', dir], { cwd: dist, encoding: 'utf8' })
		.trim()
		.split('\n')
		.pop();
	const tgz = join(dir, tgzName);
	console.log(`${manifest.name}@${VERSION} (upstream ${upstreamVersion}) -> ${tgz}`);

	const args = ['publish', tgz, '--access', 'public'];
	if (!publish) args.push('--dry-run');
	// accounts with 2FA: pass a one-time password, e.g. --otp=123456 (valid ~30s, covers all four publishes)
	const otp = process.argv.find((a) => a.startsWith('--otp='));
	if (otp) args.push(otp);
	// or approve in the browser instead: --auth-type=web (npm prints a URL to approve)
	const authType = process.argv.find((a) => a.startsWith('--auth-type='));
	if (authType) args.push(authType);
	execFileSync('npm', args, { stdio: 'inherit' });
}
