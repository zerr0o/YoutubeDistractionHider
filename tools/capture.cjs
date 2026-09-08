const fs=require('node:fs');
const path=require('node:path');
const {expect}=require('@playwright/test');
const {launch,fixtureRoute,popup,options,settings,root}=require('./browser-helpers.cjs');
(async()=>{
 const arg=process.argv.indexOf('--out');const out=path.resolve(root,arg<0?'validation/round-1':process.argv[arg+1]);fs.mkdirSync(out,{recursive:true});
 const report={youtubeScreenshotSource:'Deterministic local QA fixtures. NOT live YouTube. Layout references are not the source of this DOM.',screenshots:[],liveYouTube:{attempted:false}};let env;
 try{
  env=await launch();report.browser=env.executable;await fixtureRoute(env.context);
  const ui=await popup(env);await settings(ui,{mode:'on',blurTitles:false,pauseUntil:0});await ui.reload();await ui.locator('html[data-ready="true"]').waitFor();
  await ui.setViewportSize({width:400,height:650});await ui.evaluate(()=>document.fonts.ready);
  const size=await ui.evaluate(()=>({width:Math.ceil(Math.max(400,document.body.scrollWidth)),height:Math.ceil(Math.max(document.body.scrollHeight,document.body.getBoundingClientRect().height))}));
  await ui.setViewportSize(size);
  await ui.screenshot({animations:'disabled',path:path.join(out,'popup.png'),fullPage:true});report.screenshots.push({file:'popup.png',source:'Real extension page',...size,exceedsChromePopupHeight:size.height>600});
  const opts=await options(env);await opts.setViewportSize({width:1440,height:1000});await opts.evaluate(()=>document.fonts.ready);await opts.screenshot({animations:'disabled',path:path.join(out,'options.png')});report.screenshots.push({file:'options.png',source:'Real extension page'});await opts.screenshot({animations:'disabled',path:path.join(out,'options-full.png'),fullPage:true});report.screenshots.push({file:'options-full.png',source:'Real extension page, full page including Sunday and footer'});
  const yt=await env.context.newPage();await yt.setViewportSize({width:1440,height:1000});
  for(const [route,file] of [['/','youtube-home.png'],['/watch?v=fixture0','youtube-watch.png']]){await yt.goto('https://www.youtube.com'+route);await expect(yt.locator('[data-work-time-thumbnail]').first()).toBeVisible();await expect(yt.locator('html')).toHaveAttribute('data-work-time-active','true');await yt.screenshot({animations:'disabled',path:path.join(out,file)});report.screenshots.push({file,source:'Local fixture, not live YouTube'});}
  await settings(ui,{blurTitles:true});await expect(yt.locator('html')).toHaveAttribute('data-work-time-blur','true');await yt.screenshot({animations:'disabled',path:path.join(out,'youtube-watch-details-blur.png')});report.screenshots.push({file:'youtube-watch-details-blur.png',source:'Local fixture, not live YouTube'});
  // Separate best-effort network probe; never substitute its output for deterministic fixture captures.
  if(!process.argv.includes('--skip-live')){
   report.liveYouTube.attempted=true;const live=await env.context.newPage();await live.route('**/*',route=>route.continue());
   try{const response=await live.goto('https://www.youtube.com/',{waitUntil:'domcontentloaded',timeout:12000});await live.locator('ytd-thumbnail,yt-thumbnail-view-model').first().waitFor({state:'attached',timeout:5000}).catch(()=>{});report.liveYouTube={attempted:true,status:response?.status(),url:live.url(),title:await live.title(),thumbnailSurfaces:await live.locator('ytd-thumbnail,yt-thumbnail-view-model,.ytThumbnailViewModelHost').count(),dom:await live.evaluate(()=>({active:document.documentElement.getAttribute('data-work-time-active'),masked:document.querySelectorAll('[data-work-time-thumbnail]').length,samples:[...document.querySelectorAll('ytd-thumbnail,yt-thumbnail-view-model,.ytThumbnailViewModelHost')].slice(0,8).map(el=>({tag:el.tagName,class:el.className,marked:el.hasAttribute('data-work-time-thumbnail'),label:getComputedStyle(el,'::after').content,parentTag:el.parentElement?.tagName,parentClass:el.parentElement?.className})),visibleRecommendationCards:[...document.querySelectorAll('ytd-rich-item-renderer,ytd-compact-video-renderer,yt-lockup-view-model,.ytLockupViewModelHost')].filter(el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0).length,bodyExcerpt:document.body.innerText.slice(0,1000)})),limitation:'Best-effort initial load only. Hidden/preloaded watch thumbnails do not prove real recommendation coverage. A history-disabled or consent/sign-in shell may contain no visible recommendations. Only deterministic fixtures receive complete interaction QA.'};await live.screenshot({animations:'disabled',path:path.join(out,'youtube-live-probe.png'),timeout:5000});report.screenshots.push({file:'youtube-live-probe.png',source:'Live network probe; see limitations'});}catch(error){report.liveYouTube={attempted:true,accessible:false,error:error.message,limitation:'Live page unavailable or incomplete. All named home/watch QA captures remain local fixtures.'};}finally{await live.close();}
  }else report.liveYouTube.limitation='Live network probe explicitly skipped with --skip-live.';
  console.log(`Screenshots written to ${out}. YouTube home/watch screenshots are LOCAL FIXTURES, not live pages.`);
 }catch(error){report.error=error.stack;console.error(error);process.exitCode=1;}
 finally{if(env)await env.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
})();
