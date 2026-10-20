/**
 * Parser from URI to Xray Outbound Object
 */

export interface XrayOutbound {
  protocol: string;
  settings?: any;
  streamSettings?: any;
  tag: string;
}

export function parseUriToOutbound(uri: string, tag = 'proxy'): XrayOutbound | null {
  const trimmed = uri.trim();
  const match = trimmed.match(/^([a-zA-Z0-9_\-]+):\/\/(.*)$/);
  if (!match) return null;

  const protocol = match[1].toLowerCase();
  const body = match[2];

  try {
    if (protocol === 'ss') {
      return parseShadowsocks(body, tag);
    } else if (protocol === 'vmess') {
      return parseVmess(body, tag);
    } else if (protocol === 'vless') {
      return parseVless(body, tag);
    } else if (protocol === 'trojan') {
      return parseTrojan(body, tag);
    } else if (protocol === 'socks' || protocol === 'socks5') {
      return parseSocks(body, tag);
    } else if (protocol === 'http' || protocol === 'https') {
      return parseHttp(body, tag);
    }
  } catch (err) {
    // Unsupported or malformed
  }

  return null;
}

function parseSocks(body: string, tag: string): XrayOutbound {
  const url = new URL(`socks://${body}`);
  const address = url.hostname;
  const port = parseInt(url.port || '1080', 10);
  const users = url.username ? [{ user: url.username, pass: url.password || '' }] : undefined;

  return {
    protocol: 'socks',
    tag,
    settings: {
      servers: [
        {
          address,
          port,
          users,
        },
      ],
    },
  };
}

function parseHttp(body: string, tag: string): XrayOutbound {
  const url = new URL(`http://${body}`);
  const address = url.hostname;
  const port = parseInt(url.port || '8080', 10);
  const users = url.username ? [{ user: url.username, pass: url.password || '' }] : undefined;

  return {
    protocol: 'http',
    tag,
    settings: {
      servers: [
        {
          address,
          port,
          users,
        },
      ],
    },
  };
}

function parseShadowsocks(body: string, tag: string): XrayOutbound {
  const [mainPart] = body.split('#');
  let authAndServer = mainPart.split('?')[0];

  let method = '';
  let password = '';
  let address = '';
  let port = 0;

  if (authAndServer.includes('@')) {
    const [authPart, serverPart] = authAndServer.split('@');
    const [hostStr, portStr] = serverPart.split(':');
    address = hostStr;
    port = parseInt(portStr, 10);

    let decodedAuth = authPart;
    if (!authPart.includes(':')) {
      decodedAuth = Buffer.from(authPart, 'base64').toString('utf-8');
    }
    const [m, p] = decodedAuth.split(':');
    method = m;
    password = p;
  } else {
    const decoded = Buffer.from(authAndServer, 'base64').toString('utf-8');
    const [authPart, serverPart] = decoded.split('@');
    const [hostStr, portStr] = serverPart.split(':');
    address = hostStr;
    port = parseInt(portStr, 10);
    const [m, p] = authPart.split(':');
    method = m;
    password = p;
  }

  return {
    protocol: 'shadowsocks',
    tag,
    settings: {
      servers: [
        {
          address,
          port,
          method,
          password,
        },
      ],
    },
  };
}

function parseVmess(body: string, tag: string): XrayOutbound {
  const b64 = body.split('#')[0];
  const decoded = Buffer.from(b64, 'base64').toString('utf-8');
  const json = JSON.parse(decoded);

  const address = json.add;
  const port = parseInt(json.port, 10);
  const uuid = json.id;
  const alterId = parseInt(json.aid || '0', 10);
  const security = json.scy || 'auto';
  const net = json.net || 'tcp';
  const type = json.type || 'none';
  const path = json.path || '/';
  const host = json.host || '';
  const tls = json.tls === 'tls';

  const streamSettings: any = {
    network: net,
    security: tls ? 'tls' : 'none',
  };

  if (tls) {
    streamSettings.tlsSettings = {
      serverName: json.sni || host || address,
      allowInsecure: false,
    };
  }

  if (net === 'ws') {
    streamSettings.wsSettings = {
      path,
      headers: host ? { Host: host } : {},
    };
  }

  return {
    protocol: 'vmess',
    tag,
    settings: {
      vnext: [
        {
          address,
          port,
          users: [
            {
              id: uuid,
              alterId,
              security,
            },
          ],
        },
      ],
    },
    streamSettings,
  };
}

function parseVless(body: string, tag: string): XrayOutbound {
  const url = new URL(`vless://${body}`);
  const address = url.hostname;
  const port = parseInt(url.port, 10);
  const uuid = url.username;
  const params = url.searchParams;

  const security = params.get('security') || 'none';
  const net = params.get('type') || 'tcp';
  const sni = params.get('sni') || address;
  const path = params.get('path') || '/';
  const host = params.get('host') || '';

  const streamSettings: any = {
    network: net,
    security: security,
  };

  if (security === 'tls') {
    streamSettings.tlsSettings = {
      serverName: sni,
      allowInsecure: false,
    };
  }

  if (net === 'ws') {
    streamSettings.wsSettings = {
      path,
      headers: host ? { Host: host } : {},
    };
  } else if (net === 'grpc') {
    streamSettings.grpcSettings = {
      serviceName: params.get('serviceName') || '',
    };
  }

  return {
    protocol: 'vless',
    tag,
    settings: {
      vnext: [
        {
          address,
          port,
          users: [
            {
              id: uuid,
              encryption: params.get('encryption') || 'none',
            },
          ],
        },
      ],
    },
    streamSettings,
  };
}

function parseTrojan(body: string, tag: string): XrayOutbound {
  const url = new URL(`trojan://${body}`);
  const address = url.hostname;
  const port = parseInt(url.port, 10);
  const password = url.username;
  const params = url.searchParams;

  const security = params.get('security') || 'tls';
  const net = params.get('type') || 'tcp';
  const sni = params.get('sni') || address;

  const streamSettings: any = {
    network: net,
    security: security,
  };

  if (security === 'tls') {
    streamSettings.tlsSettings = {
      serverName: sni,
      allowInsecure: false,
    };
  }

  return {
    protocol: 'trojan',
    tag,
    settings: {
      servers: [
        {
          address,
          port,
          password,
        },
      ],
    },
    streamSettings,
  };
}
