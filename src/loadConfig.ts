import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createJiti } from 'jiti';
import type { StilltrueConfig } from './config.ts';

const CANDIDATES = [
  'stilltrue.config.ts',
  'stilltrue.config.mts',
  'stilltrue.config.js',
  'stilltrue.config.mjs',
  'stilltrue.config.cjs',
];

export function findConfigPath(cwd: string, explicit?: string): string {
  if (explicit) {
    const p = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
    if (!existsSync(p)) throw new Error(`config not found: ${p}`);
    return p;
  }
  for (const name of CANDIDATES) {
    const p = join(cwd, name);
    if (existsSync(p)) return p;
  }
  throw new Error(`no stilltrue.config.{ts,js,mjs,cjs} found in ${cwd}`);
}

export async function loadConfig(configPath: string): Promise<{ config: StilltrueConfig; configDir: string }> {
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const config = (await jiti.import(configPath, { default: true })) as StilltrueConfig;
  if (!config || typeof config !== 'object') {
    throw new Error(`config at ${configPath} has no default export object`);
  }
  return { config, configDir: dirname(configPath) };
}
