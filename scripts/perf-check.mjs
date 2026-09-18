#!/usr/bin/env node
/**
 * Daily Smokz — website performance diagnostic.
 *
 * Measures WHERE the time goes for each API request by breaking a request into
 * its phases (DNS, TCP connect, TLS handshake, TTFB = time the server takes to
 * start responding, and Download = time to transfer the body). Run it against
 * your LIVE backend to see, per endpoint, whether the slowness is:
 *   - Waiting/TTFB  -> the server (app/DB/connection) is slow to produce data
 *   - Download      -> the response is large / the network link is slow
 *   - Connect/TLS   -> a new connection is being made each time (setup cost)
 *
 * It hits each endpoint SEVERAL times so you can see if timings are consistent
 * or jump around (variable timings usually mean connection/pooler contention).
 *
 * No dependencies — uses only Node's built-in https/http. Node 18+ recommended.
 *
 * USAGE (from the repo root or anywhere):
 *   node scripts/perf-check.mjs \
 *     --base https://daily-smkz-inventory.onrender.com \
 *     --email admin@vapeshop.com \
 *     --password 'YourPassword' \
 *     --runs 5
 *
 * You can also set env vars instead of flags:
 *   PERF_BASE, PERF_EMAIL, PERF_PASSWORD, PERF_RUNS
 *
 * Auth is optional: if you omit --email/--password it still tests the public
 * endpoints (/health, /version) so you at least get a baseline.
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const BASE = (arg('base', process.env.PERF_BASE) || '').replace(/\/$/, '');
const EMAIL = arg('email', process.env.PERF_EMAIL) || '';
const PASSWORD = arg('password', process.env.PERF_PASSWORD) || '';
const RUNS = parseInt(arg('runs', process.env.PERF_RUNS) || '5', 10);
const PREFIX = arg('prefix', process.env.PERF_PREFIX) || '/api/v1';

if (!BASE) {
  console.error(
    '\nERROR: no base URL.\n' +
      'Example:\n' +
      "  node scripts/perf-check.mjs --base https://daily-smkz-inventory.onrender.com --email admin@vapeshop.com --password 'pw' --runs 5\n",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// A single timed request. Returns per-phase timings in milliseconds.
// ---------------------------------------------------------------------------
function timedRequest(method, urlStr, { headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const t = { start: process.hrtime.bigint() };
    const marks = {};

    const req = lib.request(
      url,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
      },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk) => {
          if (marks.firstByte === undefined) marks.firstByte = now(t);
          bytes += chunk.length;
        });
        res.on('end', () => {
          marks.end = now(t);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            status: res.statusCode,
            bytes,
            // Phase breakdown (ms since request start):
            dns: marks.dns ?? null,
            connect: marks.connect ?? null,
            tls: marks.tls ?? null,
            ttfb: marks.firstByte ?? marks.end, // time to first byte (server "waiting")
            download:
              marks.firstByte !== undefined
                ? +(marks.end - marks.firstByte).toFixed(1)
                : 0,
            total: marks.end,
          });
        });
      },
    );

    req.on('socket', (socket) => {
      socket.on('lookup', () => (marks.dns = now(t)));
      socket.on('connect', () => (marks.connect = now(t)));
      socket.on('secureConnect', () => (marks.tls = now(t)));
    });

    req.on('error', (err) => {
      resolve({ ok: false, status: 0, error: err.message, total: now(t) });
    });

    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function now(t) {
  return +(Number(process.hrtime.bigint() - t.start) / 1e6).toFixed(1);
}

function fmtBytes(n) {
  if (n == null) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function stats(nums) {
  const arr = nums.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!arr.length) return { min: 0, max: 0, avg: 0, median: 0 };
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    min: arr[0],
    max: arr[arr.length - 1],
    avg: +(sum / arr.length).toFixed(0),
    median: arr[Math.floor(arr.length / 2)],
  };
}

// ---------------------------------------------------------------------------
// Run one endpoint N times and summarize.
// ---------------------------------------------------------------------------
async function probe(label, method, path, opts = {}) {
  const urlStr = path.startsWith('http') ? path : `${BASE}${path}`;
  const results = [];
  for (let i = 0; i < RUNS; i++) {
    results.push(await timedRequest(method, urlStr, opts));
  }
  const good = results.filter((r) => r.ok);
  const totals = results.map((r) => r.total);
  const ttfbs = good.map((r) => r.ttfb);
  const downloads = good.map((r) => r.download);
  const sizeBytes = good.length ? good[good.length - 1].bytes : null;
  const sTotal = stats(totals);
  const sTtfb = stats(ttfbs);
  const sDown = stats(downloads);

  const status = good.length
    ? good[0].status
    : results[0].status || results[0].error || 'ERR';

  console.log(
    `\n${label}\n` +
      `  ${method} ${path}\n` +
      `  status: ${status}   size: ${fmtBytes(sizeBytes)}\n` +
      `  total   ms:  min ${sTotal.min}  median ${sTotal.median}  max ${sTotal.max}  avg ${sTotal.avg}\n` +
      `  waiting ms:  min ${sTtfb.min}  median ${sTtfb.median}  max ${sTtfb.max}   <- server time (TTFB)\n` +
      `  download ms: min ${sDown.min}  median ${sDown.median}  max ${sDown.max}   <- transfer time\n` +
      `  each total:  [${totals.join(', ')}]`,
  );

  return { label, sTotal, sTtfb, sDown, sizeBytes };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function login() {
  if (!EMAIL || !PASSWORD) return null;
  const res = await timedRequest('POST', `${BASE}${PREFIX}/auth/login`, {
    body: { email: EMAIL, password: PASSWORD },
  });
  // Re-request to actually read the token body (timedRequest discards body).
  const token = await fetchToken();
  console.log(
    `\nLOGIN  POST ${PREFIX}/auth/login\n` +
      `  status: ${res.status}   total: ${res.total} ms   ${token ? 'token OK' : 'NO TOKEN (check credentials)'}`,
  );
  return token;
}

// A minimal fetch that returns the parsed JSON body (for the token).
function fetchToken() {
  return new Promise((resolve) => {
    const url = new URL(`${BASE}${PREFIX}/auth/login`);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = JSON.stringify({ email: EMAIL, password: PASSWORD });
    const req = lib.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json?.data?.accessToken || null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log(`PERF CHECK  ->  ${BASE}`);
  console.log(`runs per endpoint: ${RUNS}`);
  console.log('='.repeat(70));

  // 1) Public baseline — no auth, minimal work. Establishes the "floor".
  await probe('HEALTH (public, trivial)', 'GET', '/health');

  // 2) Authenticate.
  const token = await login();
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  if (!token && (EMAIL || PASSWORD)) {
    console.log(
      '\n(!) Could not authenticate — protected endpoints will 401. ' +
        'Double-check --email/--password. Public results above are still valid.',
    );
  }

  // 3) The endpoints that were slow in the browser Network tab.
  const summaries = [];
  summaries.push(
    await probe('PRODUCTS list (limit 200)', 'GET', `${PREFIX}/products?limit=200&page=1`, { headers: authHeaders }),
  );
  summaries.push(
    await probe('BRANDS list (limit 200)', 'GET', `${PREFIX}/brands?limit=200`, { headers: authHeaders }),
  );
  summaries.push(
    await probe('BRANCHES list', 'GET', `${PREFIX}/branches?limit=200`, { headers: authHeaders }),
  );
  summaries.push(
    await probe('USERS list', 'GET', `${PREFIX}/users?limit=100`, { headers: authHeaders }),
  );
  summaries.push(
    await probe('SALES pending', 'GET', `${PREFIX}/sales/pending?limit=200`, { headers: authHeaders }),
  );
  summaries.push(
    await probe('DASHBOARD stats', 'GET', `${PREFIX}/stats/dashboard`, { headers: authHeaders }),
  );

  // 4) Verdict.
  console.log('\n' + '='.repeat(70));
  console.log('VERDICT');
  console.log('='.repeat(70));
  for (const s of summaries) {
    if (!s) continue;
    const waiting = s.sTtfb.median;
    const download = s.sDown.median;
    const size = s.sizeBytes || 0;
    let cause;
    if (s.sTotal.median < 400) {
      cause = 'OK — fast';
    } else if (download > waiting && download > 300) {
      cause = `SLOW: DOWNLOAD (payload ${fmtBytes(size)} is heavy or link is slow)`;
    } else if (waiting > 400) {
      cause = 'SLOW: WAITING/TTFB (server is slow to produce the response)';
    } else {
      cause = 'SLOW: connection/other';
    }
    console.log(
      `  ${s.label.padEnd(28)} total ${String(s.sTotal.median).padStart(5)}ms  ` +
        `(wait ${waiting}ms / download ${download}ms)  -> ${cause}`,
    );
  }
  console.log(
    '\nHOW TO READ:\n' +
      '  - If WAITING/TTFB is the big number on the slow endpoints, the delay is\n' +
      '    server-side (app or DB connection), NOT your network.\n' +
      '  - If DOWNLOAD is big while size is small, the network link is slow.\n' +
      '  - If the SAME endpoint varies a lot run-to-run (see "each total"), that\n' +
      '    points to connection/pooler contention or throttling.\n' +
      '  - Compare HEALTH (trivial) vs the lists: if HEALTH is fast but the lists\n' +
      "    are slow with tiny size, it's per-request server work, not the payload.\n",
  );
}

main().catch((e) => {
  console.error('perf-check failed:', e);
  process.exit(1);
});
