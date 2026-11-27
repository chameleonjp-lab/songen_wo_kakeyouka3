import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview } from 'vite';

const projectBase = '/songen_wo_kakeyouka3/';
const serverUrl = 'https://match-server.example';
let output;
let server;
let origin;

beforeAll(async () => {
  output = await mkdtemp(path.join(tmpdir(), 'songen-3-dist-'));
  const buildConfig = { outDir: output };
  await build({
    build: buildConfig,
    define: { 'import.meta.env.VITE_MATCH_SERVER_URL': JSON.stringify(serverUrl) },
    logLevel: 'silent',
  });
  server = await preview({
    build: buildConfig,
    preview: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  });
  origin = 'http://127.0.0.1:' + server.httpServer.address().port;
}, 30_000);

afterAll(async () => {
  await server?.close();
  if (output) await rm(output, { recursive: true, force: true });
});

describe('GitHub Pages output', () => {
  it('serves all six screens and version 1 from the project subpath', async () => {
    const response = await fetch(origin + projectBase);
    expect(response.status).toBe(200);
    const html = await response.text();
    const screens = Array.from(html.matchAll(/data-screen="([^"]+)"/g), match => match[1]);
    expect(screens).toEqual(['home', 'register', 'lobby', 'game', 'announcement', 'score']);
    expect(html).toContain('<meta name="songen-protocol" content="1">');

    const script = html.match(/<script\b[^>]*\bsrc="([^"]+)"/)?.[1];
    const css = html.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/)?.[1];
    expect(script).toMatch(new RegExp('^' + projectBase + 'assets/.+\\.js$'));
    expect(css).toMatch(new RegExp('^' + projectBase + 'assets/.+\\.css$'));

    const [scriptResponse, cssResponse] = await Promise.all([
      fetch(origin + script),
      fetch(origin + css),
    ]);
    expect(scriptResponse.status).toBe(200);
    expect(scriptResponse.headers.get('content-type')).toContain('javascript');
    expect(cssResponse.status).toBe(200);
    expect(cssResponse.headers.get('content-type')).toContain('text/css');
    const bundle = await scriptResponse.text();
    expect(bundle).toContain(serverUrl);
    expect(bundle).not.toMatch(/ROOM_CODE_SECRET|RANKING_API_KEY/);
  });

  it('serves the published social card and omits server files and old 3D assets', async () => {
    const page = await fetch(origin + projectBase);
    const html = await page.text();
    const shareImage = projectBase + 'assets/social-duel-20261127.jpg';
    expect(html).toContain(`<meta property="og:image" content="https://chameleonjp-lab.github.io${shareImage}">`);
    expect(html).toContain(`<meta name="twitter:image" content="https://chameleonjp-lab.github.io${shareImage}">`);

    const response = await fetch(origin + shareImage);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/jpeg');
    const jpeg = Buffer.from(await response.arrayBuffer());
    expect(jpeg.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(jpeg.subarray(-2).toString('hex')).toBe('ffd9');

    const files = await readdir(output, { recursive: true });
    const privateFiles = /(^|\/)(worker|server|wrangler\.toml|\.env[^/]*|\.dev\.vars[^/]*)(\/|$)|\.glb$/;
    expect(files.filter(file => privateFiles.test(file))).toEqual([]);
  });
});
