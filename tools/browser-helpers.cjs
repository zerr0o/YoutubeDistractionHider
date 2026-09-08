const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {html} = require('../tests/fixtures/youtube.cjs');
const root=path.resolve(__dirname,'..');
async function launch() {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'work-time-qa-'));
  // Use Playwright's matching browser unless a developer explicitly overrides it.
  const executablePath=process.env.WORK_TIME_CHROMIUM || undefined;
  let context;
  try {
    context=await chromium.launchPersistentContext(profile,{channel:'chromium',executablePath,headless:process.env.HEADED!=='1',viewport:{width:1440,height:1000},colorScheme:'dark',args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
    context.setDefaultTimeout(10000);
    let worker=context.serviceWorkers()[0];
    if(!worker)worker=await context.waitForEvent('serviceworker',{timeout:15000});
    const id=new URL(worker.url()).host;
    return {context,id,profile,executable:executablePath||'Playwright Chromium',close:async()=>{await context.close();fs.rmSync(profile,{recursive:true,force:true,maxRetries:3});}};
  } catch(error) {if(context)await context.close();fs.rmSync(profile,{recursive:true,force:true,maxRetries:3});throw error;}
}
async function fixtureRoute(context) {await context.route('https://www.youtube.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:html(new URL(route.request().url()).pathname==='/watch')}));}
async function popup(env) {const p=await env.context.newPage();await p.goto(`chrome-extension://${env.id}/popup/popup.html`);await p.locator('html[data-ready="true"]').waitFor();return p;}
async function options(env) {const p=await env.context.newPage();await p.goto(`chrome-extension://${env.id}/options/options.html`);await p.locator('html[data-ready="true"]').waitFor();return p;}
async function settings(page,patch) {await page.evaluate(async patch=>{const {workTimeSettings:old}=await chrome.storage.local.get('workTimeSettings');await chrome.storage.local.set({workTimeSettings:{...old,...patch}});},patch);}
module.exports={launch,fixtureRoute,popup,options,settings,root};

// Optional real-network evidence. Fresh extension profile; never uses a personal browser profile.
async function liveProbe(out=path.join(root,'validation/live'),{blurDetails=false,routeNames=['home','search','watch'],compareOff=false}={}) {
 fs.mkdirSync(out,{recursive:true});const report={source:'Live YouTube network pages in disposable profile',consentAction:'Only reject-all allowed; never accept or sign in',pages:[]};let env;
 try{
  env=await launch();const ui=await popup(env);await settings(ui,{mode:'on',blurTitles:blurDetails,pauseUntil:0});
  const page=await env.context.newPage();await page.setViewportSize({width:1440,height:1000});
  for(const [name,url] of [['home','https://www.youtube.com/'],['search','https://www.youtube.com/results?search_query=blender+tutorial'],['watch','https://www.youtube.com/watch?v=aqz-KE-bpKQ']]){
   if(!routeNames.includes(name))continue;const entry={name,url};report.pages.push(entry);
   try{
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:12000});entry.status=response?.status();
    const reject=page.getByRole('button',{name:/Tout refuser|Reject all/i}).first();
    try{await reject.waitFor({state:'visible',timeout:8000});await reject.click({timeout:2000});entry.rejectedConsent=true;}catch(error){
     entry.rejectedConsent=false;
     for(const frame of page.frames()){try{const text=frame.getByText(/^(Tout refuser|Reject all)$/i).first();if(await text.isVisible()){await text.click({timeout:2000});entry.rejectedConsent=true;break;}}catch(ignore){}}
     entry.consentButtons=await page.locator('button').evaluateAll(nodes=>nodes.filter(el=>/refuser|reject/i.test(el.textContent+' '+el.getAttribute('aria-label'))).map(el=>el.outerHTML.slice(0,1200)));
    }
    if(entry.rejectedConsent){try{await page.getByText('Tout refuser',{exact:true}).first().waitFor({state:'hidden',timeout:5000});entry.consentSettled=true;}catch(error){entry.consentSettled=false;entry.consentSettleError=error.message.split('\n')[0];}}
    await page.mouse.move(0,0);
    try{await page.locator('ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model,.ytLockupViewModelHost').first().waitFor({state:'visible',timeout:6000});}catch(error){entry.recommendationsWait=error.message.split('\n')[0];}
    const measure=()=>{
     const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'};
     const surfaces=[...document.querySelectorAll('ytd-thumbnail,a#thumbnail,yt-thumbnail-view-model,.ytThumbnailViewModelHost')].filter(visible);
     const player=document.querySelector('#movie_player');const video=player?.querySelector('video');
     const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
     const geometry=el=>{if(!el)return null;const c=getComputedStyle(el);const p=getComputedStyle(el,'::after');const b=getComputedStyle(el,'::before');return {tag:el.tagName,id:el.id,class:el.className,rect:rect(el),display:c.display,position:c.position,aspectRatio:c.aspectRatio,height:c.height,width:c.width,padding:c.padding,margin:c.margin,inset:c.inset,marked:el.hasAttribute('data-work-time-thumbnail'),before:{content:b.content,display:b.display,position:b.position,paddingTop:b.paddingTop,height:b.height,width:b.width,inset:b.inset},pseudo:{content:p.content,position:p.position,inset:p.inset,width:p.width,height:p.height,display:p.display,alignItems:p.alignItems,justifyContent:p.justifyContent},inlineStyle:el.getAttribute('style')};};
     const legacyGeometry=[...document.querySelectorAll('ytd-video-renderer ytd-thumbnail')].slice(0,5).map(el=>({host:geometry(el),anchor:geometry(el.querySelector('a#thumbnail')),parent:geometry(el.parentElement)}));
     return {legacyGeometry,title:document.title,url:location.href,active:document.documentElement.dataset.workTimeActive,blur:document.documentElement.dataset.workTimeBlur,visibleDialogs:[...document.querySelectorAll('[role=dialog]')].filter(visible).map(el=>el.innerText.slice(0,200)),metadataSamples:[...document.querySelectorAll('[data-work-time-details]')].filter(visible).slice(0,10).map(el=>({tag:el.tagName,class:el.className,filter:getComputedStyle(el).filter,text:el.innerText.slice(0,160)})),visibleSurfaces:surfaces.length,marked:surfaces.filter(el=>el.hasAttribute('data-work-time-thumbnail')).length,samples:surfaces.slice(0,12).map(el=>({tag:el.tagName,class:el.className,parentTag:el.parentElement?.tagName,parentClass:el.parentElement?.className,marked:el.hasAttribute('data-work-time-thumbnail'),label:getComputedStyle(el,'::after').content,imageOpacity:el.querySelector('img')?getComputedStyle(el.querySelector('img')).opacity:null})),player:player?{visible:visible(player),marked:player.hasAttribute('data-work-time-thumbnail'),filter:getComputedStyle(player).filter,opacity:getComputedStyle(player).opacity,video:video?{paused:video.paused,currentTime:video.currentTime,readyState:video.readyState,marked:video.hasAttribute('data-work-time-thumbnail'),opacity:getComputedStyle(video).opacity,filter:getComputedStyle(video).filter}:null}:null,bodyExcerpt:document.body.innerText.slice(0,2500)};
    };
    entry.dom=await page.evaluate(measure);
    if(compareOff){await settings(ui,{mode:'off'});await page.locator('html[data-work-time-active="false"]').waitFor({state:'attached'});entry.offDom=await page.evaluate(measure);await settings(ui,{mode:'on'});await page.locator('html[data-work-time-active="true"]').waitFor({state:'attached'});}
    await page.screenshot({path:path.join(out,`youtube-live-${name}.png`),animations:'disabled',timeout:5000});entry.screenshot=`youtube-live-${name}.png`;
   }catch(error){entry.error=error.message;}
   fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('Live probe',name,entry.dom?.visibleSurfaces??entry.error);
  }
 }catch(error){report.error=error.stack;throw error;}finally{if(env)await env.close();report.limitation='Public pages only. Consent rejection does not bypass bot checks. Player DOM preservation does not prove successful playback. Local fixtures provide deterministic complete QA.';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 return report;
}
module.exports.liveProbe=liveProbe;
