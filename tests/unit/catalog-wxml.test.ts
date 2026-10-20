import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';

it.each(['catalog','product','materials'])('%s page has syntactically complete data-binding expressions',page=>{
  const template=readFileSync(`miniprogram/pages/${page}/index.wxml`,'utf8');
  for(const match of template.matchAll(/\{\{([\s\S]*?)\}\}/g)){
    expect(()=>new Function(`return (${match[1]});`),`Invalid expression: ${match[1]}`).not.toThrow();
  }
});
