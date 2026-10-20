import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

interface PageConfig {
  renderer?: string;
  navigationStyle?: string;
  usingComponents?: Record<string, string>;
}

function readConfig(path: string): PageConfig {
  return JSON.parse(readFileSync(path, 'utf8')) as PageConfig;
}

it('all Skyline pages use custom navigation after applying page overrides', () => {
  const app = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')) as {
    pages: string[];
    renderer?: string;
    window?: PageConfig;
  };
  for (const path of app.pages) {
    const page = readConfig(`miniprogram/${path}.json`);
    if ((page.renderer ?? app.renderer) === 'skyline') {
      expect(page.navigationStyle ?? app.window?.navigationStyle, path).toBe('custom');
    }
  }
});

it('the foundation page registers and renders the existing custom navigation bar', () => {
  const page = readConfig('miniprogram/pages/foundation/index.json');
  expect(page.usingComponents?.['navigation-bar']).toBe('/components/navigation-bar/navigation-bar');
  const template = readFileSync('miniprogram/pages/foundation/index.wxml', 'utf8');
  expect(template).toContain('<navigation-bar ');
});

it('foundation status sections depend on page data rather than literal truthy strings', () => {
  const template = readFileSync('miniprogram/pages/foundation/index.wxml', 'utf8');
  for (const field of ['error', 'checked', 'requestId']) {
    expect(template).toContain(`wx:if="{{${field}}}"`);
  }
});
