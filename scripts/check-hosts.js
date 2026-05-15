#!/usr/bin/env node
/**
 * check-hosts.js
 * Reads EXPO_PUBLIC_SHARED_BACKEND_HOST from the mobile .env and
 * SHARED_BACKEND_HOST from the web .env, then verifies they match.
 *
 * PASS  both hosts identical → safe to start dev servers
 * FAIL  mismatch detected   → prints exactly what to change and exits 1
 *
 * Run:  node ./scripts/check-hosts.js
 *  or:  npm run check-hosts
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const mobileOnly = process.argv.includes('--mobile-only');

// ── Path resolution ──────────────────────────────────────────────────────────
// Update WEB_ROOT if your folder layout ever changes.
const MOBILE_ROOT = path.resolve(__dirname, '..');
const WEB_ROOT    = path.resolve(MOBILE_ROOT, '..', '..', 'Web', 'lexconnect');

const MOBILE_ENV = path.join(MOBILE_ROOT, '.env');
const MOBILE_ENV_LOCAL = path.join(MOBILE_ROOT, '.env.local');
const WEB_ENV    = path.join(WEB_ROOT, '.env');

// ── .env parser (no dependency on dotenv) ────────────────────────────────────
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) return acc;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      acc[key] = val;
      return acc;
    }, {});
}

// ── Read values ───────────────────────────────────────────────────────────────
const mobileEnv = {
  ...parseEnvFile(MOBILE_ENV),
  ...parseEnvFile(MOBILE_ENV_LOCAL),
};
const webEnv    = parseEnvFile(WEB_ENV);

const mobileHost = (mobileEnv['EXPO_PUBLIC_SHARED_BACKEND_HOST'] ?? '').trim();
const webHost    = (webEnv['SHARED_BACKEND_HOST'] ?? '').trim();

const mobileApiBase = (mobileEnv['EXPO_PUBLIC_API_BASE'] ?? '').trim();
const webAppUrl     = (webEnv['APP_URL'] ?? '').trim();

// ── Extract host from a URL string (no URL polyfill needed here) ──────────────
function extractHost(urlStr) {
  try { return new URL(urlStr).hostname; } catch { return ''; }
}

const mobileApiHost = extractHost(mobileApiBase);
const webAppHost    = extractHost(webAppUrl);

// ── Check env files exist ────────────────────────────────────────────────────
const errors   = [];
const warnings = [];

if (!fs.existsSync(MOBILE_ENV)) {
  errors.push(`Mobile .env not found: ${MOBILE_ENV}`);
}
if (!mobileOnly && !fs.existsSync(WEB_ENV)) {
  errors.push(`Web .env not found: ${WEB_ENV}`);
}

if (errors.length) {
  printBlock('FAIL', 'red', errors.map(e => `  ✗ ${e}`));
  process.exit(1);
}

// ── Validate SHARED_BACKEND_HOST set in both envs ────────────────────────────
if (!mobileHost) {
  errors.push('EXPO_PUBLIC_SHARED_BACKEND_HOST is missing or empty in mobile .env/.env.local');
}
if (!mobileOnly && !webHost) {
  errors.push('SHARED_BACKEND_HOST is missing or empty in web .env');
}

// ── Compare declared hosts ────────────────────────────────────────────────────
if (!mobileOnly && mobileHost && webHost && mobileHost !== webHost) {
  errors.push(
    `Host mismatch!\n` +
    `  Mobile (EXPO_PUBLIC_SHARED_BACKEND_HOST) = ${mobileHost}\n` +
    `  Web    (SHARED_BACKEND_HOST)              = ${webHost}\n` +
    `  Fix: set both values to the same LAN IP.`
  );
}

// ── Cross-check EXPO_PUBLIC_API_BASE host matches declared mobile host ─────────
if (mobileHost && mobileApiHost && mobileApiHost !== mobileHost) {
  errors.push(
    `Mobile EXPO_PUBLIC_API_BASE host (${mobileApiHost}) does not match EXPO_PUBLIC_SHARED_BACKEND_HOST (${mobileHost}).`
  );
}

// ── Cross-check APP_URL host matches declared web host ────────────────────────
if (!mobileOnly && webHost && webAppHost && webAppHost !== webHost) {
  errors.push(
    `Web APP_URL host (${webAppHost}) does not match SHARED_BACKEND_HOST (${webHost}).`
  );
}

// ── Warn if web server IP is different from the one in mobile API base ────────
if (!mobileOnly && mobileApiHost && webAppHost && mobileApiHost !== webAppHost) {
  warnings.push(
    `EXPO_PUBLIC_API_BASE (${mobileApiHost}) and APP_URL (${webAppHost}) point to different servers — mobile and web will NOT share the same database.`
  );
}

// ── Output ────────────────────────────────────────────────────────────────────
if (errors.length) {
  printBlock('FAIL', 'red', [
    ...errors.map(e => `  ✗ ${e}`),
    '',
    '  Run `ipconfig` to get your current LAN IP, then update mobile .env/.env.local and web .env.',
  ]);
  process.exit(1);
}

const lines = [
  `  Mobile (EXPO_PUBLIC_API_BASE)              : ${mobileApiBase || '(not set)'}`,
  `  Mobile (EXPO_PUBLIC_SHARED_BACKEND_HOST)   : ${mobileHost}`,
];

if (!mobileOnly) {
  lines.push(
    `  Web    (APP_URL)                           : ${webAppUrl || '(not set)'}`,
    `  Web    (SHARED_BACKEND_HOST)               : ${webHost}`,
  );
}

if (warnings.length) {
  printBlock('WARN', 'yellow', [...lines, '', ...warnings.map(w => `  ⚠ ${w}`)]);
  process.exit(0);
}

printBlock('PASS', 'green', lines);
process.exit(0);

// ── Helpers ───────────────────────────────────────────────────────────────────
function printBlock(label, color, bodyLines) {
  const colors = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', reset: '\x1b[0m' };
  const c  = colors[color] ?? '';
  const rs = colors.reset;
  const width = 70;
  const bar   = '─'.repeat(width);
  console.log(`\n${c}┌${bar}┐`);
  console.log(`│  LexConnect host check: ${label.padEnd(width - 25)}│`);
  console.log(`├${bar}┤${rs}`);
  bodyLines.forEach(l => console.log(`${c}│${rs}${l.padEnd(width + 2)}${c}│${rs}`));
  console.log(`${c}└${bar}┘${rs}\n`);
}
