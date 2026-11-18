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
  .filter((f) => f.endsWith('.txt') || f.endsWith('.json'))
  .sort((a, b) => {
    // Put enhanced files first, then alphabetical
    const aEnh = a.includes('.enhanced.');
    const bEnh = b.includes('.enhanced.');
    if (aEnh && !bEnh) return -1;
    if (!aEnh && bEnh) return 1;
    return a.localeCompare(b);
  });

let importsCode = '';
let entriesCode = '';

files.forEach((file, idx) => {
  const varName = `profileContent_${idx}`;
  const isJson = file.endsWith('.json');
  const ext = isJson ? '.json' : '.txt';
  const id = file.slice(0, -ext.length);
  const isEnhanced = file.includes('.enhanced.');
  const isChain = file.includes('.chain.');

  let baseGroup = id;
  if (isChain) {
    baseGroup = id.replace(/\.chain$/, '');
  } else if (isEnhanced) {
    baseGroup = id.replace(/\.enhanced$/, '');
  }

  // Get user-provided metadata from profiles.yaml
  const meta: ProfileMetadata = profilesMeta[id] || profilesMeta[baseGroup] || {};

  // Determine display name
  let displayName = meta.name;
  if (!displayName) {
    if (isChain) {
      displayName = `${baseGroup} (🔗 Chained Proxy)`;
    } else if (isEnhanced) {
      displayName = `${baseGroup} (⚡ Enhanced & Fast)`;
    } else if (isJson) {
      displayName = `${baseGroup} (📄 Full Config JSON)`;
    } else {
      displayName = `${baseGroup} (اصل / کامل)`;
    }
  } else {
    // If name is configured in metadata but this is an enhanced/chain variation
    if (isEnhanced && !displayName.includes('Enhanced') && !displayName.includes('⚡')) {
      displayName += ' ⚡ (Enhanced)';
    } else if (isChain && !displayName.includes('Chain') && !displayName.includes('🔗')) {
      displayName += ' 🔗 (Chain)';
    }
  }

  importsCode += `import ${varName} from '../profiles/${file}';\n`;
  const contentExpr = isJson ? `typeof ${varName} === 'string' ? ${varName} : JSON.stringify(${varName}, null, 2)` : varName;
  entriesCode +=
    `  ${JSON.stringify(id)}: {\n` +
    `    id: ${JSON.stringify(id)},\n` +
    `    name: ${JSON.stringify(displayName)},\n` +
    `    filename: ${JSON.stringify(file)},\n` +
    `    format: ${JSON.stringify(isJson ? 'json' : 'txt')},\n` +
    `    content: ${contentExpr},\n` +
    `    isEnhanced: ${isEnhanced},\n` +
    `    isChain: ${isChain},\n` +
    `    baseGroup: ${JSON.stringify(baseGroup)},\n` +
    `    description: ${JSON.stringify(meta.description || '')},\n` +
    `    author: ${JSON.stringify(meta.author || '')},\n` +
    `    client: ${JSON.stringify(meta.client || '')},\n` +
    `    tags: ${JSON.stringify(meta.tags || [])},\n` +
    `  },\n`;
});

const generatedContent = `// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
// Generated dynamically by scanning profiles/ folder and profiles.yaml during build/dev.

${importsCode}
import { ProfileInfo } from './types';

export const PROFILES: Record<string, ProfileInfo> = {
${entriesCode}};
`;

fs.writeFileSync(outputFile, generatedContent, 'utf-8');
console.log(`✨ Dynamically loaded ${files.length} profiles from profiles/ directory into src/generated-profiles.ts`);
