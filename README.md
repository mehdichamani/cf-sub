# Cloudflare Worker V2Ray Subscription Provider (`cf-sub`)

A lightweight, secure, and blazing-fast Cloudflare Worker that serves V2Ray / Xray / Sing-box / Clash / Shadowrocket subscriptions directly from local `.txt` configuration files bundled with the project.

Includes URL secret protection (constant-time verification) and stealth 404 responses to shield your subscription endpoint from unauthorized access and automated web scanners.

---

## 🌟 Key Features

- **File-Based Node Management**: Add your own `.txt` profile files to `profiles/`. This folder is intentionally gitignored, so a fresh clone has no bundled nodes and produces an empty subscription until you add profiles.
- **URL Secret Authentication**: Secure your subscription link with a custom secret token (supports path segment, query param, or HTTP header).
- **Stealth Mode**: Returns standard `404 Not Found` for unauthorized or probing requests, concealing the fact that the Worker is a subscription provider.
- **Multiple Protocols Supported**:
  - `vless://`
  - `vmess://`
  - `trojan://`
  - `ss://` (Shadowsocks)
  - `hysteria2://` / `hy2://`
  - `tuic://`
  - `wireguard://`
- **Smart Filtering & Parameters**: Filter on the fly by protocol (`?proto=vless`), search remarks/labels (`?remark=US`), select specific files (`?file=backup`), randomize (`?shuffle=1`), or limit node count (`?limit=10`).
- **Standard Subscription Headers**: Provides `Subscription-Userinfo`, `Profile-Title`, and `Profile-Update-Interval` for client integration.
- **Raw & Base64 Modes**: Serves standard Base64 encoding by default, with `format=raw` for quick inspection in browsers or terminals.

---

## 📁 Project Structure

```text
cf-sub/
├── .dev.vars.example    # Template for local development secrets
├── .gitignore           # Git ignore list (protects secrets & node_modules)
├── env.d.ts             # TypeScript declarations for .txt modules
├── package.json         # Project scripts & dependencies
├── pnpm-workspace.yaml  # Package manager configuration
├── tsconfig.json        # TypeScript configuration
├── wrangler.jsonc       # Cloudflare Wrangler configuration
├── README.md            # Documentation
├── profiles/            # Optional, gitignored .txt node profiles
├── tools/
│   └── generate-profiles.ts
└── src/
    ├── index.ts         # Worker entrypoint, routing & security
    ├── nodes.ts         # Text parsing, deduplication & formatting
    └── types.ts         # TypeScript type definitions
```

---

## 🚀 Quick Start

### 1. Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v20+) and `pnpm` (or `npm`) installed.

### 2. Configure Environment & Secret

Create or edit [`.env`](./.env) and set your custom secret:

```ini
SUB_SECRET="your-secure-random-secret"
```

### 3. Add Your Profiles (Optional)

Create a `.txt` file in `profiles/` (for example, `profiles/my-nodes.txt`) and add your configuration links, one per line:

```text
# Main nodes
vless://uuid@domain.com:443?security=tls&type=ws#US-Server
trojan://password@domain.com:443?security=tls#DE-Server
```

> **Note**: Lines starting with `#` or `//` and blank lines are ignored.

The `profiles/` directory and generated `src/generated-profiles.ts` are gitignored. The `dev`, `deploy`, and `typecheck` npm scripts regenerate the profile module automatically. With no `.txt` files in `profiles/`, the worker starts with no profile nodes; you can still provide nodes through `EXTRA_NODES`.

### 4. Run Locally

Start the local development server:

```bash
pnpm dev
# or: npm run dev
```

Test your subscription locally:

```bash
# Path-based secret (default base64 subscription)
curl http://localhost:8787/your-secure-random-secret

# Plain text raw format
curl http://localhost:8787/your-secure-random-secret/raw

# Diagnostic metadata
curl http://localhost:8787/your-secure-random-secret/stats
```

---

## 🔒 URL Secret Security & Usage

### Supported URL Patterns

Once deployed to `https://<your-worker>.<subdomain>.workers.dev`:

| Pattern | Description | Example URL |
| :--- | :--- | :--- |
| **Path Secret (Default)** | Standard Base64 subscription | `https://your-worker.workers.dev/<SUB_SECRET>` |
| **Path Secret + `/sub`** | Explicit sub path | `https://your-worker.workers.dev/<SUB_SECRET>/sub` |
| **Path Secret + `/raw`** | Plain text node list | `https://your-worker.workers.dev/<SUB_SECRET>/raw` |
| **Query Parameter** | Compatible with all paths | `https://your-worker.workers.dev/?token=<SUB_SECRET>` |
| **Alternative Query** | Alternative param names | `https://your-worker.workers.dev/sub?secret=<SUB_SECRET>` |
| **HTTP Header** | For programmatic API access | Header `X-Secret: <SUB_SECRET>` or `Authorization: Bearer <SUB_SECRET>` |

If an unauthorized request is sent (wrong secret or missing secret), the Worker immediately returns `404 Not Found`.

---

## ⚡ URL Query Filters

You can append query parameters to tailor the generated subscription:

| Query Parameter | Example | Purpose |
| :--- | :--- | :--- |
| `format=raw` or `raw=1` | `?format=raw` | Output plain text links instead of Base64 |
| `proto=<name>` | `?proto=vless` | Filter only nodes using the specified protocol |
| `file=<filename>` | `?file=backup` | Load only from a specific file (e.g. `nodes/backup.txt`) |
| `remark=<keyword>` | `?remark=US` | Filter nodes containing the keyword in their name/label |
| `limit=<number>` | `?limit=5` | Return only the top N nodes |
| `shuffle=1` | `?shuffle=1` | Randomize the order of nodes |

**Combined Example:**
```text
https://your-worker.workers.dev/<SUB_SECRET>?proto=vless&remark=US&limit=3
```

---

## ☁️ Deployment to Cloudflare Workers

### 1. Log in to Cloudflare

```bash
pnpm wrangler login
```

### 2. Set Your Production Secret

Set `SUB_SECRET` in Cloudflare's encrypted environment:

```bash
pnpm wrangler secret put SUB_SECRET
```

Enter your chosen secret key when prompted.

### 3. Deploy

```bash
pnpm run deploy
```

Once deployed, your subscription link is live and ready to import into clients such as v2rayN, Shadowrocket, Sing-box, or Clash!

---

## 🛠️ Adding More Profiles

Add any number of `.txt` files to `profiles/`; each file becomes a selectable profile automatically on the next `pnpm dev` or `pnpm run deploy`. No imports or source-code changes are needed.
