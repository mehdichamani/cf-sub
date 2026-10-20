#!/usr/bin/env bash
# ==============================================================================
# cf-sub interactive management launcher
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env"

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️ .env file not found. Creating initial template...${NC}"
    cat << 'EOF' > "$ENV_FILE"
# Cloudflare Wrangler Configuration
CLOUDFLARE_API_TOKEN=""
CLOUDFLARE_ACCOUNT_ID=""
CHAIN_PROXY="socks5://127.0.0.1:10808"
EOF
    chmod 600 "$ENV_FILE"
  fi
}

check_credentials() {
  ensure_env
  if ! grep -q 'CLOUDFLARE_API_TOKEN="cf' "$ENV_FILE" && ! grep -q 'CLOUDFLARE_API_TOKEN=cf' "$ENV_FILE"; then
    echo -e "${RED}❌ CLOUDFLARE_API_TOKEN in .env is missing or invalid!${NC}"
    echo -e "${CYAN}Please open .env and set your Cloudflare API token.${NC}"
    return 1
  fi
  return 0
}

# 1. Direct Node Test
do_test() {
  echo -e "\n${BLUE}=======================================${NC}"
  echo -e "${CYAN}🔄 Running direct node test & curation (Direct)...${NC}"
  echo -e "${BLUE}=======================================${NC}\n"
  pnpm run curate
  echo -e "\n${GREEN}✔ Direct node test completed successfully.${NC}\n"
}

# 2. Chained Node Test
do_test_chain() {
  echo -e "\n${BLUE}=======================================${NC}"
  echo -e "${MAGENTA}🔗 Running chained node test & curation (Chain Test)...${NC}"
  echo -e "${BLUE}=======================================${NC}\n"
  ensure_env
  local current_chain
  current_chain=$(grep -E '^CHAIN_PROXY=' "$ENV_FILE" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
  if [ -z "$current_chain" ]; then
    current_chain="socks5://127.0.0.1:10808"
    echo "CHAIN_PROXY=\"$current_chain\"" >> "$ENV_FILE"
  fi
  echo -e "${YELLOW}Landing Proxy: ${BOLD}${current_chain}${NC}\n"
  pnpm run curate:chain
  echo -e "\n${GREEN}✔ Chained node test completed successfully.${NC}\n"
}

# 3. Local Dev
do_dev() {
  echo -e "\n${BLUE}=======================================${NC}"
  echo -e "${CYAN}💻 Starting local Cloudflare Worker development server (wrangler dev)...${NC}"
  echo -e "${BLUE}=======================================${NC}\n"
  ensure_env
  pnpm exec wrangler dev --env-file "$ENV_FILE"
}

# 4. Cloudflare Deploy
do_deploy() {
  echo -e "\n${BLUE}=======================================${NC}"
  echo -e "${CYAN}☁️ Deploying to Cloudflare Workers...${NC}"
  echo -e "${BLUE}=======================================${NC}\n"
  check_credentials || return 1
  pnpm exec wrangler deploy --env-file "$ENV_FILE"
  echo -e "\n${GREEN}✔ Deployment successful!${NC}\n"
}

# 5. Set Cloudflare Secret
do_secret() {
  echo -e "\n${BLUE}=======================================${NC}"
  echo -e "${CYAN}🔑 Setting secret (SUB_SECRET) on Cloudflare Workers...${NC}"
  echo -e "${BLUE}=======================================${NC}\n"
  check_credentials || return 1

  local default_secret=""
  if [ -f "$ENV_FILE" ]; then
    default_secret=$(grep -E '^SUB_SECRET=' "$ENV_FILE" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
  fi

  local secret_val=""
  if command -v gum >/dev/null 2>&1; then
    if [ -n "$default_secret" ]; then
      echo -e "${YELLOW}Current secret in .env: ${BOLD}${default_secret}${NC}"
    fi
    secret_val=$(gum input --placeholder "Enter value for SUB_SECRET..." --value "$default_secret")
  else
    echo -n "Enter value for SUB_SECRET (default: $default_secret): "
    read -r input_val
    secret_val="${input_val:-$default_secret}"
  fi

  if [ -z "$secret_val" ]; then
    echo -e "${RED}❌ Secret cannot be empty!${NC}"
    return 1
  fi

  echo -e "${CYAN}Sending SUB_SECRET to Cloudflare...${NC}"
  echo "$secret_val" | pnpm exec wrangler secret put SUB_SECRET --env-file "$ENV_FILE"

  if ! grep -q "^SUB_SECRET=" "$ENV_FILE"; then
    echo "SUB_SECRET=\"$secret_val\"" >> "$ENV_FILE"
  else
    sed -i "s|^SUB_SECRET=.*|SUB_SECRET=\"$secret_val\"|" "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"

  echo -e "\n${GREEN}✔ Secret SUB_SECRET saved to Cloudflare and synced with .env.${NC}\n"
}

# 6. Check Identity / Whoami
do_whoami() {
  echo -e "\n${BLUE}=======================================${NC}"
  echo -e "${CYAN}👤 Checking Cloudflare authentication status...${NC}"
  echo -e "${BLUE}=======================================${NC}\n"
  check_credentials || return 1
  pnpm exec wrangler whoami --env-file "$ENV_FILE"
}

menu_gum() {
  while true; do
    echo -e "\n${BOLD}${CYAN}🚀 cf-sub Management Menu${NC}"
    local choice
    choice=$(gum choose \
      "1. Test nodes directly (Direct Test)" \
      "2. Test nodes via landing proxy (Chain Test)" \
      "3. Local dev server (wrangler dev)" \
      "4. Deploy to Cloudflare (wrangler deploy)" \
      "5. Set Cloudflare secret (wrangler secret put)" \
      "6. Check Cloudflare account (wrangler whoami)" \
      "7. Exit")

    case "$choice" in
      *"1."*) do_test ;;
      *"2."*) do_test_chain ;;
      *"3."*) do_dev ;;
      *"4."*) do_deploy ;;
      *"5."*) do_secret ;;
      *"6."*) do_whoami ;;
      *"7."*|"") exit 0 ;;
    esac
  done
}

