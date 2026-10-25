#!/usr/bin/env bash
# Capture the running preview at the exact URL for desktop and mobile.
set -euo pipefail

: "${CAPTURE_URL:?Set CAPTURE_URL to the running preview URL.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the capture output directory.}"

log() { printf '[capture] %s\n' "$*"; }
timed() { /usr/bin/time -p "$@"; }

runtime="${HOME}/.local/share/omgithub-playwright"
if [[ ! -d "$runtime/node_modules/playwright" ]]; then
  echo "Playwright runtime is not installed at $runtime (temporary infrastructure failure)." >&2
  exit 75
fi

timed mkdir -p "$CAPTURE_DIR"
capture_script="$(mktemp "${RUNNER_TEMP:-/tmp}/omgithub-capture.XXXXXX.mjs")"
trap 'rm -f "$capture_script"' EXIT

cat > "$capture_script" <<'CAPTURE_JS'
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const runtime = join(process.env.HOME, '.local/share/omgithub-playwright');
const require = createRequire(join(runtime, 'package.json'));
const { chromium } = require('playwright');
const output = process.env.CAPTURE_DIR;
const url = process.env.CAPTURE_URL;
const transferred = (error) => Object.assign(error, { exitCode: 75 });
const seconds = (start) => ((Date.now() - start) / 1000).toFixed(2);
const step = async (label, task) => {
  const start = Date.now();
  try {
    return await task();
  } finally {
    console.log(`[capture] ${label}: ${seconds(start)}s`);
  }
};

const configPath = join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const launchOptions = { ...(config.browser?.launchOptions || {}), timeout: 30000 };
if (process.platform === 'linux' && !process.env.DISPLAY) {
  const displayFile = join(runtime, 'display');
  if (existsSync(displayFile)) process.env.DISPLAY = ':' + readFileSync(displayFile, 'utf8').trim();
}
if (process.platform === 'linux' && !process.env.DISPLAY) {
  // Headless fallback still gives Chromium a software WebGL implementation.
  launchOptions.headless = true;
  launchOptions.args = [
    ...(launchOptions.args || []),
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
  ];
}

const views = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 844, height: 390, isMobile: true },
];

let browser;
const defects = [];
try {
  browser = await step('launch browser', () =>
    chromium.launch(launchOptions).catch((error) => { throw transferred(error); })
  );

  for (const view of views) {
    const page = await step(`new ${view.name} page`, () =>
      browser.newPage({
        viewport: { width: view.width, height: view.height },
        isMobile: view.isMobile,
        hasTouch: view.isMobile,
        deviceScaleFactor: view.isMobile ? 2 : 1,
      }).catch((error) => { throw transferred(error); })
    );
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = await step(`navigate ${view.name}`, () =>
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((error) => {
        throw transferred(error);
      })
    );
    if (!response) throw transferred(new Error(`No HTTP response loading ${url}`));
    if (!response.ok()) {
      const error = new Error(`HTTP ${response.status()} loading ${url}`);
      error.exitCode = [408, 429, 500, 502, 503, 504].includes(response.status()) ? 75 : 1;
      throw error;
    }

    await step(`wait for rendered ${view.name}`, async () => {
      await page.locator('body').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.fonts?.status === 'loaded', { timeout: 15000 }).catch(() => {});
      await page.waitForSelector('canvas', { state: 'visible', timeout: 30000 }).catch((error) => {
        throw Object.assign(new Error(`WebGL canvas did not render: ${error.message}`), { exitCode: 1 });
      });
      await page.waitForFunction(() => document.body.innerText.includes('SCRIPT BUILD'), { timeout: 15000 });
      await page.waitForTimeout(1500);
    });

    if (pageErrors.length) defects.push(`${view.name}: ${pageErrors.join(' | ')}`);

    await step(`screenshot ${view.name}`, () =>
      page.screenshot({ path: join(output, `final-${view.name}.png`), timeout: 30000 }).catch((error) => {
        throw transferred(error);
      })
    );
    console.log(`[capture] ${view.name} captured -> final-${view.name}.png`);
    await page.close().catch(() => {});
  }

  if (defects.length) {
    const error = new Error(`Page errors observed:\n${defects.join('\n')}`);
    error.exitCode = 1;
    throw error;
  }
  console.log('[capture] completed');
} catch (error) {
  console.error(`[capture] ${error.stack || error.message || error}`);
  process.exitCode = error.exitCode || 1;
} finally {
  if (browser) {
    await browser.close().catch((error) => {
      console.error(`[capture] close browser: ${error.message}`);
      process.exitCode ||= 75;
    });
  }
}
CAPTURE_JS

CAPTURE_URL="$CAPTURE_URL" CAPTURE_DIR="$CAPTURE_DIR" DISPLAY="${DISPLAY:-}" \
  timed node "$capture_script"
