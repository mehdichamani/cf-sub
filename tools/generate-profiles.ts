import fs from 'node:fs';
import path from 'node:path';

const profilesDir = path.resolve(process.cwd(), 'profiles');
const outputFile = path.resolve(process.cwd(), 'src/generated-profiles.ts');

if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}

const files = fs
  .readdirSync(profilesDir)
  .filter((f) => f.endsWith('.txt'))
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
  const id = file.replace(/\.txt$/, '');
  const isEnhanced = file.endsWith('.enhanced.txt');
  const isChain = file.endsWith('.chain.txt');
  
  let baseGroup = file.replace(/\.txt$/, '');
  if (isChain) {
    baseGroup = file.replace(/\.chain\.txt$/, '');
  } else if (isEnhanced) {
    baseGroup = file.replace(/\.enhanced\.txt$/, '');
  }
  
  // Format a friendly display name
  let displayName = file;
  if (isChain) {
    displayName = `${baseGroup} (🔗 Chained Proxy)`;
  } else if (isEnhanced) {
    displayName = `${baseGroup} (⚡ Enhanced & Fast)`;
  } else {
    displayName = `${baseGroup} (اصل / کامل)`;
  }

  importsCode += `import ${varName} from '../profiles/${file}';\n`;
  entriesCode += `  ${JSON.stringify(id)}: {\n` +
    `    id: ${JSON.stringify(id)},\n` +
    `    name: ${JSON.stringify(displayName)},\n` +
    `    filename: ${JSON.stringify(file)},\n` +
    `    content: ${varName},\n` +
    `    isEnhanced: ${isEnhanced},\n` +
    `    isChain: ${isChain},\n` +
    `    baseGroup: ${JSON.stringify(baseGroup)},\n` +
    `  },\n`;
});

const generatedContent = `// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
// Generated dynamically by scanning profiles/ folder during build/dev.

${importsCode}
import { ProfileInfo } from './types';

export const PROFILES: Record<string, ProfileInfo> = {
${entriesCode}};
`;

fs.writeFileSync(outputFile, generatedContent, 'utf-8');
console.log(`✨ Dynamically loaded ${files.length} profiles from profiles/ directory into src/generated-profiles.ts`);
