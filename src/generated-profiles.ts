// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
// Generated dynamically by scanning profiles/ folder during build/dev.

import profileContent_0 from '../profiles/50.enhanced.txt';
import profileContent_1 from '../profiles/TCB.enhanced.txt';
import profileContent_2 from '../profiles/50.chain.txt';
import profileContent_3 from '../profiles/50.txt';
import profileContent_4 from '../profiles/TCB.txt';

import { ProfileInfo } from './types';

export const PROFILES: Record<string, ProfileInfo> = {
  "50.enhanced": {
    id: "50.enhanced",
    name: "50 (⚡ Enhanced & Fast)",
    filename: "50.enhanced.txt",
    content: profileContent_0,
    isEnhanced: true,
    isChain: false,
    baseGroup: "50",
  },
  "TCB.enhanced": {
    id: "TCB.enhanced",
    name: "TCB (⚡ Enhanced & Fast)",
    filename: "TCB.enhanced.txt",
    content: profileContent_1,
    isEnhanced: true,
    isChain: false,
    baseGroup: "TCB",
  },
  "50.chain": {
    id: "50.chain",
    name: "50 (🔗 Chained Proxy)",
    filename: "50.chain.txt",
    content: profileContent_2,
    isEnhanced: false,
    isChain: true,
    baseGroup: "50",
  },
  "50": {
    id: "50",
    name: "50 (اصل / کامل)",
    filename: "50.txt",
    content: profileContent_3,
    isEnhanced: false,
    isChain: false,
    baseGroup: "50",
  },
  "TCB": {
    id: "TCB",
    name: "TCB (اصل / کامل)",
    filename: "TCB.txt",
    content: profileContent_4,
    isEnhanced: false,
    isChain: false,
    baseGroup: "TCB",
  },
};
