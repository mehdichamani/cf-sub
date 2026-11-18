#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { loadTesterConfig } from './config.ts';
import { curateNodes, curateXrayJson, curateSingboxJson, type TestResult } from './tester.ts';

async function main() {
  const args = process.argv.slice(2);
  const config = loadTesterConfig(args);

  const profilesDir = path.resolve(process.cwd(), 'profiles');
  if (!fs.existsSync(profilesDir)) {
    console.error('❌ profiles/ directory not found!');
    process.exit(1);
  }

  // Find target file(s)
  let targetFiles: string[] = [];
  const fileArgIdx = args.indexOf('--file');
  if (fileArgIdx !== -1 && args[fileArgIdx + 1]) {
    targetFiles = [args[fileArgIdx + 1]];
  } else {
    targetFiles = fs
      .readdirSync(profilesDir)
      .filter(
        (f) =>
          (f.endsWith('.txt') || f.endsWith('.json')) &&
          !f.includes('.enhanced.') &&
          !f.includes('.chain.')
      );
  }

  console.log('====================================================');
  console.log('🚀 Local Proxy Node Quality & Curation Suite');
  console.log('====================================================');

  for (const file of targetFiles) {
    const filePath = path.join(profilesDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ File ${file} not found, skipping.`);
      continue;
    }

    console.log(`\n📂 Processing: ${file}`);
    const isJson = file.endsWith('.json');

    if (isJson) {
      // JSON config file (Sing-box or Xray)
      try {
        const jsonContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const hasXrayOutbound = jsonContent.outbounds && jsonContent.outbounds.some((o: any) => o.protocol);
        const hasSingboxOutbound = jsonContent.outbounds && jsonContent.outbounds.some((o: any) => o.type);
        const isXray = hasXrayOutbound || (!!jsonContent.routing && !hasSingboxOutbound);
        const isSingbox = !isXray && (hasSingboxOutbound || !!jsonContent.experimental);

        let results: TestResult[] = [];
        let enhancedConfig: any = null;

        if (isSingbox) {
          console.log(`🔎 Detected format: Sing-box JSON Config`);
          const res = await curateSingboxJson(jsonContent, config);
          results = res.results;
          enhancedConfig = res.enhancedConfig;
        } else if (isXray) {
          console.log(`🔎 Detected format: Xray JSON Config`);
          const res = await curateXrayJson(jsonContent, config);
          results = res.results;
          enhancedConfig = res.enhancedConfig;
        } else {
          console.warn(`⚠️ Unknown JSON structure in ${file}, skipping curation.`);
          continue;
        }

        console.log('\n');
        const alive = results.filter((r) => r.alive).sort((a, b) => a.latencyMs - b.latencyMs);
        const dead = results.filter((r) => !r.alive);

        console.log(`\n📊 Summary for ${file}:`);
        console.log(`  - Total proxy outbounds: ${results.length}`);
        console.log(`  - Alive & Fast:          ${alive.length} ✅`);
        console.log(`  - Dead / Timeout:        ${dead.length} ❌`);

        if (alive.length > 0) {
          const baseName = file.replace(/\.enhanced\.json$/, '').replace(/\.json$/, '');
          const outputFileName = `${baseName}.enhanced.json`;
          const outputPath = path.join(profilesDir, outputFileName);
          fs.writeFileSync(outputPath, JSON.stringify(enhancedConfig, null, 2), 'utf-8');
          console.log(`\n💾 Saved enhanced JSON config to: profiles/${outputFileName}`);
        } else {
          console.warn(`⚠️ No alive nodes were found for ${file}.`);
        }
      } catch (err: any) {
        console.error(`❌ Error parsing/curating JSON file ${file}:`, err.message);
      }
      continue;
    }

    // Standard .txt URI node list
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
