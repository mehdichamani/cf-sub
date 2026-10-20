#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { loadTesterConfig } from './config.ts';
import { curateNodes, type TestResult } from './tester.ts';

async function main() {
  const args = process.argv.slice(2);
  const config = loadTesterConfig(args);

  const profilesDir = path.resolve(process.cwd(), 'profiles');
  if (!fs.existsSync(profilesDir)) {
    console.error('❌ profiles/ directory not found!');
    process.exit(1);
  }

  // Find target file (e.g., config1.txt or all files, excluding already curated/enhanced files)
  let targetFiles: string[] = [];
  const fileArgIdx = args.indexOf('--file');
  if (fileArgIdx !== -1 && args[fileArgIdx + 1]) {
    targetFiles = [args[fileArgIdx + 1]];
  } else {
    targetFiles = fs
      .readdirSync(profilesDir)
      .filter((f) => f.endsWith('.txt') && !f.includes('.enhanced.txt') && !f.includes('.chain.txt'));
  }

  console.log('====================================================');
  console.log('🚀 Local V2Ray / Xray Node Quality & Curation Tool');
  console.log('====================================================');

  for (const file of targetFiles) {
    const filePath = path.join(profilesDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ File ${file} not found, skipping.`);
      continue;
    }

    console.log(`\n📂 Processing: ${file}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('//') && l.includes('://'));

    if (lines.length === 0) {
      console.log(`ℹ️ No valid node URIs found in ${file}.`);
      continue;
    }

    const results = await curateNodes(lines, config);
    console.log('\n');

    // Filter alive nodes and sort ascending by latency (fastest first)
    const aliveNodes = results
      .filter((r) => r.alive)
      .sort((a, b) => a.latencyMs - b.latencyMs);

    const deadNodes = results.filter((r) => !r.alive);

    console.log(`\n📊 Summary for ${file}:`);
    console.log(`  - Total nodes:    ${results.length}`);
    console.log(`  - Alive & Fast:   ${aliveNodes.length} ✅`);
    console.log(`  - Dead / Timeout: ${deadNodes.length} ❌`);

    if (aliveNodes.length > 0) {
      // Format each alive node remark according to the user standard:
      // e.g.: "🇩🇪 DE - Frankfurt | 120ms #01"
      const isChainMode = !!config.chainProxy;
      const formattedNodes: string[] = aliveNodes.map((node, index) => {
        const orderNum = String(index + 1).padStart(2, '0');
        const flag = node.geo?.flagEmoji || '🌐';
        const countryCode = node.geo?.countryCode && node.geo.countryCode !== 'XX' ? node.geo.countryCode : 'Proxy';
        const cityOrCountry = node.geo?.city || node.geo?.countryName || '';
        const locationPart = cityOrCountry ? ` - ${cityOrCountry}` : '';
        const modeTag = isChainMode ? ' 🔗' : '';
        const newRemark = `${flag} ${countryCode}${locationPart} | ${node.latencyMs}ms${modeTag} #${orderNum}`;
        const baseWithoutHash = node.raw.split('#')[0];
        return `${baseWithoutHash}#${encodeURIComponent(newRemark)}`;
      });

      // Save enhanced/chain file with distinct suffix:
      // Direct mode -> .enhanced.txt
      // Chain mode  -> .chain.txt
      const baseName = file.replace(/\.enhanced\.txt$/, '').replace(/\.chain\.txt$/, '').replace(/\.txt$/, '');
      const outputSuffix = isChainMode ? '.chain.txt' : '.enhanced.txt';
      const outputFileName = `${baseName}${outputSuffix}`;
      const outputPath = path.join(profilesDir, outputFileName);
      const enhancedContent =
        `# Auto-curated & sorted by latency on ${new Date().toISOString()}\n` +
        `# Mode: ${isChainMode ? 'Chained (Landing Proxy: ' + config.chainProxy + ')' : 'Direct'}\n` +
        `# Total healthy nodes: ${formattedNodes.length}\n\n` +
        formattedNodes.join('\n') +
        '\n';

      fs.writeFileSync(outputPath, enhancedContent, 'utf-8');
      console.log(`\n💾 Saved ${isChainMode ? 'chain' : 'enhanced'} nodes to: profiles/${outputFileName}`);
    } else {
      console.warn(`⚠️ No alive nodes were found for ${file}.`);
    }
  }

  console.log('\n✨ Curation complete! You can now run `pnpm run deploy` to publish updated nodes.');
}

main().catch((err) => {
  console.error('\n❌ Execution error:', err);
  process.exit(1);
});
