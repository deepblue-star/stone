import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

type Component = { sku_id: string };
type Position = Component & { x: number; y: number; size: number };
type Bead = Position & { index: number; url: string; selected: boolean; style: string };
type Rect = { left: number; top: number; width: number; height: number };
type TouchEvent = { currentTarget?: { dataset: { index?: number } }; touches: { clientX?: number; clientY?: number; x?: number; y?: number }[] };
type BeadTapEvent = { currentTarget: { dataset: { index?: number | string } } };
type CanvasMethod = 'scale' | 'clearRect' | 'fillRect' | 'beginPath' | 'arc' | 'stroke' | 'save' | 'clip' | 'drawImage' | 'restore';
type CanvasContext = Record<CanvasMethod, ReturnType<typeof vi.fn>>;
interface CanvasImage { onload?: () => void; onerror?: () => void; src?: string }
interface Canvas { width: number; height: number; getContext(): CanvasContext | null; createImage(): CanvasImage }
interface EditorData {
  components: Component[]; previewMode: string; nativeCanvasMounted: boolean; previewBeads: Bead[]; previewStyle: string;
  loading: boolean; selected: number; name: string; priceText: string; perimeterText: string; count: number;
}
interface Page {
  data: EditorData; bySku: Record<string, { diameter_mm: number }>; canvasRect: Rect; canvasSize: { width: number; height: number }; canvas: Canvas | null; positions: Position[];
  setData(patch: Partial<EditorData>, callback?: () => void): void;
  onLoad(options: Record<string, string>): void; onReady(): void; onUnload(): void; onResize(): void;
  add(event: { currentTarget: { dataset: { id: string } } }): void; tools(): void;
  touchStart(event: TouchEvent): void; touchMove(event: TouchEvent): void; touchEnd(): void;
  selectPreviewBead(event: BeadTapEvent): void;
  previewImageError(event: { currentTarget: { dataset: { url: string } } }): void;
}
interface DesignModel { ringLayout(components: Component[], materials: Page['bySku'], width: number, height: number): Position[] }
const material = (id: string, diameter_mm: number, url: string) => ({ id, price_cent: 300, diameter_mm, image_file_id: url, is_on_sale: true, available_stock: 20 });
const skus = [material('a', 6, 'https://example.test/a.png'), material('b', 10, '')];

