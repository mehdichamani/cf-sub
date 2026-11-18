import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadTesterConfig } from './config.ts';
import { curateNodes, curateXrayJson, curateSingboxJson, type TestResult } from './tester.ts';

const PORT = 3000;
const PROFILES_DIR = path.resolve(process.cwd(), 'profiles');

if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

// Current test progress state for SSE streaming
interface ActiveTestState {
  running: boolean;
  file?: string;
  total: number;
  completed: number;
  aliveCount: number;
  deadCount: number;
  results: TestResult[];
  mode: 'direct' | 'chain';
  chainProxy?: string;
  error?: string;
}

let activeTest: ActiveTestState = {
  running: false,
  total: 0,
  completed: 0,
  aliveCount: 0,
  deadCount: 0,
  results: [],
  mode: 'direct',
};

const sseClients: http.ServerResponse[] = [];

function notifyClients(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

function getProfilesList() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs
    .readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.txt') || f.endsWith('.json'))
    .map((name) => {
      const filePath = path.join(PROFILES_DIR, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        isEnhanced: name.includes('.enhanced.'),
        isChain: name.includes('.chain.'),
        format: name.endsWith('.json') ? 'json' : 'txt',
      };
    });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // SSE progress stream
  if (url.pathname === '/api/progress-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    sseClients.push(res);
    res.write(`data: ${JSON.stringify({ type: 'init', state: activeTest })}\n\n`);

    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  // API: List files in profiles/
  if (url.pathname === '/api/files' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ files: getProfilesList() }));
    return;
  }

  // API: Read file content
  if (url.pathname === '/api/file' && req.method === 'GET') {
    const filename = url.searchParams.get('name');
    if (!filename || filename.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'نام فایل نامعتبر است' }));
      return;
    }
    const filePath = path.join(PROFILES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'فایل یافت نشد' }));
      return;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ filename, content }));
    return;
  }

  // API: Save / Overwrite file
  if (url.pathname === '/api/file' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const { filename, content } = JSON.parse(body);
        if (!filename || filename.includes('..')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'نام فایل نامعتبر است' }));
          return;
        }
        const filePath = path.join(PROFILES_DIR, filename);
        fs.writeFileSync(filePath, content, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, filename }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Delete file
  if (url.pathname === '/api/file' && req.method === 'DELETE') {
    const filename = url.searchParams.get('name');
    if (!filename || filename.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'نام فایل نامعتبر است' }));
      return;
    }
    const filePath = path.join(PROFILES_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // API: Start Xray Testing & Cleaning
  if (url.pathname === '/api/test/start' && req.method === 'POST') {
    if (activeTest.running) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'یک فرآیند تست هم‌اکنون در حال اجراست.' }));
      return;
    }

    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { filename, content, mode, chainProxy, timeoutMs, concurrency } = JSON.parse(body || '{}');

        let targetContent = content;
        let targetName = filename;

        if (!targetContent && targetName) {
          const filePath = path.join(PROFILES_DIR, targetName);
          if (fs.existsSync(filePath)) {
            targetContent = fs.readFileSync(filePath, 'utf-8');
          }
        }

        if (!targetContent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'محتوا یا فایلی برای تست ارسال نشده است.' }));
          return;
        }

        const isChain = mode === 'chain';
        const proxyUri = isChain ? (chainProxy?.trim() || 'socks5://127.0.0.1:10808') : undefined;

        const config = loadTesterConfig([]);
        if (timeoutMs) config.timeoutMs = parseInt(timeoutMs, 10);
        if (concurrency) config.concurrency = parseInt(concurrency, 10);
        config.chainProxy = proxyUri;

        activeTest = {
          running: true,
          file: targetName,
          total: 0,
          completed: 0,
          aliveCount: 0,
          deadCount: 0,
          results: [],
          mode: isChain ? 'chain' : 'direct',
          chainProxy: proxyUri,
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'started', mode: activeTest.mode }));

        // Run async test task in background
        runBackgroundTest(targetName, targetContent, config, isChain).catch((err) => {
          activeTest.running = false;
          activeTest.error = err.message;
          notifyClients({ type: 'error', error: err.message });
        });
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Get Current Test Status
  if (url.pathname === '/api/test/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(activeTest));
    return;
  }

  // Serve GUI HTML
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderTesterGuiHtml());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

