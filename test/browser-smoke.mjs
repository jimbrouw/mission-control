// Run against a local static server only. Uses Playwright when available.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});
try {
  const context = await browser.newContext({permissions:['clipboard-read','clipboard-write']});
  const page = await context.newPage();
  const errors = []; page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**', route=>route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('fixture')) return;
    localStorage.clear(); sessionStorage.setItem('fixture','1');
    localStorage.setItem('vibe.mc.v1',JSON.stringify({meta:{updatedAt:1},inbox:[],missions:[
      {id:'fixture-project',name:'Fixture project',note:'Local test data',status:'LIVE',tasks:[{id:'fixture-task',text:'Review the client edit',today:true,done:false,order:10}]}
    ]}));
  });
  await page.goto('http://127.0.0.1:8765');
  await page.getByRole('button',{name:'Use as One Thing'}).click();
  assert.equal(await page.locator('#focusInput').inputValue(),'Review the client edit');
  await page.getByRole('button',{name:'Use as One Thing'}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('vibe.mc.v1')).missions[0].tasks.length),1);
  await page.screenshot({path:'evidence/today-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Open project handover'}).click();
  await page.getByLabel('Completed / attempted').fill('Draft cut assembled <script>alert(1)</script>');
  await page.getByLabel('Verification evidence').fill('Playback still needs checking');
  await page.getByLabel('Next action',{exact:true}).fill('Watch the full cut');
  await page.getByLabel('Blocked',{exact:true}).fill('Waiting for captions');
  await page.getByLabel('Resume context').fill('Open the existing Premiere sequence');
  assert.match(await page.locator('#handoverFeedback').innerText(),/Saved on this device/);
  await page.reload();
  await page.getByRole('button',{name:'Open project handover'}).click();
  assert.equal(await page.getByLabel('Next action',{exact:true}).inputValue(),'Watch the full cut');
  assert.match(await page.getByLabel('Completed / attempted').inputValue(),/<script>/);
  await page.getByRole('button',{name:'Copy resume handover'}).click();
  await page.waitForFunction(()=>document.getElementById('handoverFeedback').textContent.startsWith('Copied'));
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Verification evidence: Playback still needs checking/);
  await page.screenshot({path:'evidence/handover-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('heading',{name:'Project handover',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'evidence/handover-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('denied');};});
  await page.getByRole('button',{name:'Copy resume handover'}).click();
  await page.waitForFunction(()=>document.getElementById('handoverFeedback').textContent.startsWith('Clipboard unavailable'));
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('quota');};});
  await page.getByLabel('Next action',{exact:true}).fill('Keep this unsaved draft');
  assert.match(await page.locator('#handoverFeedback').innerText(),/Not saved on this device/);
  assert.deepEqual(errors,[]);
  console.log('PASS: accept priority, save/reload, escaped text, clipboard, mobile width, storage failure; no page errors. Fixture only; API blocked.');
} finally { await browser.close(); }
