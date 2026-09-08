const {expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const {launch,fixtureRoute,popup,options,settings,root}=require('../tools/browser-helpers.cjs');
(async()=>{
 let env; const results=[];
 const check=async(name,fn)=>{await fn();results.push({name,status:'passed'});console.log('PASS',name);};
 try {
  env=await launch();await fixtureRoute(env.context);
  const ui=await popup(env);
  await check('popup manual ON persists',async()=>{await ui.locator('[data-mode="on"]').click();await expect.poll(()=>ui.evaluate(async()=> (await chrome.storage.local.get('workTimeSettings')).workTimeSettings.mode)).toBe('on');});
  await check('popup all modes fit Chrome 600px height limit',async()=>{
   await ui.setViewportSize({width:400,height:600});const heights={};
   for(const mode of ['on','off','auto']){await ui.locator(`[data-mode="${mode}"]`).click();await expect.poll(()=>ui.evaluate(async()=> (await chrome.storage.local.get('workTimeSettings')).workTimeSettings.mode)).toBe(mode);heights[mode]=await ui.evaluate(()=>document.body.scrollHeight);}
   await ui.locator('[data-mode="on"]').click();await ui.locator('#pause-toggle').click();await expect.poll(()=>ui.evaluate(async()=> (await chrome.storage.local.get('workTimeSettings')).workTimeSettings.pauseUntil)).toBeGreaterThan(Date.now());heights.paused=await ui.evaluate(()=>document.body.scrollHeight);await ui.locator('#pause-toggle').click();console.log('Popup state heights:',JSON.stringify(heights));expect(Math.max(...Object.values(heights)),JSON.stringify(heights)).toBeLessThanOrEqual(600);
  });
  const home=await env.context.newPage();await home.goto('https://www.youtube.com/');
  await check('fixture home: old, modern and Shorts thumbnail masking',async()=>{
   await expect(home.locator('html')).toHaveAttribute('data-work-time-active','true');
   for(const selector of ['ytd-rich-item-renderer ytd-thumbnail','yt-thumbnail-view-model','ytd-reel-item-renderer a#thumbnail']){
    const thumb=home.locator(selector).first();await expect(thumb).toHaveAttribute('data-work-time-thumbnail','');
    expect(await thumb.evaluate(el=>getComputedStyle(el,'::after').content)).toContain('WORK TIME');
    await expect(thumb.locator('img')).toHaveCSS('opacity','0');await expect(thumb).toBeVisible();
   }
   await expect(home.locator('#video-title').first()).toHaveCSS('filter','none');
  });
  await check('legacy native ratio spacer and centered overlay geometry survive masking',async()=>{
   const host=home.locator('ytd-rich-item-renderer ytd-thumbnail').first();
   const geometry=()=>host.evaluate(el=>{const r=el.getBoundingClientRect(),a=el.querySelector('a').getBoundingClientRect(),before=getComputedStyle(el,'::before'),after=getComputedStyle(el,'::after');return {width:r.width,height:r.height,anchorHeight:a.height,beforePosition:before.position,pseudoWidth:parseFloat(after.width),pseudoHeight:parseFloat(after.height),alignContent:after.alignContent,justifyContent:after.justifyContent}});
   const on=await geometry();expect(on.height).toBeGreaterThan(100);expect(on.height/on.width).toBeCloseTo(9/16,2);expect(on.anchorHeight).toBeCloseTo(on.height,1);expect(on.beforePosition).toBe('static');expect(on.pseudoWidth).toBeCloseTo(on.width,1);expect(on.pseudoHeight).toBeCloseTo(on.height,1);expect(on.alignContent).toBe('center');expect(on.justifyContent).toBe('center');
   await ui.locator('[data-mode="off"]').click();await expect(home.locator('html')).toHaveAttribute('data-work-time-active','false');const off=await geometry();expect(off.width).toBeCloseTo(on.width,1);expect(off.height).toBeCloseTo(on.height,1);await ui.locator('[data-mode="on"]').click();await expect(host).toHaveAttribute('data-work-time-thumbnail','');
  });
  await check('home and Shorts metadata blur covers avatar, title and channel stats',async()=>{
   await ui.locator('#blur-titles').check();await home.mouse.move(0,0);
   for(const selector of ['ytd-rich-item-renderer .meta','yt-lockup-view-model .meta','ytd-reel-item-renderer .meta']){const block=home.locator(selector).first();await expect(block).toHaveCSS('filter','blur(6px)');for(const child of ['h3 a','.channel-avatar','.channel-name','.video-stats'])await expect(block.locator(child)).toHaveCSS('filter','none');}
   await ui.locator('#blur-titles').uncheck();await expect(home.locator('ytd-rich-item-renderer .meta').first()).toHaveCSS('filter','none');
  });
  await check('thumbnail remains a working navigation link',async()=>{await home.locator('ytd-rich-item-renderer a#thumbnail').first().click();await expect(home).toHaveURL(/\/watch\?v=fixture/);await expect(home.locator('#movie_player')).toBeVisible();});
  await check('watch recommendations masked, player and watched title preserved',async()=>{await expect(home.locator('ytd-compact-video-renderer ytd-thumbnail').first()).toHaveAttribute('data-work-time-thumbnail','');await expect(home.locator('#movie_player')).not.toHaveAttribute('data-work-time-thumbnail','');await expect(home.locator('#watched-title')).toBeVisible();});
  await check('actual video playback inside player is untouched',async()=>{
   await home.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='#234';ctx.fillRect(0,0,320,180);const video=document.createElement('video');video.id='playback-check';video.muted=true;video.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:.1';document.querySelector('#movie_player').append(video);video.srcObject=canvas.captureStream(20);window.videoDraw=setInterval(()=>{ctx.fillRect(0,0,320,180)},40);await video.play();});
   await expect.poll(()=>home.locator('#playback-check').evaluate(v=>v.currentTime)).toBeGreaterThan(0.1);
   expect(await home.locator('#playback-check').evaluate(v=>v.paused)).toBe(false);await expect(home.locator('#playback-check')).not.toHaveAttribute('data-work-time-thumbnail','');
   await home.evaluate(()=>{clearInterval(window.videoDraw);const v=document.querySelector('#playback-check');v.srcObject.getTracks().forEach(t=>t.stop());v.remove();});
  });
  await check('dynamic recommendation receives mask',async()=>{await home.evaluate(()=>window.appendRecommendation());await expect(home.locator('[data-test-card="99"] ytd-thumbnail')).toHaveAttribute('data-work-time-thumbnail','');});
  await check('attribute changes and SPA navigation re-scan',async()=>{
   await home.evaluate(()=>{const card=document.createElement('ytd-compact-video-renderer');card.innerHTML='<a class="future-thumbnail" href="/watch?v=recycled"><img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E"></a>';document.querySelector('.recommendations').append(card)});
   await home.evaluate(()=>{document.querySelector('.future-thumbnail').className='future-thumbnail yt-thumbnail-view-model';window.fixtureNavigate()});
   await expect(home.locator('.future-thumbnail')).toHaveAttribute('data-work-time-thumbnail','');
  });
  await check('optional whole metadata blur preserves watched video and reveals on intent',async()=>{
   await ui.locator('#blur-titles').check();await home.mouse.move(0,0);await expect(home.locator('html')).toHaveAttribute('data-work-time-blur','true');
   for(const selector of ['ytd-compact-video-renderer .meta','yt-lockup-view-model .meta']){
    const block=home.locator(selector).first();await expect(block).toHaveAttribute('data-work-time-details','');await expect(block).toHaveCSS('filter','blur(6px)');
    for(const child of ['h3 a','.channel-avatar','.channel-name','.video-stats','.metadata-badge'])await expect(block.locator(child)).toHaveCSS('filter','none');
    await expect(block.locator('.channel-avatar')).toHaveCSS('opacity','1');
    await block.hover();await expect(block).toHaveCSS('filter','none');await home.mouse.move(0,0);await expect(block).toHaveCSS('filter','blur(6px)');
    await block.locator('h3 a').focus();await expect(block).toHaveCSS('filter','none');await home.evaluate(()=>document.activeElement.blur());await expect(block).toHaveCSS('filter','blur(6px)');
   }
   for(const selector of ['#watched-title','#watched-channel','#movie_player']){await expect(home.locator(selector)).toHaveCSS('filter','none');await expect(home.locator(selector)).toBeVisible();}
   await ui.locator('#blur-titles').uncheck();await expect(home.locator('ytd-compact-video-renderer .meta').first()).toHaveCSS('filter','none');
  });
  await check('OFF restores images and removes markers',async()=>{await ui.locator('#blur-titles').check();await expect(home.locator('html')).toHaveAttribute('data-work-time-blur','true');await ui.locator('[data-mode="off"]').click();await expect(home.locator('html')).toHaveAttribute('data-work-time-active','false');await expect(home.locator('[data-work-time-thumbnail]')).toHaveCount(0);await expect(home.locator('[data-work-time-details]')).toHaveCount(0);await expect(home.locator('ytd-compact-video-renderer .meta').first()).toHaveCSS('filter','none');await expect(home.locator('ytd-compact-video-renderer img').first()).toHaveCSS('opacity','1');});
  await check('pause persists through popup reload and can resume',async()=>{await ui.locator('[data-mode="on"]').click();await ui.locator('#pause-toggle').click();await expect(home.locator('html')).toHaveAttribute('data-work-time-active','false');await expect.poll(()=>ui.evaluate(async()=> (await chrome.storage.local.get('workTimeSettings')).workTimeSettings.pauseUntil)).toBeGreaterThan(Date.now());await ui.reload();await ui.locator('#pause-toggle').click();await expect(home.locator('html')).toHaveAttribute('data-work-time-active','true');});
  const opts=await options(env);
  await check('schedule UI saves enabled day and multiple slots across reload',async()=>{
   const row=opts.locator('.day-row[data-day="1"]');await row.locator('.day-enabled').check();
   await row.locator('.time-start').first().fill('08:15');await row.locator('.time-start').first().dispatchEvent('change');
   await row.locator('.time-end').first().fill('11:45');await row.locator('.time-end').first().dispatchEvent('change');
   const count=await row.locator('.time-start').count();if(count<3)await row.locator('.add-slot').click();
   await expect.poll(()=>opts.evaluate(async()=> (await chrome.storage.local.get('workTimeSettings')).workTimeSettings.schedule.find(d=>d.day===1).slots[0].start)).toBe('08:15');
   await opts.reload();await expect(opts.locator('.day-row[data-day="1"] .time-start').first()).toHaveValue('08:15');await expect(opts.locator('.day-row[data-day="1"] .time-end').first()).toHaveValue('11:45');await expect(opts.locator('.day-row[data-day="1"] .day-enabled')).toBeChecked();
   await expect(opts.locator('.day-row[data-day="1"] .time-start')).toHaveCount(Math.min(3,count+1));
   await opts.locator('.day-row[data-day="1"] .remove-slot').last().click();await expect(opts.locator('.day-row[data-day="1"] .time-start')).toHaveCount(Math.min(3,count+1)-1);
  });
  await check('equal and missing times show errors without saving',async()=>{
   const read=()=>opts.evaluate(async()=>JSON.stringify((await chrome.storage.local.get('workTimeSettings')).workTimeSettings.schedule));const saved=await read();
   const row=opts.locator('.day-row[data-day="1"]');const start=row.locator('.time-start').first();const end=row.locator('.time-end').first();const previous=await end.inputValue();
   await end.fill(await start.inputValue());await end.dispatchEvent('change');await expect(end).toHaveAttribute('aria-invalid','true');await expect(row.locator('.day-error')).not.toBeEmpty();await expect(opts.locator('#save-state')).toHaveAttribute('data-error','true');expect(await read()).toBe(saved);
   await end.fill('');await end.dispatchEvent('change');await expect(end).toHaveAttribute('aria-invalid','true');expect(await read()).toBe(saved);
   await end.fill(previous);await end.dispatchEvent('change');await expect(end).toHaveAttribute('aria-invalid','false');await opts.reload();expect(await read()).toBe(saved);
  });
  await check('popup and responsive options have no horizontal overflow',async()=>{
   await ui.setViewportSize({width:400,height:600});expect(await ui.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
   for(const width of [1440,768,420]){await opts.setViewportSize({width,height:1000});expect(await opts.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
   await opts.setViewportSize({width:1440,height:1000});
  });
  await check('AUTO respects a saved disabled weekly schedule',async()=>{await settings(ui,{schedule:Array.from({length:7},(_,day)=>({day,enabled:false,slots:[]})),pauseUntil:0});await ui.locator('[data-mode="auto"]').click();await expect(home.locator('html')).toHaveAttribute('data-work-time-active','false');});
  console.log(`${results.length} browser checks passed. YouTube pages used local deterministic fixtures, NOT live YouTube.`);
 }catch(error){results.push({name:'browser failure',status:'failed',error:error.stack});console.error(error);process.exitCode=1;}
 finally{if(env)await env.close();fs.mkdirSync(path.join(root,'validation'),{recursive:true});fs.writeFileSync(path.join(root,'validation/browser-report.json'),JSON.stringify({source:'Local deterministic YouTube HTML fixtures routed at https://www.youtube.com; not live YouTube',results},null,2));}
})();