function editor(options: { native?: 'valid' | 'null' | 'throw'; platform?: 'devtools' | 'ios'; nativeQueryHangs?: boolean; allQueriesHang?: boolean; draft?: object; deferredQuery?: boolean; deferredLoad?: boolean } = {}) {
  let page: Page;
  let rect: Rect = { left: 16, top: 120, width: 390, height: 282.9 };
  const pendingQueries: (() => void)[] = [];
  const pendingLoads: (() => void)[] = [];
  const images: CanvasImage[] = [];
  const context = Object.fromEntries(['scale', 'clearRect', 'fillRect', 'beginPath', 'arc', 'stroke', 'save', 'clip', 'drawImage', 'restore'].map(name => [name, vi.fn()])) as CanvasContext;
  const canvas: Canvas = { width: 0, height: 0, getContext: () => {
    if (options.native === 'throw') throw new Error('Canvas unavailable');
    return options.native === 'null' ? null : context;
  }, createImage: () => { const image = {}; images.push(image); return image; } };
  let action = 0;
  const storage = new Map<string, object>(options.draft ? [['stone.designDraft.new', options.draft]] : []);
  const updates = vi.fn();
  const nodeQueries = vi.fn();
  const boundsQueries = vi.fn();
  const wx = {
    cloud: { callFunction: async ({ data: { action: name, payload } }: { data: { action: string; payload: Record<string, string> } }) => {
      if (options.deferredLoad) await new Promise<void>(done => pendingLoads.push(done));
      const data = name === 'getMyAvailableSkuCoupons' ? { items: [{ sku_id: 'a', available_count: 1 }] } : {
        categories: [{ id: 'beads', name: '珠子' }],
        items: payload.catalog_type === 'BEAD' ? [{ name: '白水晶', category_id: 'beads', is_on_sale: true, skus }] : [],
        image_urls: { 'https://example.test/a.png': 'https://example.test/a.png' },
      };
      return { result: { ok: true, code: 'OK', message: '', request_id: 'test', data } };
    } },
    getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: object) => storage.set(key, value),
    showToast: vi.fn(), showActionSheet: ({ success }: { success: (answer: { tapIndex: number }) => void }) => success({ tapIndex: action }),
    showModal: ({ success }: { success: (answer: { confirm: boolean }) => void }) => success({ confirm: true }),
    getWindowInfo: () => ({ pixelRatio: 2, windowWidth: 390, windowHeight: 762, screenHeight: 844, statusBarHeight: 47, safeArea: { top: 47, bottom: 810 } }),
    getDeviceInfo: () => ({ platform: options.platform || 'ios' }),
    createSelectorQuery: () => {
      const requests: { selector: string; node: boolean }[] = [];
      let selector = '';
      const query = { in: () => query, select: (value: string) => { selector = value; return query; },
        fields: () => { nodeQueries(selector); requests.push({ selector, node: true }); return query; },
        boundingClientRect: () => { boundsQueries(selector); requests.push({ selector, node: false }); return query; },
        exec: (callback: (result: unknown[]) => void) => {
          if (options.allQueriesHang || (options.nativeQueryHangs && requests.some(request => request.node))) return;
          const finish = () => callback(requests.map(request => request.node ? options.native ? { node: canvas, width: rect.width, height: rect.height } : { width: rect.width, height: rect.height } : { ...rect }));
          if (options.deferredQuery) pendingQueries.push(finish); else finish();
        } };
      return query;
    },
  };
  const modules = new Map<string, unknown>();
  const loadModule = (file: string): unknown => {
    if (modules.has(file)) return modules.get(file);
    const module: { exports: unknown } = { exports: {} };
    runInNewContext(readFileSync(file, 'utf8'), { module, wx, require: (specifier: string) => loadModule(resolve(dirname(file), specifier + '.js')) });
    modules.set(file, module.exports); return module.exports;
  };
  runInNewContext(readFileSync('miniprogram/pages/editor/index.js', 'utf8'), {
    wx, require: (specifier: string) => loadModule(resolve('miniprogram/pages/editor', specifier + '.js')),
    Page: (config: unknown) => { page = config as Page; page.data = structuredClone(page.data); page.setData = (patch: Partial<EditorData>, callback?: () => void) => { updates(patch); Object.assign(page.data, patch); if (callback) callback(); }; },
  });
  const model = loadModule(resolve('miniprogram/services/design-model.js')) as DesignModel;
  return {
    get page() { return page!; }, context, images, updates, nodeQueries, boundsQueries, pendingQueries, pendingLoads,
    start: async () => { page.onLoad({}); page.onReady(); await vi.waitFor(() => expect(page.data.loading).toBe(false)); },
    add: (id: string) => page.add({ currentTarget: { dataset: { id } } }),
    tool: (tapIndex: number) => { action = tapIndex; page.tools(); },
    resize: (value: Rect) => { rect = value; page.onResize(); },
    layout: () => model.ringLayout(page.data.components, page.bySku, page.canvasSize.width, page.canvasSize.height),
  };
}

it('starts with a visible fallback branch before any unsupported canvas can render', () => {
  const p = editor({ platform: 'devtools' });
  expect(p.page.data.previewMode).toBe('fallback');
  expect(p.page.data.nativeCanvasMounted).toBe(false);
  expect(readFileSync('miniprogram/pages/editor/index.wxml', 'utf8')).toContain('<canvas wx:if="{{nativeCanvasMounted}}"');
});

it('never requests native nodes in devtools where a fields query would block every callback', async () => {
  const p = editor({ platform: 'devtools', native: 'valid', nativeQueryHangs: true });
  await p.start(); p.add('a'); p.add('b');
  expect(p.nodeQueries).not.toHaveBeenCalled();
  expect(p.boundsQueries).not.toHaveBeenCalled();
  expect(p.page.data.previewMode).toBe('fallback');
  expect(p.page.data.nativeCanvasMounted).toBe(false);
  expect(p.page.canvasSize).toEqual({ width: 283, height: 283 });
  expect(p.page.data.previewBeads.map(bead => bead.sku_id)).toEqual(['a', 'b']);
  expect(p.page.positions).toEqual(p.layout());
});

it('keeps the fallback visible while a mounted native canvas node query never returns', async () => {
  const p = editor({ native: 'valid', nativeQueryHangs: true }); await p.start(); p.add('a');
  expect(p.page.data.previewMode).toBe('fallback');
  expect(p.page.data.nativeCanvasMounted).toBe(true);
  expect(p.page.data.previewBeads).toHaveLength(1);
  expect(p.page.data.previewBeads[0]!.url).toBe('https://example.test/a.png');
  expect(p.context.clearRect).not.toHaveBeenCalled();
  const markup = readFileSync('miniprogram/pages/editor/index.wxml', 'utf8');
  expect(markup).toContain('wx:if="{{previewMode!==\'canvas\'}}" class="bracelet-preview"');
  expect(markup).toContain("{{previewMode==='canvas'?'':'bracelet-canvas-pending'}}");
  expect(readFileSync('miniprogram/pages/editor/index.wxss', 'utf8')).toMatch(/\.bracelet-canvas-pending\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/);
});

