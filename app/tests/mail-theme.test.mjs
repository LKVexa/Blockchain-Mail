import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_KEY, readTheme, saveTheme, initializeTheme} from '../web/theme.mjs';

function fixture(storage, dark=false) {
  const buttons=Array.from({length:2},()=>({listeners:new Map(),attributes:{},addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name){this.listeners.delete(name);},setAttribute(name,value){this.attributes[name]=value;}}));
  const media={matches:dark,listeners:new Map(),addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name){this.listeners.delete(name);}};
  const window={localStorage:storage,matchMedia:()=>media,listeners:new Map(),addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name){this.listeners.delete(name);}};
  const document={documentElement:{dataset:{}},querySelectorAll:()=>buttons};
  const cleanup=initializeTheme(document,window);
  return {buttons,media,window,document,cleanup};
}
test('MAIL-THEME-01 only supported preferences override the system default',()=>{
  assert.equal(readTheme({getItem:()=> 'dark'},false),'dark');
  assert.equal(readTheme({getItem:()=> 'untrusted-value'},true),'dark');
  assert.equal(readTheme({getItem:()=> null},false),'light');
  assert.equal(readTheme({getItem(){throw Error('blocked');}},true),'dark');
  assert.throws(()=>saveTheme(null,'invalid'),/Invalid theme/);
});
test('MAIL-THEME-02 toggle synchronizes both views, persists only the theme, and exposes accessible state',()=>{
  const writes=[],f=fixture({getItem:()=>null,setItem:(...args)=>writes.push(args)},true);
  assert.equal(f.document.documentElement.dataset.theme,'dark');
  assert.equal(f.buttons[0].attributes['aria-pressed'],'true');
  f.buttons[1].listeners.get('click')();
  assert.equal(f.document.documentElement.dataset.theme,'light');
  assert.deepEqual(writes,[[THEME_KEY,'light']]);
  for(const button of f.buttons){assert.equal(button.textContent,'Dark theme');assert.equal(button.attributes['aria-label'],'Switch to dark theme');assert.equal(button.attributes['aria-pressed'],'false');}
  f.cleanup();assert.equal(f.window.listeners.size,0);assert.equal(f.buttons[0].listeners.size,0);
});
test('MAIL-THEME-03 storage failure preserves the explicit choice for this page',()=>{
  const f=fixture({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
  f.buttons[0].listeners.get('click')();
  assert.equal(f.document.documentElement.dataset.theme,'dark');
  f.media.matches=false;f.media.listeners.get('change')();
  assert.equal(f.document.documentElement.dataset.theme,'dark');
});
test('MAIL-THEME-04 system and same-origin preference changes synchronize without touching session storage',()=>{
  const f=fixture({getItem:()=>null,setItem(){}});
  f.media.matches=true;f.media.listeners.get('change')();assert.equal(f.document.documentElement.dataset.theme,'dark');
  f.window.listeners.get('storage')({key:THEME_KEY,newValue:'light'});assert.equal(f.document.documentElement.dataset.theme,'light');
  f.window.listeners.get('storage')({key:'access-token',newValue:'untrusted'});assert.equal(f.document.documentElement.dataset.theme,'light');
  f.window.listeners.get('storage')({key:THEME_KEY,newValue:null});assert.equal(f.document.documentElement.dataset.theme,'dark');
});
test('MAIL-THEME-05 clearing preferences in another tab restores system appearance without writing storage',()=>{
  const writes=[],f=fixture({getItem:()=> 'light',setItem:(...args)=>writes.push(args)},true);
  assert.equal(f.document.documentElement.dataset.theme,'light');
  f.window.listeners.get('storage')({key:null,newValue:null});
  assert.equal(f.document.documentElement.dataset.theme,'dark');
  for(const button of f.buttons){assert.equal(button.textContent,'Light theme');assert.equal(button.attributes['aria-pressed'],'true');}
  f.media.matches=false;f.media.listeners.get('change')();
  assert.equal(f.document.documentElement.dataset.theme,'light');
  assert.deepEqual(writes,[]);f.cleanup();
});
