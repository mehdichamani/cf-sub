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
  tag?: string;
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
 * Test a single node URI with an ephemeral Xray instance
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

  return runOutboundTestWithXray(outbound, nodeUri, originalRemark, protocol, config, assignedPort);
}

/**
 * Run test with Xray using an outbound object
 */
async function runOutboundTestWithXray(
  outbound: any,
  raw: string,
  originalRemark: string,
  protocol: string,
  config: TesterConfig,
  assignedPort: number
): Promise<TestResult> {
  const outbounds: any[] = [];

  if (config.chainProxy) {
    const chainOutbound = parseUriToOutbound(config.chainProxy, 'chain-landing');
    if (chainOutbound) {
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
    const env = {
      ...process.env,
      XRAY_LOCATION_ASSET: process.env.XRAY_LOCATION_ASSET || '/home/unreal/.local/share/PattN/bin',
    };

    xrayProcess = spawn(config.xrayPath, ['run', '-c', tmpConfigPath], {
      env,
      stdio: 'ignore',
    });

    await new Promise((r) => setTimeout(r, 120));

    const probe = await testHttpViaProxy(assignedPort, config.testUrl, config.timeoutMs);

    if (!probe.success) {
      return {
        raw,
        originalRemark,
        protocol,
        alive: false,
        latencyMs: config.timeoutMs,
        error: 'Connection timed out or refused',
        tag: outbound.tag,
      };
    }

    let geo = await fetchIpInfo(assignedPort, Math.min(config.timeoutMs, 3000));
    if (!geo || geo.countryCode === 'XX') {
      const deduced = extractGeoFromRemark(originalRemark);
      if (deduced) {
        geo = deduced;
      }
    }

    return {
      raw,
      originalRemark,
      protocol,
      alive: true,
      latencyMs: probe.latencyMs,
      geo: geo || undefined,
      tag: outbound.tag,
    };
  } catch (err: any) {
    return {
      raw,
      originalRemark,
      protocol,
      alive: false,
      latencyMs: 9999,
      error: err.message,
      tag: outbound.tag,
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
 * Test a sing-box outbound directly using sing-box binary
 */
async function testSingleSingboxOutbound(
  outbound: any,
  config: TesterConfig,
  assignedPort: number
): Promise<TestResult> {
  const protocol = outbound.type || 'vless';
  const originalRemark = outbound.tag || '';
  const raw = outbound.tag || '';

  if (!config.singboxPath) {
    return {
      raw,
      originalRemark,
      protocol,
      alive: false,
      latencyMs: 9999,
      error: 'Sing-box binary not found',
      tag: outbound.tag,
    };
  }

  const sbConfig = {
    log: { level: 'warn' },
    inbounds: [
      {
        type: 'mixed',
        listen: '127.0.0.1',
        listen_port: assignedPort,
      },
    ],
    outbounds: [outbound],
  };

  const tmpConfigPath = path.join(
    '/tmp',
    `singbox-test-${assignedPort}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.json`
  );

  fs.writeFileSync(tmpConfigPath, JSON.stringify(sbConfig, null, 2));

  let sbProcess: ChildProcess | null = null;
  try {
    sbProcess = spawn(config.singboxPath, ['run', '-c', tmpConfigPath], {
      stdio: 'ignore',
    });

    await new Promise((r) => setTimeout(r, 120));

    const probe = await testHttpViaProxy(assignedPort, config.testUrl, config.timeoutMs);

    if (!probe.success) {
      return {
        raw,
        originalRemark,
        protocol,
        alive: false,
        latencyMs: config.timeoutMs,
        error: 'Connection timed out or refused',
        tag: outbound.tag,
      };
    }

    let geo = await fetchIpInfo(assignedPort, Math.min(config.timeoutMs, 3000));
    if (!geo || geo.countryCode === 'XX') {
      const deduced = extractGeoFromRemark(originalRemark);
      if (deduced) geo = deduced;
    }

    return {
      raw,
      originalRemark,
      protocol,
      alive: true,
      latencyMs: probe.latencyMs,
      geo: geo || undefined,
      tag: outbound.tag,
    };
  } catch (err: any) {
    return {
      raw,
      originalRemark,
      protocol,
      alive: false,
      latencyMs: 9999,
      error: err.message,
      tag: outbound.tag,
    };
  } finally {
    if (sbProcess) {
      try {
        sbProcess.kill('SIGKILL');
      } catch {}
    }
    try {
      if (fs.existsSync(tmpConfigPath)) fs.unlinkSync(tmpConfigPath);
    } catch {}
  }
}

/**
 * Run tests concurrently across all nodes (URIs)
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

/**
 * Curate and test an Xray full JSON config
 */
export async function curateXrayJson(
  configObj: any,
  config: TesterConfig
): Promise<{ results: TestResult[]; enhancedConfig: any }> {
  const proxyOutbounds = (configObj.outbounds || []).filter((o: any) =>
    ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks'].includes(o.protocol)
  );

  const basePort = 19600 + Math.floor(Math.random() * 300);
  const results: TestResult[] = [];
  let completed = 0;

  console.log(`\n🔍 Found ${proxyOutbounds.length} proxy outbounds in Xray config to test.`);

  for (let i = 0; i < proxyOutbounds.length; i++) {
    const outbound = proxyOutbounds[i];
    const port = basePort + (i % 8);
    const res = await runOutboundTestWithXray(
      outbound,
      outbound.tag || `proxy-${i + 1}`,
      outbound.tag || '',
      outbound.protocol,
      config,
      port
    );
    results.push(res);
    completed++;
    const pct = Math.round((completed / proxyOutbounds.length) * 100);
    const statusIcon = res.alive ? '✅' : '❌';
    const info = res.alive
      ? `${res.geo?.flagEmoji || '⚡'} ${res.latencyMs}ms (${res.geo?.countryCode || 'OK'})`
      : 'DEAD';

    process.stdout.write(
      `\r[${completed}/${proxyOutbounds.length}] (${pct}%) ${statusIcon} Outbound #${i + 1}: ${info.padEnd(25)}`
    );
  }

  // Filter healthy outbounds and sort ascending by latency
  const aliveResults = results
    .filter((r) => r.alive)
    .sort((a, b) => a.latencyMs - b.latencyMs);

  const aliveTags = new Set(aliveResults.map((r) => r.tag));
  const newOutbounds: any[] = [];

  // Re-format tags with clean sorted remarks
  aliveResults.forEach((res, idx) => {
    const orig = proxyOutbounds.find((o: any) => o.tag === res.tag);
    if (!orig) return;
    const cloned = JSON.parse(JSON.stringify(orig));
    const orderNum = String(idx + 1).padStart(2, '0');
    const flag = res.geo?.flagEmoji || '🌐';
    const countryCode = res.geo?.countryCode && res.geo.countryCode !== 'XX' ? res.geo.countryCode : 'Proxy';
    const city = res.geo?.city ? ` - ${res.geo.city}` : '';
    const newTag = `${flag} ${countryCode}${city} | ${res.latencyMs}ms #${orderNum}`;
    cloned.tag = newTag;
    newOutbounds.push(cloned);
  });

  // Keep non-proxy outbounds (direct, block, dns-out, etc.)
  (configObj.outbounds || []).forEach((o: any) => {
    if (!['vless', 'vmess', 'trojan', 'shadowsocks', 'socks'].includes(o.protocol)) {
      newOutbounds.push(o);
    }
  });

  const enhancedConfig = JSON.parse(JSON.stringify(configObj));
  enhancedConfig.outbounds = newOutbounds;

  return { results, enhancedConfig };
}

/**
 * Curate and test a Sing-box full JSON config
 */
export async function curateSingboxJson(
  configObj: any,
  config: TesterConfig
): Promise<{ results: TestResult[]; enhancedConfig: any }> {
  const proxyOutbounds = (configObj.outbounds || []).filter((o: any) =>
    ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'hysteria2', 'tuic'].includes(o.type)
  );

  const basePort = 19900 + Math.floor(Math.random() * 300);
  const results: TestResult[] = [];
  let completed = 0;

  console.log(`\n🔍 Found ${proxyOutbounds.length} proxy outbounds in Sing-box config to test.`);

  for (let i = 0; i < proxyOutbounds.length; i++) {
    const outbound = proxyOutbounds[i];
    const port = basePort + (i % 8);
    const res = await testSingleSingboxOutbound(outbound, config, port);
    results.push(res);
    completed++;
    const pct = Math.round((completed / proxyOutbounds.length) * 100);
    const statusIcon = res.alive ? '✅' : '❌';
    const info = res.alive
      ? `${res.geo?.flagEmoji || '⚡'} ${res.latencyMs}ms (${res.geo?.countryCode || 'OK'})`
      : 'DEAD';

    process.stdout.write(
      `\r[${completed}/${proxyOutbounds.length}] (${pct}%) ${statusIcon} Outbound #${i + 1}: ${info.padEnd(25)}`
    );
  }

  // Filter healthy outbounds and sort ascending by latency
  const aliveResults = results
    .filter((r) => r.alive)
    .sort((a, b) => a.latencyMs - b.latencyMs);

  const tagMap = new Map<string, string>(); // oldTag -> newTag
  const newProxyOutbounds: any[] = [];

  aliveResults.forEach((res, idx) => {
    const orig = proxyOutbounds.find((o: any) => o.tag === res.tag);
    if (!orig) return;
    const cloned = JSON.parse(JSON.stringify(orig));
    const orderNum = String(idx + 1).padStart(2, '0');
    const flag = res.geo?.flagEmoji || '🌐';
    const countryCode = res.geo?.countryCode && res.geo.countryCode !== 'XX' ? res.geo.countryCode : 'Proxy';
    const city = res.geo?.city ? ` - ${res.geo.city}` : '';
    const newTag = `${flag} ${countryCode}${city} | ${res.latencyMs}ms #${orderNum}`;
    tagMap.set(orig.tag, newTag);
    cloned.tag = newTag;
    newProxyOutbounds.push(cloned);
  });

  const enhancedConfig = JSON.parse(JSON.stringify(configObj));
  const newOutbounds: any[] = [...newProxyOutbounds];

  // Update selectors / urltest groups to point to only healthy outbounds
  (configObj.outbounds || []).forEach((o: any) => {
    if (['selector', 'urltest'].includes(o.type)) {
      const cloned = JSON.parse(JSON.stringify(o));
      if (Array.isArray(cloned.outbounds)) {
        cloned.outbounds = cloned.outbounds
          .map((t: string) => tagMap.get(t) || t)
          .filter((t: string) => {
            // Keep if it is one of the new alive proxy tags or another selector/special tag
            if (Array.from(tagMap.values()).includes(t)) return true;
            return !proxyOutbounds.some((po: any) => po.tag === t);
          });
      }
      newOutbounds.push(cloned);
    } else if (!['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'hysteria2', 'tuic'].includes(o.type)) {
      newOutbounds.push(o);
    }
  });

  enhancedConfig.outbounds = newOutbounds;

  return { results, enhancedConfig };
}
