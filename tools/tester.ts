import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, ChildProcess } from 'node:child_process';
import { parseUriToOutbound } from './xray-converter.ts';
import { countryCodeToEmoji, getCountryName, extractGeoFromRemark, type GeoLocation } from './geo.ts';
import { loadTesterConfig, type TesterConfig } from './config.ts';

export interface TestResult {
  raw: string;
  originalRemark: string;
  protocol: string;
  alive: boolean;
  latencyMs: number;
  geo?: GeoLocation;
  newRaw?: string;
  error?: string;
}

/**
 * Execute HTTP GET request through an HTTP proxy port with precise timing
 */
function testHttpViaProxy(
  proxyPort: number,
  targetUrl: string,
  timeoutMs: number
): Promise<{ success: boolean; latencyMs: number; body: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(targetUrl);

    const req = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        method: 'GET',
        path: url.href,
        headers: {
          Host: url.host,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const latencyMs = Date.now() - startTime;
          resolve({
            success: res.statusCode !== undefined && res.statusCode < 500,
            latencyMs,
            body: data,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, latencyMs: timeoutMs, body: '' });
    });

    req.on('error', () => {
      resolve({ success: false, latencyMs: timeoutMs, body: '' });
    });

    req.end();
  });
}

/**
 * Fetch IP information through the proxy
 */
async function fetchIpInfo(proxyPort: number, timeoutMs: number): Promise<GeoLocation | null> {
  const ipEndpoints = ['http://ip-api.com/json', 'http://api.ipify.org'];

  for (const endpoint of ipEndpoints) {
    const res = await testHttpViaProxy(proxyPort, endpoint, timeoutMs);
    if (res.success && res.body) {
      try {
        if (endpoint.includes('ip-api.com')) {
          const json = JSON.parse(res.body);
          if (json.status === 'success' && json.countryCode) {
            return {
              ip: json.query,
              countryCode: json.countryCode,
              countryName: json.country || getCountryName(json.countryCode),
              city: json.city,
              flagEmoji: countryCodeToEmoji(json.countryCode),
            };
          }
        } else {
          const ip = res.body.trim();
          if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
            return {
              ip,
              countryCode: 'XX',
              countryName: 'Proxy',
              flagEmoji: '🌐',
            };
          }
        }
      } catch {
        // Fallback to next
      }
    }
  }

  return null;
}

/**
 * Test a single node with an ephemeral Xray instance
 */
