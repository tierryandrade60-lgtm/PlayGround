#!/usr/bin/env bash
# Install, build and serve the static app for the preview controller.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(readlink -f "$script_dir")"
web_dir="${OPENCODE_WEB_DIR:-${RUNNER_TEMP:-/tmp}/omgithub-web}"
port="${PORT:-3000}"

if [[ ! "$port" =~ ^[0-9]+$ ]]; then
  echo "PORT must be numeric (got '$port')." >&2
  exit 1
fi

log() { printf '[start] %s\n' "$*"; }
timed() { /usr/bin/time -p "$@"; }

mkdir -p "$web_dir"
cd "$project_dir"

if [[ ! -f package.json ]] || [[ ! -f vite.config.ts ]]; then
  echo "Expected package.json and vite.config.ts in $project_dir." >&2
  exit 1
fi

deps_hash="$(sha256sum package.json package-lock.json 2>/dev/null | sha256sum | cut -d' ' -f1)"
deps_stamp="$web_dir/dependencies.sha256"
need_install=false
if [[ ! -x node_modules/.bin/vite ]] || [[ ! -d node_modules ]]; then
  need_install=true
elif [[ ! -f "$deps_stamp" ]] || [[ "$(cat "$deps_stamp")" != "$deps_hash" ]]; then
  need_install=true
fi

if [[ "$need_install" == true ]]; then
  log "Installing dependencies (legacy peer resolution for the Vite/esbuild mismatch)"
  if [[ -f package-lock.json ]]; then
    timed npm ci --legacy-peer-deps --no-audit --no-fund
  else
    timed npm install --legacy-peer-deps --no-audit --no-fund
  fi
  printf '%s' "$deps_hash" > "$deps_stamp"
else
  log "Dependencies are up to date"
fi

log "Building static bundle into $project_dir/dist"
timed npm run build

if [[ ! -f "$project_dir/dist/index.html" ]]; then
  echo "Build did not produce dist/index.html." >&2
  exit 1
fi

timed node -e '
const fs = require("node:fs");
const path = require("node:path");
const [projectDir, outputDir, webDir] = process.argv.slice(1);
const payload = {
  project: path.resolve(projectDir),
  directory: path.resolve(outputDir),
};
fs.mkdirSync(webDir, { recursive: true });
fs.writeFileSync(path.join(webDir, "deployment-output.json"), JSON.stringify(payload));
console.log(JSON.stringify(payload));
' "$project_dir" "$project_dir/dist" "$web_dir"

log "Serving $project_dir/dist on 0.0.0.0:$port"
exec ./node_modules/.bin/vite preview --host 0.0.0.0 --port "$port" --strictPort
