import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';

const source=(path:string)=>readFileSync(`miniprogram/${path}`,'utf8');

it('uses default tag isolation and enables glass-easel for WebView fallback',()=>{
  const config=JSON.parse(source('app.json'));
  expect(config.renderer).toBe('skyline');
  expect(config.componentFramework).toBe('glass-easel');
  expect(config.glassEaselWebview).toBe(true);
  expect(config.window).not.toHaveProperty('glassEaselWebview');
  expect(config.rendererOptions.skyline).not.toHaveProperty('tagNameStyleIsolation');
});

it('styles disabled buttons with classes supported by Skyline, retaining native disabled attributes',()=>{
  for(const path of ['styles/catalog.wxss','pages/product/index.wxss','pages/foundation/index.wxss']){
    expect(source(path),path).not.toMatch(/\[[^\]]+\]\s*\{/);
    expect(source(path),path).toContain('.is-disabled');
  }
  for(const path of ['pages/catalog/index.wxml','pages/product/index.wxml','pages/foundation/index.wxml']){
    const buttons=source(path).match(/<button\b[^>]*>/g)??[];
    const disabled=buttons.filter(button=>button.includes('disabled='));
    expect(disabled.length,path).toBeGreaterThan(0);
    for(const button of disabled)expect(button,path).toContain('is-disabled');
  }
});

it('renders the back arrow without unsupported WebKit mask declarations',()=>{
  expect(source('components/navigation-bar/navigation-bar.wxss')).not.toMatch(/-webkit-mask/);
  expect(source('components/navigation-bar/navigation-bar.wxml')).toContain('weui-navigation-bar__back-arrow');
});

it('gives the heading its remaining width and keeps price parts on one flex row',()=>{
  const catalog=source('pages/catalog/index.wxss');
  expect(source('pages/catalog/index.wxml')).toContain('class="catalog-heading"');
  expect(source('pages/catalog/index.wxml')).toMatch(/<button[^>]*size="mini"[^>]*class="materials-link"/);
  expect(catalog).toMatch(/\.catalog-heading\s*\{[^}]*flex:\s*1/);
  expect(catalog).toMatch(/\.materials-link\s*\{[^}]*width:\s*144rpx/);
  expect(catalog).toMatch(/\.product-card\s*\{[^}]*box-sizing:\s*border-box/);
  expect(catalog).toMatch(/\.product-price\s*\{[^}]*display:\s*flex/);
  expect(source('pages/product/index.wxss')).toMatch(/\.detail-price\s*\{[^}]*display:\s*flex/);
});

it('sets horizontal flex directions explicitly instead of Skyline default column',()=>{
  const layouts:Record<string,string[]>={
    'pages/catalog/index.wxss':['catalog-topline','category-tabs','product-grid','product-price'],
    'pages/product/index.wxss':['detail-price','spec-options','quantity-row','quantity-controls'],
    'pages/materials/index.wxss':['material-switch','material-tabs','material-skus','material-sku'],
  };
  for(const [path,classes] of Object.entries(layouts)){
    for(const name of classes)expect(source(path),`${path} .${name}`).toMatch(new RegExp(`\\.${name}\\s*\\{[^}]*flex-direction:\\s*row`));
  }
});

interface NavContext {setData:(data:Record<string,unknown>)=>void}
function attachNavigation(platform:string,windowInfo:{windowWidth:number;statusBarHeight:number;safeArea?:{top:number}}){
  const setData=vi.fn();
  const getSystemInfo=vi.fn(({success}:{success:(value:unknown)=>void})=>success({...windowInfo,platform}));
  const getWindowInfo=vi.fn(()=>windowInfo);
  const getDeviceInfo=vi.fn(()=>({platform}));
  let attached:((this:NavContext)=>void)|undefined;
  runInNewContext(source('components/navigation-bar/navigation-bar.js'),{
    Component:(component:{lifetimes:{attached:(this:NavContext)=>void}})=>{attached=component.lifetimes.attached;},
    wx:{getMenuButtonBoundingClientRect:()=>({left:320}),getSystemInfo,getWindowInfo,getDeviceInfo},
  });
  return {run:()=>attached!.call({setData}),setData,getSystemInfo,getWindowInfo,getDeviceInfo};
}

it('uses modern device and window APIs for Android navigation geometry',()=>{
  const nav=attachNavigation('android',{windowWidth:375,statusBarHeight:24,safeArea:{top:30}});
  nav.run();
  expect(nav.getSystemInfo).not.toHaveBeenCalled();
  expect(nav.getWindowInfo).toHaveBeenCalledOnce();
  expect(nav.getDeviceInfo).toHaveBeenCalledOnce();
  expect(nav.setData).toHaveBeenCalledWith({ios:false,innerPaddingRight:'padding-right: 55px',leftWidth:'width: 55px',safeAreaTop:'height: calc(var(--height) + 30px); padding-top: 30px'});
});

it('falls back to status bar height when safeArea is absent',()=>{
  const nav=attachNavigation('devtools',{windowWidth:390,statusBarHeight:24});
  expect(nav.run).not.toThrow();
  expect(nav.setData).toHaveBeenCalledWith(expect.objectContaining({safeAreaTop:'height: calc(var(--height) + 24px); padding-top: 24px'}));
});

it('preserves a zero safe-area inset and lets iOS use its existing CSS safe-area inset',()=>{
  const android=attachNavigation('android',{windowWidth:375,statusBarHeight:24,safeArea:{top:0}});
  android.run();
  expect(android.setData).toHaveBeenCalledWith(expect.objectContaining({safeAreaTop:'height: calc(var(--height) + 0px); padding-top: 0px'}));
  const ios=attachNavigation('ios',{windowWidth:375,statusBarHeight:44});
  ios.run();
  expect(ios.setData).toHaveBeenCalledWith(expect.objectContaining({ios:true,safeAreaTop:''}));
});