it('renders two actual beads without any selector callback using the explicit simulator square', async () => {
  const p = editor({ platform: 'devtools', allQueriesHang: true });
  await p.start(); p.add('a'); p.add('b');
  expect(p.page.data.previewBeads).toHaveLength(2);
  expect(p.page.data.previewBeads[0]!.url).toBe('https://example.test/a.png');
  expect(p.page.data.previewStyle).toBe('width:283px;height:283px;');
  expect(p.nodeQueries).not.toHaveBeenCalled(); expect(p.boundsQueries).not.toHaveBeenCalled();
  const [first, second] = p.page.data.previewBeads;
  p.page.touchStart({ currentTarget: { dataset: { index: 0 } }, touches: [{ clientX: 90, clientY: 300 }] });
  expect(p.page.data.selected).toBe(0);
  p.page.touchMove({ touches: [{ clientX: 90 + second!.x - first!.x, clientY: 300 + second!.y - first!.y }] }); p.page.touchEnd();
  expect(p.page.data.previewBeads.map(bead => bead.sku_id)).toEqual(['b', 'a']);
  p.page.touchStart({ currentTarget: { dataset: {} }, touches: [{ clientX: 0, clientY: 0 }] });
  expect(p.page.data.selected).toBe(-1);
});

it('shows 0 → 1 → 2 real material beads when Skyline supplies size but no canvas node', async () => {
  const p = editor(); await p.start();
  expect(p.page.data.previewMode).toBe('fallback');
  expect(p.page.data.previewBeads).toEqual([]);
  expect(p.page.canvasRect).toMatchObject({ left: 16, top: 120, width: 390, height: 282.9 });
  expect(p.page.data.previewStyle).toContain('height:282.9px');
  p.add('a'); expect(p.page.data.previewBeads).toHaveLength(1);
  p.add('a'); expect(p.page.data.previewBeads).toHaveLength(2);
  expect(p.page.data.previewBeads.map((bead: Bead) => ({ sku_id: bead.sku_id, x: bead.x, y: bead.y, size: bead.size }))).toEqual(p.layout());
  expect(p.page.data.previewBeads[1]).toMatchObject({ url: 'https://example.test/a.png', selected: true });
  expect(p.page.data).toMatchObject({ priceText: '3.00', perimeterText: '1.2', count: 2 });
});

it('selects and reorders using client coordinates relative to the actual fallback bounds, and deletes immediately', async () => {
  const p = editor(); await p.start(); p.add('a'); p.add('b');
  const [first, second] = p.page.data.previewBeads as Bead[];
  p.page.touchStart({ currentTarget: { dataset: { index: 0 } }, touches: [{ clientX: first!.x + 16, clientY: first!.y + 120, x: first!.x + 16, y: first!.y + 120 }] });
  expect(p.page.data.selected).toBe(0);
  expect(p.page.data.previewBeads[0]!.selected).toBe(true);
  p.page.touchMove({ touches: [{ clientX: second!.x + 16, clientY: second!.y + 120 }] }); p.page.touchEnd();
  expect(p.page.data.previewBeads.map((bead: Bead) => bead.sku_id)).toEqual(['b', 'a']);
  p.tool(0);
  expect(p.page.data.previewBeads.map((bead: Bead) => bead.sku_id)).toEqual(['b']);
  expect(p.page.data.previewBeads[0]!.url).toBe('');
  p.tool(3); expect(p.page.data.previewBeads).toEqual([]);
});

it('selects a bead from a standalone tap and safely ignores invalid indices', async () => {
  const p = editor({ platform: 'devtools' }); await p.start(); p.add('a'); p.add('b');
  p.page.selectPreviewBead({ currentTarget: { dataset: { index: '0' } } });
  expect(p.page.data.selected).toBe(0); expect(p.page.data.previewBeads[0]!.selected).toBe(true);
  for (const index of [undefined, -1, 2, 'invalid', 0.5]) p.page.selectPreviewBead({ currentTarget: { dataset: { index } } });
  expect(p.page.data.selected).toBe(0);
  const markup = readFileSync('miniprogram/pages/editor/index.wxml', 'utf8');
  expect(markup).toContain('catchtap="selectPreviewBead" aria-role="button"');
});

