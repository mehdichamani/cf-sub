// Dynamically generated profiles from profiles/ folder
import { PROFILES } from './generated-profiles';
import { Env, FilterOptions, NodeItem } from './types';

export { PROFILES };

/**
 * Extract remark (name/label) from a node link
 */
function extractRemark(raw: string, protocol: string): string {
  try {
    if (protocol === 'vmess') {
      const b64 = raw.slice('vmess://'.length).split('#')[0];
      const decoded = Buffer.from(b64, 'base64').toString('utf-8');
      const json = JSON.parse(decoded);
      if (json.ps) return String(json.ps);
    }
  } catch {
    // Ignore
  }

  const hashIndex = raw.indexOf('#');
  if (hashIndex !== -1) {
    try {
      return decodeURIComponent(raw.slice(hashIndex + 1).trim());
    } catch {
      return raw.slice(hashIndex + 1).trim();
    }
  }
  return '';
}

/**
 * Parse an individual line into a NodeItem, or null if invalid/comment
 */
export function parseNodeLine(line: string, sourceFile = 'default'): NodeItem | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return null;
  }

  const protoMatch = trimmed.match(/^([a-zA-Z0-9_\-]+):\/\//);
  if (!protoMatch) {
    return null;
  }

  const protocol = protoMatch[1].toLowerCase();
  const remark = extractRemark(trimmed, protocol);

  return {
    raw: trimmed,
    protocol,
    remark,
    sourceFile,
  };
}

/**
 * Parse multi-line text content into a list of NodeItems
 */
export function parseNodesFromText(content: string, sourceFile = 'default'): NodeItem[] {
  const lines = content.split(/\r?\n/);
  const items: NodeItem[] = [];

  for (const line of lines) {
    const node = parseNodeLine(line, sourceFile);
    if (node) {
      items.push(node);
    }
  }

  return items;
}

/**
 * Get nodes for a specific profile or all profiles
 */
export async function getNodesForProfile(
  profileId: string | undefined,
  env: Env,
  options: FilterOptions = {}
): Promise<NodeItem[]> {
  const allNodes: NodeItem[] = [];
  const seenRaw = new Set<string>();

  if (profileId && PROFILES[profileId]) {
    const profile = PROFILES[profileId];
    for (const node of parseNodesFromText(profile.content, profile.filename)) {
      if (!seenRaw.has(node.raw)) {
        seenRaw.add(node.raw);
        allNodes.push(node);
      }
    }
  } else {
    // If no specific profile is requested, load all non-enhanced profiles (or all available)
    for (const [id, profile] of Object.entries(PROFILES)) {
      if (id.includes('.enhanced')) continue; // Skip enhanced in collective view to avoid duplicate nodes
      for (const node of parseNodesFromText(profile.content, profile.filename)) {
        if (!seenRaw.has(node.raw)) {
          seenRaw.add(node.raw);
          allNodes.push(node);
        }
      }
    }
  }

  // Also include EXTRA_NODES from env if defined
  if (env.EXTRA_NODES) {
    for (const node of parseNodesFromText(env.EXTRA_NODES, 'env_extra')) {
      if (!seenRaw.has(node.raw)) {
        seenRaw.add(node.raw);
        allNodes.push(node);
      }
    }
  }

  // Protocol filter
  let filtered = allNodes;
  if (options.protocol) {
    const p = options.protocol.toLowerCase();
    filtered = filtered.filter(
      (n) => n.protocol === p || (p === 'hy2' && n.protocol === 'hysteria2') || (p === 'hysteria2' && n.protocol === 'hy2')
    );
  }

  // Remark filter
  if (options.remark) {
    const search = options.remark.toLowerCase();
    filtered = filtered.filter(
      (n) => n.remark.toLowerCase().includes(search) || n.raw.toLowerCase().includes(search)
    );
  }

  if (options.shuffle) {
    filtered = [...filtered].sort(() => Math.random() - 0.5);
  }

  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

/**
 * Format node list into standard base64 subscription format (UTF-8 safe)
 */
export function formatAsBase64(nodes: NodeItem[]): string {
  const plain = nodes.map((n) => n.raw).join('\n');
  return Buffer.from(plain, 'utf-8').toString('base64');
}

/**
 * Format node list as plain text
 */
export function formatAsRaw(nodes: NodeItem[]): string {
  return nodes.map((n) => n.raw).join('\n') + '\n';
}
