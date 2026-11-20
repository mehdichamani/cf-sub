import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

interface ProfileMetadata {
  name?: string;
  description?: string;
  author?: string;
  client?: string;
  tags?: string[];
  [key: string]: any;
}

const profilesDir = path.resolve(process.cwd(), 'profiles');
const outputFile = path.resolve(process.cwd(), 'src/generated-profiles.ts');
const metaFile = path.resolve(process.cwd(), 'profiles.yaml');

if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}

// Load descriptions and metadata from profiles.yaml if present
let profilesMeta: Record<string, ProfileMetadata> = {};
if (fs.existsSync(metaFile)) {
  try {
    const parsed = YAML.parse(fs.readFileSync(metaFile, 'utf-8'));
    if (parsed && typeof parsed === 'object') {
      profilesMeta = parsed.profiles || parsed;
    }
  } catch (err: any) {
    console.warn(`⚠️ Warning: Could not parse profiles.yaml: ${err.message}`);
  }
}

const files = fs
  .readdirSync(profilesDir)
  .filter((f) => f.endsWith('.txt') || f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'))
  .sort((a, b) => {
    const aEnh = a.includes('.enhanced.');
    const bEnh = b.includes('.enhanced.');
    if (aEnh && !bEnh) return -1;
    if (!aEnh && bEnh) return 1;
    return a.localeCompare(b);
  });

let entriesCode = '';

files.forEach((file) => {
  const filePath = path.join(profilesDir, file);
  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const isJson = file.endsWith('.json');
  const isYaml = file.endsWith('.yaml') || file.endsWith('.yml');
  const format = isJson ? 'json' : isYaml ? 'yaml' : 'txt';
  
  // Use unique ID per file (include extension so identical basenames with different formats never collide)
  const id = file;
  const isEnhanced = file.includes('.enhanced.');
  const isChain = file.includes('.chain.');

  const extMatch = file.match(/\.(txt|json|ya?ml)$/i);
  const ext = extMatch ? extMatch[0] : '';
  const baseNameWithoutExt = file.slice(0, -ext.length);

  let baseGroup = baseNameWithoutExt;
  if (isChain) {
    baseGroup = baseGroup.replace(/\.chain$/, '');
  } else if (isEnhanced) {
    baseGroup = baseGroup.replace(/\.enhanced$/, '');
  }

  // Get user-provided metadata from profiles.yaml
  const meta: ProfileMetadata = profilesMeta[id] || profilesMeta[baseNameWithoutExt] || profilesMeta[baseGroup] || {};

  let displayName = meta.name;
  if (!displayName) {
    if (isChain) {
      displayName = `${baseGroup} (🔗 Chained Proxy)`;
    } else if (isEnhanced) {
      displayName = `${baseGroup} (⚡ Enhanced & Fast)`;
    } else if (isJson) {
      displayName = `${baseGroup} (📄 Full Config JSON)`;
    } else if (isYaml) {
      displayName = `${baseGroup} (📄 Config YAML)`;
    } else {
      displayName = `${baseGroup} (اصل / کامل)`;
    }
  } else {
    if (isEnhanced && !displayName.includes('Enhanced') && !displayName.includes('⚡')) {
      displayName += ' ⚡ (Enhanced)';
    } else if (isChain && !displayName.includes('Chain') && !displayName.includes('🔗')) {
      displayName += ' 🔗 (Chain)';
    }
  }

  // Extract tags from filename parts separated by '_'
  const filenameTags = baseNameWithoutExt
    .split('_')
    .map((s) => s.trim())
    .filter((s) => Boolean(s));

  const allTags = Array.from(new Set([...(meta.tags || []), ...filenameTags]));

  entriesCode +=
    `  ${JSON.stringify(id)}: {\n` +
    `    id: ${JSON.stringify(id)},\n` +
    `    name: ${JSON.stringify(displayName)},\n` +
    `    filename: ${JSON.stringify(file)},\n` +
    `    format: ${JSON.stringify(format)},\n` +
    `    content: ${JSON.stringify(rawContent)},\n` +
    `    isEnhanced: ${isEnhanced},\n` +
    `    isChain: ${isChain},\n` +
    `    baseGroup: ${JSON.stringify(baseGroup)},\n` +
    `    description: ${JSON.stringify(meta.description || '')},\n` +
    `    author: ${JSON.stringify(meta.author || '')},\n` +
    `    client: ${JSON.stringify(meta.client || '')},\n` +
    `    tags: ${JSON.stringify(allTags)},\n` +
    `  },\n`;
});

const generatedContent = `// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
// Generated dynamically by inlining profiles/ content and profiles.yaml metadata during build/dev.

import { ProfileInfo } from './types';

export const PROFILES: Record<string, ProfileInfo> = {
${entriesCode}};
`;

fs.writeFileSync(outputFile, generatedContent, 'utf-8');
console.log(`✨ Inlined ${files.length} profiles from profiles/ directory into src/generated-profiles.ts`);