menu_fallback() {
  while true; do
    echo -e "\n${BOLD}${CYAN}================ cf-sub Launcher ================${NC}"
    echo -e "1) Direct node test (${YELLOW}pnpm run curate${NC})"
    echo -e "2) Chained node test with landing proxy (${MAGENTA}pnpm run curate:chain${NC})"
    echo -e "3) Local dev (${YELLOW}wrangler dev${NC})"
    echo -e "4) Deploy to Cloudflare (${YELLOW}wrangler deploy${NC})"
    echo -e "5) Set Cloudflare secret (${YELLOW}wrangler secret put${NC})"
    echo -e "6) Check Cloudflare connection (${YELLOW}whoami${NC})"
    echo -e "q) Exit"
    echo -n "Select an option [1-6 / q]: "
    read -r choice
    case "$choice" in
      1) do_test ;;
      2) do_test_chain ;;
      3) do_dev ;;
      4) do_deploy ;;
      5) do_secret ;;
      6) do_whoami ;;
      q|Q) exit 0 ;;
      *) echo -e "${RED}Invalid option!${NC}" ;;
    esac
  done
}

# Direct CLI arguments support
case "$1" in
  test|curate)
    do_test
    ;;
  test:chain|chain|curate:chain)
    do_test_chain
    ;;
  dev|local)
    do_dev
    ;;
  deploy)
    do_deploy
    ;;
  secret)
    do_secret
    ;;
  whoami)
    do_whoami
    ;;
  "")
    if [ -t 0 ] && command -v gum >/dev/null 2>&1; then
      menu_gum
    else
      menu_fallback
    fi
    ;;
  *)
    echo "Usage: $0 [test|chain|dev|deploy|secret|whoami]"
    exit 1
    ;;
esac