async function testSingleNode(
  nodeUri: string,
  config: TesterConfig,
  assignedPort: number
): Promise<TestResult> {
  const match = nodeUri.match(/^([a-zA-Z0-9_\-]+):\/\//);
  const protocol = match ? match[1].toLowerCase() : 'unknown';
  let originalRemark = '';
  const hashIdx = nodeUri.indexOf('#');
  if (hashIdx !== -1) {
    try {
      originalRemark = decodeURIComponent(nodeUri.slice(hashIdx + 1).trim());
    } catch {
      originalRemark = nodeUri.slice(hashIdx + 1).trim();
    }
  }

  const outbound = parseUriToOutbound(nodeUri);
  if (!outbound) {
    return {
      raw: nodeUri,
      originalRemark,
      protocol,
      alive: false,
      latencyMs: 9999,
      error: 'Unsupported or unparseable protocol',
    };
  }

  const outbounds: any[] = [];

  if (config.chainProxy) {
    // Chain mode in modern Xray:
    // Inbound -> First Outbound (Entry / Landing Proxy) -> dials via node outbound (Exit)
    // OR Inbound -> Node Outbound -> dials via Landing Proxy (chain-landing)
    const chainOutbound = parseUriToOutbound(config.chainProxy, 'chain-landing');
    if (chainOutbound) {
      // Landing proxy dials through the node under test
      chainOutbound.streamSettings = chainOutbound.streamSettings || {};
      chainOutbound.streamSettings.sockopt = chainOutbound.streamSettings.sockopt || {};
      chainOutbound.streamSettings.sockopt.dialerProxy = 'proxy';

      outbounds.push(chainOutbound);
      outbounds.push(outbound);
    } else {
      outbounds.push(outbound);
    }
  } else {
    outbounds.push(outbound);
  }

  outbounds.push({ protocol: 'freedom', tag: 'direct' });

  const xrayConfig = {
    log: { loglevel: 'none' },
    inbounds: [
      {
        port: assignedPort,
        listen: '127.0.0.1',
        protocol: 'http',
        settings: { timeout: config.timeoutMs / 1000 },
      },
    ],
    outbounds,
  };

  const tmpConfigPath = path.join(
    '/tmp',
    `xray-test-${assignedPort}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.json`
  );

  fs.writeFileSync(tmpConfigPath, JSON.stringify(xrayConfig));

  let xrayProcess: ChildProcess | null = null;
  try {
    xrayProcess = spawn(config.xrayPath, ['run', '-c', tmpConfigPath], {
      stdio: 'ignore',
    });

    // Give Xray 100ms to bind to the port
    await new Promise((r) => setTimeout(r, 120));

    // Test connectivity
    const probe = await testHttpViaProxy(assignedPort, config.testUrl, config.timeoutMs);

    if (!probe.success) {
      return {
        raw: nodeUri,
        originalRemark,
        protocol,
        alive: false,
        latencyMs: config.timeoutMs,
        error: 'Connection timed out or refused',
      };
    }

    // Node is alive! Let's check GeoIP (remote probe or fallback to original remark)
    let geo = await fetchIpInfo(assignedPort, Math.min(config.timeoutMs, 3000));
    if (!geo || geo.countryCode === 'XX') {
      const deduced = extractGeoFromRemark(originalRemark);
      if (deduced) {
        geo = deduced;
      }
    }

    return {
      raw: nodeUri,
      originalRemark,
      protocol,
      alive: true,
      latencyMs: probe.latencyMs,
      geo: geo || undefined,
    };
  } catch (err: any) {
    return {
      raw: nodeUri,
      originalRemark,
      protocol,
      alive: false,
      latencyMs: 9999,
      error: err.message,
    };
  } finally {
    if (xrayProcess) {
      try {
        xrayProcess.kill('SIGKILL');
      } catch {}
    }
    try {
      if (fs.existsSync(tmpConfigPath)) fs.unlinkSync(tmpConfigPath);
    } catch {}
  }
}

/**
 * Run tests concurrently across all nodes
 */
export async function curateNodes(
  nodeUris: string[],
  config: TesterConfig
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const basePort = 19100 + Math.floor(Math.random() * 500);

  console.log(`\n🔍 Found ${nodeUris.length} nodes to test.`);
  console.log(`⚡ Concurrency: ${config.concurrency} | Timeout: ${config.timeoutMs}ms`);
  console.log(`⚙️  Xray Binary: ${config.xrayPath}`);
  if (config.chainProxy) {
    console.log(`🔗 Mode: CHAIN via Landing Proxy (${config.chainProxy})\n`);
  } else {
    console.log(`🌐 Mode: DIRECT\n`);
  }

  let completed = 0;
  let activeWorkers = 0;
  let nextIdx = 0;

  return new Promise((resolve) => {
    function dispatch() {
      if (nextIdx >= nodeUris.length && activeWorkers === 0) {
        resolve(results);
        return;
      }

      while (activeWorkers < config.concurrency && nextIdx < nodeUris.length) {
        const idx = nextIdx++;
        const port = basePort + (idx % (config.concurrency * 2));
        const uri = nodeUris[idx];
        activeWorkers++;

        testSingleNode(uri, config, port)
          .then((res) => {
            results.push(res);
            completed++;
            const pct = Math.round((completed / nodeUris.length) * 100);
            const statusIcon = res.alive ? '✅' : '❌';
            const info = res.alive
              ? `${res.geo?.flagEmoji || '⚡'} ${res.latencyMs}ms (${res.geo?.countryCode || 'OK'})`
              : 'DEAD';

            process.stdout.write(
              `\r[${completed}/${nodeUris.length}] (${pct}%) ${statusIcon} Node #${idx + 1}: ${info.padEnd(25)}`
            );
          })
          .catch((err) => {
            results.push({
              raw: uri,
              originalRemark: '',
              protocol: 'unknown',
              alive: false,
              latencyMs: 9999,
              error: err.message,
            });
            completed++;
          })
          .finally(() => {
            activeWorkers--;
            dispatch();
          });
      }
    }

    dispatch();
  });
}
