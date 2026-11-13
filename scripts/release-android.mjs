#!/usr/bin/env node
/**
 * APK de release de Sonaura, firmados con la clave propia (no con la de depuración de la plantilla).
 *
 *   node scripts/release-android.mjs            # los dos: arm64 y universal
 *   node scripts/release-android.mjs arm64      # solo uno
 *
 * Deja en dist/release/ los archivos con el nombre fijo que enlaza la web (src/lib/releases.ts):
 *   Sonaura-android.apk            teléfonos de 64 bits (arm64-v8a)
 *   Sonaura-android-universal.apk  todas las arquitecturas
 *
 * La clave vive fuera del repo: %USERPROFILE%\.sonaura-firma\sonaura-release.properties (+ .jks),
 * o la carpeta que diga SONAURA_FIRMA. Ver docs/publicar-version.md.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'dist', 'release');
const isWindows = process.platform === 'win32';

const VARIANTS = {
  arm64: { file: 'Sonaura-android.apk', gradleArgs: ['-PreactNativeArchitectures=arm64-v8a'] },
  universal: { file: 'Sonaura-android-universal.apk', gradleArgs: [] },
};

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`\n› ${cmd} ${args.join(' ')}`);
  // En Windows los .bat/.cmd necesitan la shell.
  execFileSync(cmd, args, { stdio: 'inherit', shell: isWindows && /\.(bat|cmd)$/i.test(cmd), ...opts });
}

function signingConfig() {
  const dir = process.env.SONAURA_FIRMA || join(homedir(), '.sonaura-firma');
  const file = join(dir, 'sonaura-release.properties');
  if (!existsSync(file)) fail(`No encuentro la clave de firma: ${file}`);
  const props = Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
  const keystore = join(dir, props.storeFile || 'sonaura-release.jks');
  if (!existsSync(keystore) || !props.storePassword || !props.keyAlias) fail(`Clave incompleta en ${dir}`);
  return { keystore, alias: props.keyAlias, password: props.storePassword };
}

function buildTools() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  const dir = join(sdk, 'build-tools');
  if (!existsSync(dir)) fail(`No encuentro el SDK de Android en ${sdk} (ANDROID_HOME).`);
  const latest = readdirSync(dir)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .pop();
  if (!latest) fail(`No hay build-tools en ${dir}`);
  const ext = isWindows ? '.bat' : '';
  return { zipalign: join(dir, latest, `zipalign${isWindows ? '.exe' : ''}`), apksigner: join(dir, latest, `apksigner${ext}`) };
}

const requested = process.argv.slice(2);
const variants = requested.length ? requested : Object.keys(VARIANTS);
for (const v of variants) if (!VARIANTS[v]) fail(`Variante desconocida: ${v} (arm64 | universal)`);

const signing = signingConfig();
const tools = buildTools();
mkdirSync(out, { recursive: true });

// Aplica app.json (versión, versionCode, plugins) a android/ sin borrar la caché de compilación.
run('npx', ['expo', 'prebuild', '-p', 'android', '--no-install'], { cwd: root, shell: isWindows });

const gradlew = join(root, 'android', isWindows ? 'gradlew.bat' : 'gradlew');
const built = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

for (const name of variants) {
  const variant = VARIANTS[name];
  rmSync(built, { force: true });
  run(gradlew, ['assembleRelease', ...variant.gradleArgs], { cwd: join(root, 'android') });
  if (!existsSync(built)) fail('Gradle no generó app-release.apk');

  const aligned = join(out, `${name}.aligned.apk`);
  const target = join(out, variant.file);
  run(tools.zipalign, ['-p', '-f', '4', built, aligned]);
  // apksigner reemplaza la firma de depuración por la propia. La contraseña va por variable de entorno.
  run(tools.apksigner, ['sign', '--ks', signing.keystore, '--ks-key-alias', signing.alias, '--ks-pass', 'env:SONAURA_KS_PASS', '--out', target, aligned], {
    env: { ...process.env, SONAURA_KS_PASS: signing.password },
  });
  rmSync(aligned, { force: true });
  rmSync(`${target}.idsig`, { force: true });
  run(tools.apksigner, ['verify', '--print-certs', target]);
  console.log(`\n✓ ${target}`);
}
