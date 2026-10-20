import { Env, FilterOptions } from './types';
import { formatAsBase64, formatAsRaw, getNodesForProfile, PROFILES } from './nodes';
import { renderLoginPage, renderDashboard } from './ui';

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Extract candidate secret and normalized route path from request
 */
function extractAuthAndPath(
  url: URL,
  request: Request,
  expectedSecret: string
): { isAuthorized: boolean; subPath: string } {
  // 1. Check query parameter: ?token=XYZ, ?secret=XYZ, ?key=XYZ
  const querySecret =
    url.searchParams.get('token') ||
    url.searchParams.get('secret') ||
    url.searchParams.get('key');

  if (querySecret && timingSafeEqual(querySecret, expectedSecret)) {
    return { isAuthorized: true, subPath: url.pathname };
  }

  // 2. Check header: X-Secret or Authorization: Bearer XYZ
  const headerSecret = request.headers.get('X-Secret');
  if (headerSecret && timingSafeEqual(headerSecret, expectedSecret)) {
    return { isAuthorized: true, subPath: url.pathname };
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (timingSafeEqual(bearerToken, expectedSecret)) {
      return { isAuthorized: true, subPath: url.pathname };
    }
  }

  // 3. Check first path segment: /<SECRET> or /<SECRET>/sub or /<SECRET>/raw
  const pathSegments = url.pathname.split('/').filter(Boolean);
  if (pathSegments.length > 0) {
    const firstSegment = pathSegments[0];
    if (timingSafeEqual(firstSegment, expectedSecret)) {
      const restPath = '/' + pathSegments.slice(1).join('/');
      return { isAuthorized: true, subPath: restPath === '/' ? '' : restPath };
    }
  }

  return { isAuthorized: false, subPath: url.pathname };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const configuredSecret = env.SUB_SECRET?.trim() || '';

    // Handle root path ("/") for Web UI (Login & Dashboard)
    if (url.pathname === '/' || url.pathname === '') {
      // POST: User submitted the secret in the login form
      if (request.method === 'POST') {
        try {
          const formData = await request.formData();
          const submittedSecret = formData.get('secret')?.toString().trim() || '';

          if (configuredSecret && timingSafeEqual(submittedSecret, configuredSecret)) {
            return new Response(renderDashboard(submittedSecret, url.origin), {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          } else {
            return new Response(renderLoginPage('رمز عبور (Secret Key) نامعتبر است!'), {
              status: 401,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }
        } catch {
          return new Response(renderLoginPage('خطا در پردازش فرم ورود.'), {
            status: 400,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      }

      // GET: If ?secret= or ?token= is passed in query, show dashboard directly
      const querySecret = url.searchParams.get('secret') || url.searchParams.get('token');
      if (configuredSecret && querySecret && timingSafeEqual(querySecret, configuredSecret)) {
        return new Response(renderDashboard(querySecret, url.origin), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      // Otherwise show clean login page
      return new Response(renderLoginPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // For any other path: authenticate via secret
    if (configuredSecret) {
      const { isAuthorized, subPath } = extractAuthAndPath(url, request, configuredSecret);

      if (!isAuthorized) {
        return new Response('404 Not Found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        });
      }

      url.pathname = subPath || '/';
    }

    // If client requested the dashboard via path /<SECRET> or /<SECRET>/
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(renderDashboard(configuredSecret, url.origin), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Determine target profile (default or specific file from profiles/)
    // Can be specified via query param ?file=config1 or ?profile=config1
    const targetProfile = url.searchParams.get('file') || url.searchParams.get('profile') || undefined;

    const filterOptions: FilterOptions = {
      protocol: url.searchParams.get('proto') || url.searchParams.get('type') || undefined,
      remark: url.searchParams.get('remark') || url.searchParams.get('search') || undefined,
      limit: url.searchParams.has('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
      shuffle: url.searchParams.has('shuffle') && url.searchParams.get('shuffle') !== 'false',
    };

    const nodes = await getNodesForProfile(targetProfile, env, filterOptions);

    // Route: /info or /stats
    if (url.pathname === '/stats' || url.pathname === '/info') {
      const protocolCounts: Record<string, number> = {};
      for (const n of nodes) {
        protocolCounts[n.protocol] = (protocolCounts[n.protocol] || 0) + 1;
      }

      return new Response(
        JSON.stringify(
          {
            status: 'ok',
            selectedProfile: targetProfile || 'all',
            totalNodes: nodes.length,
            protocolBreakdown: protocolCounts,
            availableProfiles: Object.keys(PROFILES),
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
        {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    // Check format: raw vs base64
    const format = (url.searchParams.get('format') || '').toLowerCase();
    const isRaw = url.pathname === '/raw' || format === 'raw' || url.searchParams.get('raw') === 'true' || url.searchParams.get('raw') === '1';
    const isJson = url.pathname === '/json' || format === 'json';

    if (isJson) {
      return new Response(JSON.stringify(nodes, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // Profile metadata
    const activeProfileName = targetProfile && PROFILES[targetProfile] ? PROFILES[targetProfile].name : env.SUB_NAME || 'V2Ray Sub';
    const profileTitle = env.PROFILE_TITLE || activeProfileName;
    const titleBase64 = Buffer.from(profileTitle, 'utf-8').toString('base64');

    const expiryDays = parseInt(env.DEFAULT_EXPIRY_DAYS || '365', 10);
    const totalGB = parseInt(env.DEFAULT_TOTAL_GB || '1024', 10);
    const totalBytes = totalGB * 1024 * 1024 * 1024;
    const expireTimestamp = Math.floor(Date.now() / 1000) + expiryDays * 86400;

    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `inline; filename="${activeProfileName.replace(/[^a-zA-Z0-9_\-]/g, '_')}.txt"`,
      'Subscription-Userinfo': `upload=0; download=0; total=${totalBytes}; expire=${expireTimestamp}`,
      'Profile-Update-Interval': '12',
      'Profile-Title': `base64:${titleBase64}`,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    };

    if (isRaw) {
      return new Response(formatAsRaw(nodes), { headers });
    }

    // Standard V2Ray Subscription: Base64
    const base64Body = formatAsBase64(nodes);
    return new Response(base64Body, { headers });
  },
};
