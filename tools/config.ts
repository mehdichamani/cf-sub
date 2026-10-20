import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

export interface TesterConfig {
  xrayPath: string;
  testUrl: string;
  timeoutMs: number;
  concurrency: number;
  chainProxy?: string;
}

const DEFAULT_TEST_URL = 'http://cp.cloudflare.com/generate_204';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CONCURRENCY = 8;

/**
 * Read simple key-value pairs from a file like .env
 */
function readEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

/**
 * Known default locations where Xray might be installed on various systems
 */
const KNOWN_XRAY_PATHS = [
  path.join(os.homedir(), '.local/share/PattN/bin/xray/xray'),
  '/usr/local/bin/xray',
  '/usr/bin/xray',
  '/opt/xray/xray',
  path.join(os.homedir(), '.local/bin/xray'),
  path.join(os.homedir(), 'xray/xray'),
];

/**
 * Resolve the path to the Xray binary
 */
export function resolveXrayPath(customPath?: string): string {
  // 1. Explicit CLI argument or option
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  // 2. Environment variable XRAY_PATH
  const envPath = process.env.XRAY_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  // 3. Check tools/config.json if it exists
  const configFile = path.resolve(process.cwd(), 'tools/config.json');
  if (fs.existsSync(configFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (cfg.xrayPath && fs.existsSync(cfg.xrayPath)) {
        return cfg.xrayPath;
      }
    } catch {
      // Ignore config parse error
    }
  }

  // 4. Try `which xray` in PATH
  try {
    const whichResult = execSync('which xray 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (whichResult && fs.existsSync(whichResult)) {
      return whichResult;
    }
  } catch {
    // which failed, continue
  }

  // 5. Check known system paths
  for (const candidate of KNOWN_XRAY_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `❌ Xray binary not found!\n` +
      `Please provide the path using one of the following:\n` +
      `  1. Environment variable: export XRAY_PATH="/path/to/xray"\n` +
      `  2. CLI argument: pnpm run test-nodes -- --xray-path "/path/to/xray"\n` +
      `  3. In tools/config.json: { "xrayPath": "/path/to/xray" }\n`
  );
}

/**
 * Load tester options from environment and arguments
 */
export function loadTesterConfig(args: string[]): TesterConfig {
  const envVars = readEnvFile(path.resolve(process.cwd(), '.env'));

  let customXrayPath: string | undefined;
  let testUrl = process.env.TEST_URL || envVars.TEST_URL || DEFAULT_TEST_URL;
  let timeoutMs = parseInt(process.env.TEST_TIMEOUT_MS || envVars.TEST_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10);
  let concurrency = parseInt(process.env.TEST_CONCURRENCY || envVars.TEST_CONCURRENCY || String(DEFAULT_CONCURRENCY), 10);
  let chainProxy = process.env.CHAIN_PROXY || envVars.CHAIN_PROXY || undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--xray-path' && args[i + 1]) {
      customXrayPath = args[i + 1];
      i++;
    } else if (args[i] === '--timeout' && args[i + 1]) {
      timeoutMs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      concurrency = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--test-url' && args[i + 1]) {
      testUrl = args[i + 1];
      i++;
    } else if (args[i] === '--chain' || args[i] === '--chain-proxy') {
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        chainProxy = args[i + 1];
        i++;
      } else {
        // Flag passed without value, use whatever is in CHAIN_PROXY / env
        chainProxy = chainProxy || 'socks5://127.0.0.1:10808';
      }
    } else if (args[i] === '--no-chain') {
      chainProxy = undefined;
    }
  }

  const xrayPath = resolveXrayPath(customXrayPath);

  return {
    xrayPath,
    testUrl,
    timeoutMs,
    concurrency,
    chainProxy: chainProxy?.trim() || undefined,
  };
}
