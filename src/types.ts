export interface Env {
  SUB_SECRET?: string;
  SUB_NAME?: string;
  PROFILE_TITLE?: string;
  DEFAULT_EXPIRY_DAYS?: string;
  DEFAULT_TOTAL_GB?: string;
  EXTRA_NODES?: string;
  NODES_KV?: {
    get(key: string): Promise<string | null>;
  };
}

export type ProfileFormat = 'txt' | 'json' | 'yaml';

export interface ProfileMetadata {
  name?: string;
  description?: string;
  author?: string;
  client?: string;
  tags?: string[];
  [key: string]: any;
}

export interface ProfileInfo {
  id: string;
  name: string;
  filename: string;
  format: ProfileFormat;
  content: string;
  isEnhanced: boolean;
  isChain?: boolean;
  baseGroup?: string;
  description?: string;
  author?: string;
  client?: string;
  tags?: string[];
}

export interface NodeItem {
  raw: string;
  protocol: string;
  remark: string;
  sourceFile: string;
}

export interface FilterOptions {
  protocol?: string;
  remark?: string;
  sourceFile?: string;
  limit?: number;
  shuffle?: boolean;
}