async function runBackgroundTest(filename: string | undefined, content: string, config: any, isChain: boolean) {
  const isJson = filename?.endsWith('.json') || (content.trim().startsWith('{') && content.trim().endsWith('}'));

  if (isJson) {
    try {
      const jsonContent = JSON.parse(content);
      const isSingbox = jsonContent.outbounds && jsonContent.outbounds.some((o: any) => o.type);
      const isXray = !isSingbox && (jsonContent.outbounds && jsonContent.outbounds.some((o: any) => o.protocol));

      notifyClients({ type: 'start', format: isSingbox ? 'sing-box' : 'xray', file: filename });

      let results: TestResult[] = [];
      let enhancedConfig: any = null;

      if (isSingbox) {
        const res = await curateSingboxJson(jsonContent, config);
        results = res.results;
        enhancedConfig = res.enhancedConfig;
      } else {
        const res = await curateXrayJson(jsonContent, config);
        results = res.results;
        enhancedConfig = res.enhancedConfig;
      }

      const alive = results.filter((r) => r.alive).sort((a, b) => a.latencyMs - b.latencyMs);
      const dead = results.filter((r) => !r.alive);

      activeTest.total = results.length;
      activeTest.completed = results.length;
      activeTest.aliveCount = alive.length;
      activeTest.deadCount = dead.length;
      activeTest.results = results;
      activeTest.running = false;

      // Automatically save clean file if it was a file from profiles
      let savedPath = '';
      if (filename && alive.length > 0) {
        const baseName = filename.replace(/\.enhanced\.json$/, '').replace(/\.chain\.json$/, '').replace(/\.json$/, '');
        const outputSuffix = isChain ? '.chain.enhanced.json' : '.enhanced.json';
        const outputFileName = `${baseName}${outputSuffix}`;
        fs.writeFileSync(path.join(PROFILES_DIR, outputFileName), JSON.stringify(enhancedConfig, null, 2), 'utf-8');
        savedPath = outputFileName;
      }

      notifyClients({
        type: 'done',
        total: results.length,
        alive: alive.length,
        dead: dead.length,
        results,
        cleanJson: enhancedConfig,
        savedFile: savedPath,
      });
      return;
    } catch (err: any) {
      activeTest.running = false;
      activeTest.error = err.message;
      notifyClients({ type: 'error', error: err.message });
      return;
    }
  }

  // Handle .txt lines
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//') && l.includes('://'));

  activeTest.total = lines.length;
  notifyClients({ type: 'start', format: 'txt', total: lines.length, file: filename });

  const results = await curateNodes(lines, config);

  const alive = results.filter((r) => r.alive).sort((a, b) => a.latencyMs - b.latencyMs);
  const dead = results.filter((r) => !r.alive);

  activeTest.completed = results.length;
  activeTest.aliveCount = alive.length;
  activeTest.deadCount = dead.length;
  activeTest.results = results;
  activeTest.running = false;

  // Format clean alive nodes
  const formattedCleanNodes = alive.map((node, index) => {
    const orderNum = String(index + 1).padStart(2, '0');
    const flag = node.geo?.flagEmoji || '🌐';
    const countryCode = node.geo?.countryCode && node.geo.countryCode !== 'XX' ? node.geo.countryCode : 'Proxy';
    const cityOrCountry = node.geo?.city || node.geo?.countryName || '';
    const loc = cityOrCountry ? ` - ${cityOrCountry}` : '';
    const modeTag = isChain ? ' 🔗' : '';
    const newRemark = `${flag} ${countryCode}${loc} | ${node.latencyMs}ms${modeTag} #${orderNum}`;
    const baseWithoutHash = node.raw.split('#')[0];
    return `${baseWithoutHash}#${encodeURIComponent(newRemark)}`;
  });

  const cleanTextOutput = formattedCleanNodes.join('\n') + (formattedCleanNodes.length ? '\n' : '');

  let savedPath = '';
  if (filename && alive.length > 0) {
    const baseName = filename.replace(/\.enhanced\.txt$/, '').replace(/\.chain\.txt$/, '').replace(/\.txt$/, '');
    const outputSuffix = isChain ? '.chain.txt' : '.enhanced.txt';
    const outputFileName = `${baseName}${outputSuffix}`;
    const header =
      `# Curated on ${new Date().toISOString()}\n` +
      `# Mode: ${isChain ? 'Chain (Landing: ' + config.chainProxy + ')' : 'Direct'}\n` +
      `# Total healthy nodes: ${formattedCleanNodes.length}\n\n`;
    fs.writeFileSync(path.join(PROFILES_DIR, outputFileName), header + cleanTextOutput, 'utf-8');
    savedPath = outputFileName;
  }

  notifyClients({
    type: 'done',
    total: results.length,
    alive: alive.length,
    dead: dead.length,
    results,
    cleanText: cleanTextOutput,
    savedFile: savedPath,
  });
}