it('ignores a post-drag tap at the old index but allows a subsequent actual touch and tap', async () => {
  const p = editor({ platform: 'devtools' }); await p.start(); p.add('a'); p.add('b');
  const [first, second] = p.page.data.previewBeads;
  p.page.touchStart({ currentTarget: { dataset: { index: 0 } }, touches: [{ clientX: 100, clientY: 200 }] });
  p.page.touchMove({ touches: [{ clientX: 100 + second!.x - first!.x, clientY: 200 + second!.y - first!.y }] }); p.page.touchEnd();
  expect(p.page.data.selected).toBe(1);
  p.page.selectPreviewBead({ currentTarget: { dataset: { index: 0 } } });
  expect(p.page.data.selected).toBe(1);
  p.page.touchStart({ currentTarget: { dataset: { index: 0 } }, touches: [{ clientX: 100, clientY: 200 }] }); p.page.touchEnd();
  p.page.selectPreviewBead({ currentTarget: { dataset: { index: 0 } } });
  expect(p.page.data.selected).toBe(0); expect(p.page.data.previewBeads[0]!.selected).toBe(true);
});

it('restores a persisted ordered draft after the preview has initialized', async () => {
  const p = editor({ draft: { name: '已存草稿', components: [{ sku_id: 'b' }, { sku_id: 'a' }] } });
  await p.start();
  expect(p.page.data.name).toBe('已存草稿');
  expect(p.page.data.previewBeads.map((bead: Bead) => bead.sku_id)).toEqual(['b', 'a']);
  p.page.setData({ selected: 1 }); p.tool(1);
  expect(p.page.data.previewBeads.map((bead: Bead) => bead.sku_id)).toEqual(['a', 'b']);
});

it.each(['null', 'throw'] as const)('falls back when the canvas context is %s', async native => {
  const p = editor({ native }); await p.start(); p.add('a');
  expect(p.page.data.previewMode).toBe('fallback');
  expect(p.page.data.previewBeads).toHaveLength(1);
});

it('keeps the supported native Canvas2D path and its shared geometry', async () => {
  const p = editor({ native: 'valid' }); await p.start(); p.add('a'); p.add('b');
  expect(p.page.data.previewMode).toBe('canvas');
  expect(p.context.scale).toHaveBeenCalledWith(2, 2);
  expect(p.page.canvas!.width).toBe(780);
  expect(p.page.positions).toEqual(p.layout());
  expect(p.context.arc).toHaveBeenCalledWith(195, 141.45, 282.9 * .33, 0, Math.PI * 2);
  p.images[0]!.onload!(); expect(p.context.drawImage).toHaveBeenCalled();
});

it('marks failed material images as missing and remeasures the preview on resize', async () => {
  const p = editor(); await p.start(); p.add('a');
  p.page.previewImageError({ currentTarget: { dataset: { url: 'https://example.test/a.png' } } });
  expect(p.page.data.previewBeads[0]!.url).toBe('');
  p.resize({ left: 4, top: 88, width: 375, height: 220 });
  expect(p.page.positions).toEqual(p.layout());
  expect(p.page.data.previewStyle).toContain('height:220px');
  expect(p.page.canvasRect).toMatchObject({ left: 4, top: 88 });
});

it('does not update or draw from a selector callback after the editor unloads', () => {
  const p = editor({ native: 'valid', deferredQuery: true }); p.page.onReady(); p.page.onUnload(); p.updates.mockClear();
  p.pendingQueries.forEach(finish => finish());
  expect(p.updates).not.toHaveBeenCalled(); expect(p.context.clearRect).not.toHaveBeenCalled();
});

it('ignores in-flight material responses after the editor unloads', async () => {
  const p = editor({ deferredLoad: true }); p.page.onLoad({}); p.page.onUnload(); p.updates.mockClear();
  p.pendingLoads.forEach(finish => finish()); await new Promise(done => setImmediate(done));
  expect(p.updates).not.toHaveBeenCalled();
});

it('ignores native image completion after the editor unloads', async () => {
  const p = editor({ native: 'valid' }); await p.start(); p.add('a'); p.page.onUnload(); p.updates.mockClear(); p.context.clearRect!.mockClear();
  p.images[0]!.onload!();
  expect(p.updates).not.toHaveBeenCalled(); expect(p.context.clearRect).not.toHaveBeenCalled();
});

it('binds actual fallback beads and image failure handling into a sized visible view', () => {
  const markup = readFileSync('miniprogram/pages/editor/index.wxml', 'utf8');
  expect(markup).toContain('wx:for="{{previewBeads}}"');
  expect(markup).toContain('style="{{previewStyle}}"');
  expect(markup).toContain('binderror="previewImageError"');
  expect(markup).toContain('data-index="{{index}}" catchtouchstart="touchStart"');
  expect(markup).toContain('缺图');
});