function renderTesterGuiHtml(): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تستر و پالایشگر محلی کانفیگ‌ها با هسته Xray</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Vazirmatn:wght@300;400;500;700;900&display=swap">
  <style>
    :root {
      --bg: #07090e;
      --card-bg: rgba(14, 18, 27, 0.85);
      --card-border: rgba(239, 68, 68, 0.22);
      --card-hover: rgba(20, 26, 38, 0.95);
      --red: #ef4444;
      --red-glow: rgba(239, 68, 68, 0.35);
      --red-hover: #dc2626;
      --primary: #ef4444;
      --primary-hover: #dc2626;
      --success: #10b981;
      --danger: #ef4444;
      --chain: #f59e0b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --mono-font: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body {
      background-color: var(--bg);
      /* Faint cyber laser grid background */
      background-image: 
        linear-gradient(to right, rgba(239, 68, 68, 0.05) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(239, 68, 68, 0.05) 1px, transparent 1px),
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(220, 38, 38, 0.18), transparent 75%);
      background-size: 38px 38px, 38px 38px, 100% 100%;
      color: var(--text);
      min-height: 100vh;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 1180px;
      margin: 0 auto;
    }
    header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .brand-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 0.35rem 1rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      color: var(--red);
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 0.8rem;
      text-shadow: 0 0 10px var(--red-glow);
    }
    h1 {
      font-size: 2rem;
      font-weight: 900;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      margin-bottom: 0.5rem;
      letter-spacing: -0.5px;
    }
    .laser-accent {
      color: var(--red);
      text-shadow: 0 0 12px var(--red-glow);
    }
    p.subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .grid {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 1.5rem;
    }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 1.4rem;
      backdrop-filter: blur(14px);
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 25px rgba(239, 68, 68, 0.05);
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 800;
      margin-bottom: 1.2rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #fff;
      border-bottom: 1px solid rgba(239, 68, 68, 0.15);
      padding-bottom: 0.75rem;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
      font-weight: 500;
    }
    select, input[type="text"], input[type="number"], textarea {
      width: 100%;
      background: rgba(7, 9, 14, 0.85);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 0.6rem;
      padding: 0.7rem 0.9rem;
      color: #fff;
      font-size: 0.9rem;
      outline: none;
      transition: all 0.2s;
    }
    select:focus, input:focus, textarea:focus {
      border-color: var(--red);
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.25);
    }
    textarea {
      resize: vertical;
      min-height: 140px;
      direction: ltr;
      font-family: var(--mono-font);
      font-size: 0.8rem;
      line-height: 1.4;
    }
    .mode-switch {
      display: flex;
      gap: 0.5rem;
      background: rgba(7, 9, 14, 0.85);
      padding: 0.3rem;
      border-radius: 0.7rem;
      border: 1px solid rgba(239, 68, 68, 0.2);
      margin-bottom: 1rem;
    }
    .mode-btn {
      flex: 1;
      padding: 0.65rem 0.5rem;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: 0.5rem;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }
    .mode-btn.active.direct {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: #fff;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    }
    .mode-btn.active.chain {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #fff;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
    }
    .chain-box {
      background: rgba(245, 158, 11, 0.08);
      border: 1px dashed rgba(245, 158, 11, 0.4);
      border-radius: 0.6rem;
      padding: 0.85rem;
      margin-bottom: 1rem;
      display: none;
    }
    .chain-box.show {
      display: block;
    }
    .btn-action {
      width: 100%;
      padding: 0.9rem;
      border: none;
      border-radius: 0.6rem;
      background: linear-gradient(135deg, #ef4444, #b91c1c);
      color: #fff;
      font-size: 1rem;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      box-shadow: 0 4px 15px rgba(239, 68, 68, 0.35);
      transition: all 0.2s;
    }
    .btn-action:hover {
      background: linear-gradient(135deg, #dc2626, #991b1b);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(239, 68, 68, 0.45);
    }
    .btn-action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .stats-bar {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .stat-card {
      background: rgba(7, 9, 14, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 0.7rem;
      padding: 0.85rem 0.5rem;
      text-align: center;
    }
    .stat-val {
      font-size: 1.5rem;
      font-weight: 900;
      margin-top: 0.2rem;
      font-family: var(--mono-font);
    }
    .stat-alive { color: var(--success); text-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }
    .stat-dead { color: var(--danger); text-shadow: 0 0 10px rgba(239, 68, 68, 0.3); }
    .stat-total { color: #f8fafc; }
    .stat-lbl {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
    }
    .results-table-wrap {
      max-height: 480px;
      overflow-y: auto;
      border: 1px solid var(--card-border);
      border-radius: 0.7rem;
      background: rgba(7, 9, 14, 0.7);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: right;
      font-size: 0.85rem;
    }
    th {
      background: rgba(14, 18, 27, 0.95);
      padding: 0.8rem 0.9rem;
      color: var(--text-muted);
      position: sticky;
      top: 0;
      border-bottom: 1px solid var(--card-border);
      font-weight: 700;
    }
    td {
      padding: 0.7rem 0.9rem;
      border-bottom: 1px solid rgba(239, 68, 68, 0.1);
    }
    tr:last-child td { border-bottom: none; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.2rem 0.55rem;
      border-radius: 0.4rem;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .badge-alive { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-dead { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-proto { background: rgba(255, 255, 255, 0.08); color: #e2e8f0; font-family: var(--mono-font); font-size: 0.7rem; }
    .latency-fast { color: #34d399; font-weight: 700; font-family: var(--mono-font); }
    .latency-med { color: #fbbf24; font-weight: 700; font-family: var(--mono-font); }
    .latency-slow { color: #f87171; font-weight: 700; font-family: var(--mono-font); }
    .clean-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.2rem;
    }
    .btn-secondary {
      flex: 1;
      padding: 0.75rem;
      background: rgba(20, 26, 38, 0.8);
      border: 1px solid var(--card-border);
      color: #fff;
      border-radius: 0.6rem;
      font-size: 0.85rem;
      cursor: pointer;
      font-weight: 700;
      transition: all 0.2s;
    }
    .btn-secondary:hover {
      background: rgba(30, 41, 59, 0.9);
      border-color: rgba(239, 68, 68, 0.4);
    }
    .badge-saved {
      background: rgba(16, 185, 129, 0.15);
      color: #6ee7b7;
      padding: 0.6rem 1rem;
      border-radius: 0.6rem;
      border: 1px solid rgba(16, 185, 129, 0.4);
      margin-top: 1rem;
      font-size: 0.85rem;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand-tag">⚡ CYBER FREEDOM CORE</div>
      <h1><span>پالایشگر و تستر محلی با</span> <span class="laser-accent">Xray</span></h1>
      <p class="subtitle">تست مستقیم و زنجیره‌ای (Chain) کانفیگ‌ها، حذف نودهای فیلترشده و سوخته و تولید خروجی تمیز و پرسرعت</p>
    </header>

    <div class="grid">
      <!-- Left: Controls & Profile Select -->
      <div class="card">
        <div class="card-title">🎛️ تنظیمات و ورودی</div>

        <div class="form-group">
          <label>انتخاب فایل از پوشه profiles:</label>
          <select id="fileSelect" onchange="loadSelectedFile()">
            <option value="">-- انتخاب فایل موجود --</option>
          </select>
        </div>

        <div class="form-group">
          <label>محتوای کانفیگ‌ها (لینک‌های پروکسی یا JSON کامل):</label>
          <textarea id="configContent" placeholder="vless://...&#10;vmess://...&#10;ss://..."></textarea>
        </div>

        <label>حالت تست کانفیگ‌ها:</label>
        <div class="mode-switch">
          <button id="btnDirect" class="mode-btn active direct" onclick="setMode('direct')">🌐 مستقیم (Direct)</button>
          <button id="btnChain" class="mode-btn chain" onclick="setMode('chain')">🔗 زنجیره‌ای (Chain Proxy)</button>
        </div>

        <div id="chainBox" class="chain-box">
          <label style="color:#c084fc;">آدرس پروکسی ورودی (Landing Proxy):</label>
          <input type="text" id="chainProxyInput" value="socks5://127.0.0.1:10808" placeholder="socks5://127.0.0.1:10808">
          <small style="color:var(--text-muted); display:block; margin-top:4px;">ترافیک ابتدا از این پروکسی محلی عبور کرده و وارد سرورهای شما می‌شود.</small>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem;" class="form-group">
          <div>
            <label>مهلت پاسخ (ms):</label>
            <input type="number" id="timeoutInput" value="5000" min="1000" max="15000">
          </div>
          <div>
            <label>تست‌های همزمان:</label>
            <input type="number" id="concurrencyInput" value="8" min="1" max="32">
          </div>
        </div>

        <button id="btnRunTest" class="btn-action" onclick="startTest()">
          <span>🚀 شروع تست و پاک‌سازی</span>
        </button>

        <div id="saveNotification" class="badge-saved">
          ✔ کانفیگ‌های سالم ذخیره شدند: <span id="savedFileName" style="font-weight:700;"></span>
        </div>
      </div>

      <!-- Right: Live Monitor & Results -->
      <div class="card">
        <div class="card-title">📊 نتایج تست و کانفیگ‌های سالم</div>

        <div class="stats-bar">
          <div class="stat-card">
            <div class="stat-lbl">کل نودها</div>
            <div id="statTotal" class="stat-val stat-total">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-lbl">سالم و پرسرعت ✅</div>
            <div id="statAlive" class="stat-val stat-alive">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-lbl">ناسالم / سوخته ❌</div>
            <div id="statDead" class="stat-val stat-dead">0</div>
          </div>
        </div>

        <div class="results-table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 70px;">وضعیت</th>
                <th style="width: 80px;">پروتکل</th>
                <th>نام / مشخصات نود</th>
                <th style="width: 90px; text-align: left;">تاخیر (Ping)</th>
              </tr>
            </thead>
            <tbody id="resultsBody">
              <tr>
                <td colspan="4" style="text-align:center; color:var(--text-muted); padding: 2rem;">
                  فایلی را انتخاب یا کانفیگ‌ها را وارد کنید، سپس روی «شروع تست» کلیک کنید.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="clean-actions">
          <button class="btn-secondary" onclick="copyCleanNodes()">📋 کپی کانفیگ‌های سالم</button>
          <button class="btn-secondary" onclick="downloadCleanFile()">💾 دانلود فایل پالایش شده</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentMode = 'direct';
    let lastCleanOutput = '';
    let lastCleanFilename = 'clean-nodes.txt';
    let isTesting = false;

    function setMode(mode) {
      currentMode = mode;
      const btnDirect = document.getElementById('btnDirect');
      const btnChain = document.getElementById('btnChain');
      const chainBox = document.getElementById('chainBox');

      if (mode === 'chain') {
        btnChain.classList.add('active');
        btnDirect.classList.remove('active');
        chainBox.classList.add('show');
      } else {
        btnDirect.classList.add('active');
        btnChain.classList.remove('active');
        chainBox.classList.remove('show');
      }
    }

    async function fetchFiles() {
      try {
        const res = await fetch('/api/files');
        const data = await res.json();
        const select = document.getElementById('fileSelect');
        select.innerHTML = '<option value="">-- انتخاب فایل موجود در profiles/ --</option>';
        data.files.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.name;
          const tag = f.isChain ? ' [Chain]' : (f.isEnhanced ? ' [Enhanced]' : '');
          opt.textContent = f.name + tag;
          select.appendChild(opt);
        });
      } catch (err) {
        console.error('Error fetching files:', err);
      }
    }

    async function loadSelectedFile() {
      const select = document.getElementById('fileSelect');
      const filename = select.value;
      if (!filename) return;

      try {
        const res = await fetch('/api/file?name=' + encodeURIComponent(filename));
        const data = await res.json();
        if (data.content) {
          document.getElementById('configContent').value = data.content;
          document.getElementById('saveNotification').style.display = 'none';
        }
      } catch (err) {
        alert('خطا در خواندن فایل: ' + err.message);
      }
    }

    async function startTest() {
      if (isTesting) return;

      const content = document.getElementById('configContent').value.trim();
      const filename = document.getElementById('fileSelect').value;

      if (!content) {
        alert('لطفاً ابتدا فایل انتخاب کرده یا چند کانفیگ وارد نمایید.');
        return;
      }

      isTesting = true;
      document.getElementById('btnRunTest').disabled = true;
      document.getElementById('btnRunTest').innerHTML = '<span>⏳ در حال تست کانفیگ‌ها با Xray...</span>';
      document.getElementById('saveNotification').style.display = 'none';
      document.getElementById('resultsBody').innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;">در حال ارسال به هسته Xray و سنجش پینگ و کیفیت...</td></tr>';

      try {
        await fetch('/api/test/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: filename || undefined,
            content,
            mode: currentMode,
            chainProxy: document.getElementById('chainProxyInput').value,
            timeoutMs: document.getElementById('timeoutInput').value,
            concurrency: document.getElementById('concurrencyInput').value,
          })
        });
      } catch (err) {
        alert('خطا در شروع تست: ' + err.message);
        finishTestUi();
      }
    }

    function finishTestUi() {
      isTesting = false;
      const btn = document.getElementById('btnRunTest');
      btn.disabled = false;
      btn.innerHTML = '<span>🚀 شروع تست و پاک‌سازی</span>';
    }

    // SSE connection for live updates
    const evtSource = new EventSource('/api/progress-stream');
    evtSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'start') {
          document.getElementById('statTotal').textContent = msg.total || 0;
          document.getElementById('statAlive').textContent = 0;
          document.getElementById('statDead').textContent = 0;
        } else if (msg.type === 'done') {
          finishTestUi();
          document.getElementById('statTotal').textContent = msg.total;
          document.getElementById('statAlive').textContent = msg.alive;
          document.getElementById('statDead').textContent = msg.dead;

          renderTableResults(msg.results);

          if (msg.cleanText) {
            lastCleanOutput = msg.cleanText;
            lastCleanFilename = (msg.savedFile || 'clean-nodes.txt');
          } else if (msg.cleanJson) {
            lastCleanOutput = JSON.stringify(msg.cleanJson, null, 2);
            lastCleanFilename = (msg.savedFile || 'clean-config.json');
          }

          if (msg.savedFile) {
            const notif = document.getElementById('saveNotification');
            document.getElementById('savedFileName').textContent = msg.savedFile;
            notif.style.display = 'block';
            fetchFiles(); // refresh list
          }
        } else if (msg.type === 'error') {
          finishTestUi();
          alert('خطا در تست: ' + msg.error);
        }
      } catch (e) {}
    };

    function renderTableResults(results) {
      const tbody = document.getElementById('resultsBody');
      if (!results || results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">هیچ کانفیگی یافت نشد.</td></tr>';
        return;
      }

      // Sort alive first, then by latency
      const sorted = [...results].sort((a, b) => {
        if (a.alive && !b.alive) return -1;
        if (!a.alive && b.alive) return 1;
        return a.latencyMs - b.latencyMs;
      });

      tbody.innerHTML = sorted.map(r => {
        const flag = r.geo?.flagEmoji || '🌐';
        const geoText = r.geo?.countryCode && r.geo.countryCode !== 'XX' ? \` (\${r.geo.countryCode})\` : '';
        const name = (r.originalRemark || r.raw.slice(0, 40)) + geoText;
        
        let latencyBadge = '';
        if (r.alive) {
          const latClass = r.latencyMs < 1200 ? 'latency-fast' : (r.latencyMs < 2500 ? 'latency-med' : 'latency-slow');
          latencyBadge = \`<span class="\${latClass}">\${r.latencyMs} ms</span>\`;
        } else {
          latencyBadge = '<span style="color:var(--text-muted);">تایم‌اوت</span>';
        }

        return \`
          <tr>
            <td>
              \${r.alive 
                ? '<span class="badge badge-alive">سالم</span>' 
                : '<span class="badge badge-dead">سوخته</span>'}
            </td>
            <td><span class="badge badge-proto">\${r.protocol.toUpperCase()}</span></td>
            <td style="word-break: break-all; direction: ltr; text-align: left;">
              <span style="margin-right: 6px;">\${flag}</span> \${escapeHtml(name)}
            </td>
            <td style="text-align: left;">\${latencyBadge}</td>
          </tr>
        \`;
      }).join('');
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function copyCleanNodes() {
      if (!lastCleanOutput) {
        alert('ابتدا تست را اجرا نمایید تا کانفیگ‌های سالم مشخص شوند.');
        return;
      }
      navigator.clipboard.writeText(lastCleanOutput).then(() => {
        alert('کانفیگ‌های سالم با موفقیت کپی شدند! ✅');
      });
    }

    function downloadCleanFile() {
      if (!lastCleanOutput) {
        alert('ابتدا تست را اجرا نمایید تا کانفیگ‌های سالم مشخص شوند.');
        return;
      }
      const blob = new Blob([lastCleanOutput], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = lastCleanFilename;
      link.click();
    }

    fetchFiles();
  </script>
</body>
</html>`;
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Xray Local Tester & Curation GUI is running!`);
  console.log(`🌐 Open in browser: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
