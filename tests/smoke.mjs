/* ============================================================
   GotIt Guides — browser smoke suite
   Drives the real pages in headless Chromium: builder flows, vet
   triage, publishing, the viewer, dashboard gating, sign-in and
   the link/privacy boundaries. No cloud: amplify_outputs.json is
   404'd so the app runs on its localStorage fallback, and the AI
   is stubbed per scenario.

   Run: npm test   (or: node tests/smoke.mjs)

   This file lives IN the repo on purpose. It grew for weeks in a
   session scratchpad and was lost when the container recycled —
   the safety net for every deploy should never be that easy to
   drop. If you add a feature, add its checks here.
   ============================================================ */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain',
  '.webmanifest': 'application/json', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.mjs': 'text/javascript' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  try {
    const body = fs.readFileSync(p);
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const exe = '/opt/pw-browsers/chromium';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('✓', n)) : (fail++, console.log('✗', n)); };
const store = readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const stub = store + `\nGotItStore.event=function(){return Promise.resolve(true);};`;
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const wire = async (p) => {
  await p.route('**/js/store.js', r => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await p.route('**/amplify_outputs.json', r => r.fulfill({ status: 404, body: '' }));
};
const AUTH_STUB = (signedIn) => `
  window.__called=[];
  window.GotItAuth={ idToken:()=>Promise.resolve(${signedIn ? "'tok'" : 'null'}), isSignedIn:()=>${!!signedIn},
    getUser:()=>${signedIn ? "({sub:'s1',email:'clinic@example.com',name:'Seaforth'})" : 'null'},
    signIn:()=>{window.__called.push('signIn');return Promise.resolve();},
    signInWithGoogle:()=>{window.__called.push('signInWithGoogle');return Promise.resolve();},
    signOut:()=>Promise.resolve(), deleteAccount:()=>Promise.resolve(),
    handleRedirect:()=>Promise.resolve(false) };`;

/* ---------- 1. homepage ---------- */
let page = await ctx.newPage(); await wire(page);
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/index.html`);
ok('home: loads without JS errors', errs.length === 0 || (console.log('  ', errs), false));
ok('vets page: the hero invites their own discharge notes',
  /Try it with your own discharge notes/.test(readFileSync(path.join(ROOT, 'vets.html'), 'utf8')));
await page.close();

/* ---------- 1b–1d. vet import, ⚠️ triage, tidy-up ---------- */
page = await ctx.newPage(); await wire(page);
const perrs = []; page.on('pageerror', e => perrs.push(e.message + ' | ' + String(e.stack || '').split('\n').slice(0, 3).join(' | ')));
await page.goto(`http://127.0.0.1:${port}/builder.html?cat=vet`);
await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
const L1 = '⚠️ Check with your clinic: whether any teeth were extracted';
const L2 = '⚠️ Check with your clinic: whether soft food is needed (this depends on whether any teeth were extracted)';
const L3 = '⚠️ Check with your clinic: whether any medications were sent home';
await page.evaluate(([l1, l2, l3]) => {
  GotItStore.ai = () => Promise.resolve({
    title: "Whiskey's Recovery Guide",
    sections: [
      { emoji: '📋', title: 'Visit Summary', body: 'Whiskey had a dental procedure under general anaesthetic. Amoxicillin 250mg twice daily.' },
      { emoji: '🩺', title: 'Diagnosis & Procedure', body: 'Teeth cleaned and polished.\n' + l1 },
      { emoji: '🏠', title: 'Care at Home', body: l2 },
      { emoji: '💊', title: 'Medications', body: l3 }
    ],
    contacts: [{ label: 'Seaforth Veterinary Hospital', value: '02 9949 1288' }],
    flagGroups: [{ question: 'Were any teeth extracted?', lines: [l1, l2] }]
  });
}, [L1, L2, L3]);
await page.fill('#pasteText', 'dental notes');
await page.evaluate(() => document.getElementById('pasteGo').click());
await page.waitForSelector('#step3.active', { timeout: 20000 });
await page.waitForSelector('#vetTriageModal:not([hidden])', { timeout: 6000 });
ok('triage: linked flags collapse into one question', await page.$$eval('#vetTriageList .vt-item', e => e.length === 2));
ok('triage: the shared card asks the question once and says what it settles', await page.evaluate(() => {
  const t = document.querySelector('#vetTriageList .vt-item').innerText;
  return /Were any teeth extracted\?/.test(t) && /settles 2 flagged details/.test(t);
}));
ok('triage: editor chip still counts every flag', await page.$eval('#vetTriageChip', e => !e.hidden && /3 details/.test(e.textContent)));
// Staff pre-write BOTH answers, then save one: the other must survive.
await page.evaluate(() => document.querySelectorAll('#vetTriageList .vt-item .vt-item-actions .btn-primary')[0].click());
await page.evaluate(() => document.querySelectorAll('#vetTriageList .vt-item .vt-item-actions .btn-primary')[1].click());
await page.fill('#vetTriageList .vt-item:nth-of-type(1) .vt-answer textarea', 'No teeth were extracted — just a scale and polish.');
await page.fill('#vetTriageList .vt-item:nth-of-type(2) .vt-answer textarea', 'None to take home.');
ok('triage: Save all appears once two answers are waiting',
  await page.$eval('.vt-saveall', e => !e.hidden && /Save all 2 answers/.test(e.textContent)));
await page.evaluate(() => document.querySelector('#vetTriageList .vt-item .vt-answer button').click());
ok('triage: one answer clears every flag that hung off it', await page.evaluate(() => {
  const t = document.getElementById('guideDoc').innerText;
  return (t.match(/No teeth were extracted/g) || []).length === 2 &&
    !t.includes('whether any teeth were extracted') && !t.includes('whether soft food is needed');
}));
ok('triage: an answer that says something is not queried',
  await page.evaluate(() => !document.querySelector('.vt-absent:not([hidden])')));
ok('triage: the OTHER answer survives the save', await page.evaluate(() => {
  const ta = document.querySelector('#vetTriageList .vt-item .vt-answer textarea');
  const form = document.querySelector('#vetTriageList .vt-item .vt-answer');
  return !!ta && ta.value === 'None to take home.' && !form.hidden;
}));
// A bare "none" is pure absence: the clinic is offered the removal — offered,
// not done for them.
await page.evaluate(() => document.querySelector('#vetTriageList .vt-item .vt-answer button').click());
ok('triage: a bare "none" answer offers to take the line out instead',
  await page.evaluate(() => {
    const c = document.querySelector('.vt-absent');
    return !!c && !c.hidden && /doesn't apply here/.test(c.innerText);
  }));
ok('triage: nothing is removed until the clinic says so', await page.evaluate(() =>
  document.getElementById('guideDoc').innerText.includes('⚠️')));
ok('triage: keeping your own wording is offered as the alternative',
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.vt-absent button')].map(x => x.textContent);
    return t.some(x => /Take it out/.test(x)) && t.some(x => /use my wording/i.test(x));
  }));
await page.evaluate(() => document.querySelector('.vt-absent .btn-primary').click());
ok('triage: taking it out leaves the sentence out of the guide', await page.evaluate(() =>
  !document.getElementById('guideDoc').innerText.includes('None to take home.')));
ok('triage: all clear — chip gone, 🎉 shown', await page.$eval('#vetTriageChip', e => e.hidden) &&
  await page.$eval('#vetTriageLead', e => /All sorted/.test(e.textContent)));

/* the second magic round */
ok('refine: the tidy-up is offered, not auto-run', await page.$('.vt-refine') !== null);
await page.evaluate(() => {
  window.__refine = null; const prev = GotItStore.ai;
  GotItStore.ai = function (mode, opts) {
    if (mode !== 'vetrefine') return prev(mode, opts);
    window.__refine = JSON.parse(opts.text);
    const secs = window.__refine.sections;
    // Medications may already be gone: the clinic took its "none" line out in
    // triage, which empties and drops the section.
    const med = secs.find(s => /Medications/.test(s.title));
    const diag = secs.find(s => /Diagnosis/.test(s.title));
    return Promise.resolve({
      sections: [{ id: diag.id, body: 'Teeth cleaned and polished. No teeth were extracted.' }],
      remove: med ? [med.id] : [],
      summary: 'Tidied the diagnosis wording.'
    });
  };
});
await page.evaluate(() => document.querySelector('.vt-refine .btn-primary').click());
await page.waitForFunction(() => window.__refine !== null, { timeout: 8000 });
const refined = await page.evaluate(() => window.__refine);
// What the clinic typed reaches the tidy-up even when the line was taken out
// rather than replaced — else the pass knows less than the nurse told it.
ok('refine: the pass gets every answer as whole-guide context',
  refined.answers.length === 2 && refined.answers.some(a => /No teeth were extracted/.test(a.answer)) &&
  refined.answers.some(a => /None to take home/.test(a.answer)));
await page.waitForFunction(() => !document.getElementById('guideDoc').innerText.includes('Medications'), { timeout: 8000 });
ok('refine: a section left with nothing to say is dropped', await page.evaluate(() =>
  !document.getElementById('guideDoc').innerText.includes('Medications')));
ok('refine: undo puts the clinic\'s wording back', await page.evaluate(() => {
  document.getElementById('undoFab').click();
  const t = document.getElementById('guideDoc').innerText;
  return t.includes('just a scale and polish') && !/polished\.\s*No teeth were extracted\./.test(t);
}));
ok('big PDF + triage: no JS errors', perrs.length === 0 || (console.log('  ', perrs), false));
await page.close();

/* ---------- 1e. publishing a vet guide: clinic → owner throughout ---------- */
page = await ctx.newPage(); await wire(page);
const verrs2 = []; page.on('pageerror', e => verrs2.push(e.message));
await page.goto(`http://127.0.0.1:${port}/builder.html?cat=vet`);
await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
await page.evaluate(() => {
  GotItStore.ai = () => Promise.resolve({
    title: "Whiskey's Recovery Guide", sections: [
      { emoji: '📋', title: 'Visit Summary', body: 'Whiskey had a dental procedure under general anaesthetic.' },
      { emoji: '👍', title: "What's Normal", body: 'Drowsy for up to 24 hours.' },
      { emoji: '📅', title: 'Follow-Up', body: 'Recheck in 10 days.' }
    ], contacts: [{ label: 'Seaforth Veterinary Hospital', value: '02 9949 1288' }]
  });
});
await page.fill('#pasteText', 'dental notes');
await page.evaluate(() => document.getElementById('pasteGo').click());
await page.waitForSelector('#step3.active', { timeout: 20000 });
ok('vet editor: no Last done tracker rides into a clinic guide',
  await page.$('#guideDoc .guide-care-edit') === null &&
  await page.$eval('#addCare', e => e.hidden));
await page.evaluate(() => document.getElementById('publishBtn').click());
await page.waitForSelector('#vetCheckModal:not([hidden])', { timeout: 8000 });
const checkRows = await page.$$eval('#vetCheckList li', e => e.map(x => x.textContent));
ok('safety check: skips medications when none are in the guide',
  !checkRows.some(r => /Medication/i.test(r)));
ok('safety check: still asks about what IS there',
  checkRows.some(r => /urgent care/i.test(r)) && checkRows.some(r => /Follow-up/i.test(r)) &&
  checkRows.some(r => /contact details/i.test(r)));
await page.evaluate(() => { document.getElementById('vetCheckBox').click(); });
await page.evaluate(() => document.getElementById('vetCheckGo').click());
await page.waitForSelector('#coverAskModal:not([hidden])', { timeout: 8000 });
await page.evaluate(() => document.getElementById('coverAskSkip').click());
await page.waitForSelector('#step4.active', { timeout: 12000 });
ok('share: the step is about the patient, not "your guide"',
  /Whiskey's guide is ready to send/.test(await page.textContent('#step4 .step-heading')) &&
  /Send it to Whiskey's owner/.test(await page.textContent('#step4 .step-lead')));
ok('share: the send block addresses the owner',
  /Send it to Whiskey's owner/.test(await page.textContent('#shareSendLabel')));
ok('share: SMS is signposted as coming soon, and inert',
  await page.$eval('#smsSoon', e => !e.hidden) &&
  await page.$eval('#smsSoonInput', e => e.disabled) &&
  /Coming soon/i.test(await page.textContent('#smsSoon .soon-pill')));
ok('share: the edit link stays inside the practice',
  /never send it to the owner/i.test(await page.textContent('.collab-note')));
ok('share: a clinic with no account still gets its edit link',
  await page.$eval('.save-fallback', e => !e.hidden));
await page.waitForSelector('#keepModal:not([hidden])', { timeout: 8000 });
ok('keep: the nudge speaks to a clinic, not a pet owner',
  /clinic account/i.test(await page.textContent('#keepTitle')) &&
  /clinic account/i.test(await page.textContent('#keepDash')));
ok('vet publish: no JS errors', verrs2.length === 0 || (console.log('  ', verrs2), false));
await page.close();

/* ---------- 1e-bis. the same step for a clinic that IS signed in ---------- */
page = await ctx.newPage(); await wire(page);
await page.route('**/js/auth.js', r => r.fulfill({ contentType: 'text/javascript', body: AUTH_STUB(true) }));
const cerrs = []; page.on('pageerror', e => cerrs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/builder.html?cat=vet`);
await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
await page.evaluate(() => {
  GotItStore.ai = () => Promise.resolve({
    title: "Whiskey's Recovery Guide", sections: [
      { emoji: '📋', title: 'Visit Summary', body: 'Whiskey had a dental procedure under general anaesthetic.' },
      { emoji: '💊', title: 'Medications', body: 'No medications were sent home.' },
      { emoji: '📅', title: 'Follow-Up', body: 'Recheck in 10 days.' }
    ], contacts: [{ label: 'Seaforth Veterinary Hospital', value: '02 9949 1288' }]
  });
});
await page.fill('#pasteText', 'dental notes');
await page.evaluate(() => document.getElementById('pasteGo').click());
await page.waitForSelector('#step3.active', { timeout: 20000 });
ok('editor: a "no medications" section is not the loudest thing on the page',
  await page.$$eval('#guideDoc .guide-section', els =>
    !els.some(e => /Medications/.test(e.textContent) && /sec-med/.test(e.className))));
const code = await page.$eval('#lockPass', e => e.value);
await page.evaluate(() => document.getElementById('publishBtn').click());
await page.waitForSelector('#vetCheckModal:not([hidden])', { timeout: 8000 });
await page.evaluate(() => { document.getElementById('vetCheckBox').click(); });
await page.evaluate(() => document.getElementById('vetCheckGo').click());
await page.waitForSelector('#coverAskModal:not([hidden])', { timeout: 8000 });
await page.evaluate(() => document.getElementById('coverAskSkip').click());
await page.waitForSelector('#step4.active', { timeout: 12000 });
ok('share: a signed-in clinic is not shown the edit-link noise',
  await page.$eval('.save-fallback', e => e.hidden));
ok('share: the clinic still has its dashboard route back in',
  await page.$eval('#saveDash', e => !e.hidden));
ok('share: Preview live page replaces the quieter Open guide',
  await page.$eval('#previewGuide', e => !e.hidden) &&
  await page.$eval('#openGuide', e => e.hidden));
await page.evaluate(() => document.getElementById('previewGuide').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
const vslug = await page.$eval('#shareUrl', e => e.value.split('/g/')[1]);
const previewHref = await page.$eval('#previewGuide', e => e.href);
ok('share: preview hands the guide code to the next tab',
  await page.evaluate(s => sessionStorage.getItem('gotit_preview_' + s), vslug) === code);
ok('share: the guide code never rides in the preview URL',
  code.length > 0 && previewHref.indexOf(code) === -1 && previewHref.endsWith('/g/' + vslug));
ok('clinic share: no JS errors', cerrs.length === 0 || (console.log('  ', cerrs), false));
await page.close();

/* ---------- 1f. the vet start screen fits a phone ---------- */
page = await ctx.newPage(); await wire(page);
await page.goto(`http://127.0.0.1:${port}/builder.html?cat=vet`);
await page.waitForTimeout(500);
ok('vet start: panel stays inside the card, page cannot pan sideways', await page.evaluate(() => {
  const step = document.querySelector('#stepStart'), panel = document.getElementById('pastePanel');
  if (!step || !panel) return false;
  const s = step.getBoundingClientRect(), p = panel.getBoundingClientRect();
  return p.left >= s.left && p.right <= s.right + 1 &&
    document.documentElement.scrollWidth <= window.innerWidth;
}));
ok('vet start: the long upload label is not clipped', await page.evaluate(() => {
  const b = document.getElementById('vetUploadPhotos');
  return !!b && b.scrollWidth <= b.clientWidth + 1;
}));
await page.close();

/* ---------- 2. build + publish a pet guide ---------- */
page = await ctx.newPage(); await wire(page);
const berrs = []; page.on('pageerror', e => berrs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/builder.html`);
await page.addStyleTag({ content: '*{animation:none!important;transition:none!important} html{scroll-behavior:auto!important}' });
await page.evaluate(() => document.querySelector('#catGrid .cat-more').click());
await page.evaluate(() => { const c = [...document.querySelectorAll('#catGrid *')].find(e => e.textContent.includes('Pet Care')); (c.closest('button') || c).click(); });
await page.waitForSelector('#stepStart.active');
await page.evaluate(() => document.getElementById('startScratch').click());
await page.waitForSelector('#stepLive.active');
await page.fill('#lfField', 'Whiskey');
await page.evaluate(() => document.getElementById('lfNext').click());
await page.waitForFunction(() => document.querySelector('.lf-q').textContent.includes('photo'));
await page.evaluate(() => document.getElementById('lfPhotoSkip').click());
await page.waitForFunction(() => document.querySelector('.lf-q').textContent.includes('first time'));
ok('flow: About question names the pet', (await page.textContent('.lf-q')).includes('Whiskey'));
await page.fill('#lfField', 'Cocker spaniel, 6. Ball obsessed. Breakfast at 8am.');
await page.evaluate(() => document.getElementById('lfNext').click());
for (let i = 0; i < 9; i++) {
  if (await page.evaluate(() => document.getElementById('lfNext').textContent.includes('Review & publish'))) break;
  const q = await page.textContent('.lf-q');
  await page.evaluate(() => document.getElementById('lfSkip').click());
  await page.waitForFunction(prev => { const e = document.querySelector('.lf-q'); return !e || e.textContent !== prev; }, q);
}
ok('flow: ends on the Just a sec moment', await page.$('.lf-embed.lf-jas') !== null);
await page.fill('#lfField', 'He snores loudly.');
await page.evaluate(() => document.getElementById('lfNext').click());
await page.waitForSelector('#step3.active', { timeout: 9000 });
ok('editor: reached with answers intact', (await page.textContent('#guideDoc')).includes('Cocker spaniel'));
ok('editor: Quirks section keeps the amber treatment', await page.$('#guideDoc .guide-section.sec-byw') !== null);
ok('editor: Quirks section is personalised', await page.evaluate(() => {
  const el = document.querySelector('#guideDoc .guide-section.sec-byw .acc-title-text');
  return !!el && el.textContent.trim() === "Whiskey's Quirks";
}));
ok('editor: routine chips mined from 8am', await page.$('.routine-suggest-chip') !== null);
// The Last done tracker: seeded with the two treatments almost every pet has,
// pinned first, and the add button hides because there already is one.
ok('editor: a new pet guide starts with the Last done tracker', await page.evaluate(() => {
  const el = document.querySelector('#guideDoc .guide-care-edit');
  if (!el) return false;
  const labels = [...el.querySelectorAll('.care-label-in')].map(i => i.value);
  return labels.includes('Tick & flea') && labels.includes('Worming');
}));
ok('editor: the tracker sits above every section', await page.evaluate(() => {
  const care = document.querySelector('#guideDoc .guide-care-edit');
  const sec = document.querySelector('#guideDoc .guide-section');
  return !!care && !!sec && !!(care.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING);
}));
ok('editor: the add-tracker button hides once the guide has one',
  await page.$eval('#addCare', e => e.hidden));
ok('editor: send-off replaces the checklist', (await page.textContent('#step3')).includes("You're ready to publish") && await page.$('#pubChecklist') === null);
await page.evaluate(() => document.getElementById('addSection').click());
await page.waitForSelector('#secPickModal:not([hidden])');
ok('editor: picker hides already-covered templates', await page.$eval('#secPickList', e => !e.textContent.includes('Commands')));
await page.evaluate(() => document.querySelector('[data-secpick-close]').click());
// The link button, driven the way a writer would.
await page.evaluate(() => {
  const sec = [...document.querySelectorAll('#guideDoc .guide-section')][0];
  sec.classList.add('open');
  const c = sec.querySelector('.acc-content');
  c.focus(); c.click();
  const t = [...c.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim());
  if (t) {
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(6, t.nodeValue.length));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
});
await page.evaluate(() => document.getElementById('dockFormat').click());
await page.waitForSelector('#dockPop:not([hidden])', { timeout: 4000 });
ok('editor: the format bar offers a link button',
  await page.evaluate(() => [...document.querySelectorAll('#dockPop .dock-pop-btn')].some(b => b.textContent.includes('🔗'))));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#dockPop .dock-pop-btn')].find(x => x.textContent.includes('🔗'));
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  btn.click();
});
await page.waitForSelector('.dock-pop-link', { timeout: 4000 });
ok('editor: it offers to link the words already selected',
  /Link "/.test(await page.textContent('.dock-pop-label')));
await page.evaluate(() => {
  const i = document.querySelector('.dock-pop-link input[type=url]');
  i.value = 'javascript:alert(1)';
  document.querySelector('.dock-pop-go').click();
});
ok('editor: a dangerous address is refused in front of the writer',
  await page.evaluate(() => { const e = document.querySelector('.dock-pop-err'); return !!e && !e.hidden; }) &&
  await page.evaluate(() => !!document.querySelector('.dock-pop-link')));
await page.evaluate(() => {
  const i = document.querySelector('.dock-pop-link input[type=url]');
  i.value = 'gotitguides.com/g/whiskeys101';
  document.querySelector('.dock-pop-go').click();
});
await page.waitForTimeout(400);
const linked = await page.evaluate(() => {
  const a = document.querySelector('#guideDoc .acc-content a');
  return a ? { href: a.getAttribute('href'), rel: a.getAttribute('rel') } : null;
});
ok('editor: the link lands in the section', !!linked && linked.href === 'https://gotitguides.com/g/whiskeys101');
ok('editor: it carries the same protections as a published one', !!linked && /noopener/.test(linked.rel || ''));
await page.evaluate(() => document.getElementById('publishBtn').click());
await page.waitForSelector('#coverAskModal:not([hidden])');
await page.evaluate(() => document.getElementById('coverAskSkip').click());
await page.waitForSelector('#step4.active', { timeout: 9000 });
ok('publish: reaches the share step', true);
await page.waitForSelector('#keepModal:not([hidden])', { timeout: 5000 });
ok('publish: keep-access nudge appears', (await page.textContent('#keepTitle')).includes("Don't lose edit access"));
ok('publish: consumer guides keep consumer copy', await page.evaluate(() => {
  const t = document.getElementById('step4').innerText;
  return !/clinic/i.test(t) && document.getElementById('smsSoon').hidden &&
    /Your guide is live/.test(document.querySelector('#step4 .step-heading').textContent);
}));
await page.evaluate(() => document.getElementById('keepSkip').click());
const slug = await page.$eval('#shareUrl', e => e.value.split('/g/')[1]);
ok('builder: no JS errors', berrs.length === 0 || (console.log('  ', berrs), false));
await page.close();

/* ---------- 3. the published guide ---------- */
page = await ctx.newPage(); await wire(page);
const verrs = []; page.on('pageerror', e => verrs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/guide.html?g=${slug}`);
await page.waitForSelector('.guide-section');
ok('viewer: renders the guide', (await page.textContent('#guideDoc')).includes('Whiskey'));
ok('viewer: Quirks keeps its treatment', await page.$('.guide-section.sec-byw') !== null);
ok('viewer: noindex present', await page.$eval('meta[name="robots"]', e => /noindex/.test(e.content)));
// The Last done tracker, live.
ok('viewer: the Last done tracker is pinned above the sections', await page.evaluate(() => {
  const care = document.querySelector('.guide-care'), sec = document.querySelector('.guide-section');
  return !!care && !!sec && !!(care.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING);
}));
ok('viewer: undated treatments invite the first tap', await page.evaluate(() => {
  const t = document.querySelector('.guide-care').innerText;
  return /Tick & flea/.test(t) && /Worming/.test(t) && /not recorded yet/.test(t);
}));
await page.evaluate(() => document.querySelector('.care-done').click());
await page.waitForFunction(() => /today/.test((document.querySelector('.care-row .care-status') || {}).textContent || ''), { timeout: 6000 });
ok('viewer: one tap records today', true);
await page.reload(); await page.waitForSelector('.guide-care');
ok('viewer: the tap survives a reload', await page.evaluate(() =>
  /today/.test(document.querySelector('.care-row .care-status').textContent)));
ok('viewer: a care tracker never renders as a log table', await page.evaluate(() => {
  const id = document.querySelector('.guide-care').getAttribute('data-care');
  return !document.querySelector('.guide-log[data-log="' + id + '"]');
}));
const CS = await page.evaluate(() => ({
  overdue: GotItStore.careStatus({ id: 'r', every: 2 }, { rows: [{ when: '2026-08-13', note: 'r' }] }, '2026-09-02'),
  ahead: GotItStore.careStatus({ id: 'r', every: 4 }, { rows: [{ when: '2026-08-13', note: 'r' }] }, '2026-09-02'),
  never: GotItStore.careStatus({ id: 'r', every: 4 }, { rows: [] }, '2026-09-02'),
  others: GotItStore.careStatus({ id: 'r' }, { rows: [{ when: '2026-08-13', note: 'OTHER' }] }, '2026-09-02'),
  latest: GotItStore.careStatus({ id: 'r' }, { rows: [{ when: '2026-08-01', note: 'r' }, { when: '2026-08-20', note: 'r' }] }, '2026-09-02'),
  sameDay: GotItStore.careStatus({ id: 'r' }, { rows: [{ when: '2026-09-02', note: 'r' }] }, '2026-09-02'),
}));
ok('care maths: overdue by the interval', CS.overdue.overdue && /6 days overdue/.test(CS.overdue.due));
ok('care maths: due ahead is a countdown', !CS.ahead.overdue && /due in 8 days/.test(CS.ahead.due));
ok('care maths: never done reads plainly', CS.never.ago === 'not recorded yet' && CS.never.due === null);
ok('care maths: other rows\' taps are ignored', CS.others.last === null);
ok('care maths: the latest tap wins', CS.latest.last === '2026-08-20');
ok('care maths: a tap today reads as today', CS.sameDay.ago === 'today');
ok('viewer: no JS errors', verrs.length === 0 || (console.log('  ', verrs), false));
await page.close();

/* ---------- 3b. a guide published BEFORE the rename ---------- */
page = await ctx.newPage(); await wire(page);
await page.goto(`http://127.0.0.1:${port}/guide.html?g=legacy-byw`);
await page.evaluate(() => {
  localStorage.setItem('how2_guides', JSON.stringify({ 'legacy-byw': { slug: 'legacy-byw', category: 'pet',
    title: 'Old Guide', subtitle: '', emoji: '🐶', sections: [{ id: 'a', icon: '✨', title: 'Before You Worry', body: 'He snores.' }],
    contacts: [], logs: [], noRoutine: true, noEmergency: true } }));
});
await page.reload();
await page.waitForSelector('.guide-section');
ok('viewer: old "Before You Worry" guides keep the amber treatment',
  await page.$('.guide-section.sec-byw') !== null);
await page.close();

/* ---------- 3c. a locked envelope whose flag lost its type ---------- */
page = await ctx.newPage(); await wire(page);
await page.goto(`http://127.0.0.1:${port}/guide.html?g=enc-str`);
await page.evaluate(() => {
  localStorage.setItem('how2_guides', JSON.stringify({ 'enc-str': { enc: '1', slug: 'enc-str',
    title: "Whiskey's Recovery Guide", emoji: '❤️‍🩹', salt: 'AAAA', iv: 'BBBB', ct: 'Q0lQSEVSVEVYVA==' } }));
});
await page.reload(); await page.waitForTimeout(600);
ok('viewer: a locked guide is locked even if enc is a string', await page.evaluate(() =>
  !!document.getElementById('unlockPass') && !document.getElementById('guideFeedback')));
ok('viewer: it still names the guide on the unlock screen', await page.evaluate(() =>
  document.body.innerText.includes("Whiskey's Recovery Guide")));
await page.close();

/* ---------- 3c-bis. the preview handoff opens a locked guide once ---------- */
page = await ctx.newPage(); await wire(page);
await page.goto(`http://127.0.0.1:${port}/guide.html?g=prev-lock`);
await page.evaluate(async () => {
  const g = { slug: 'prev-lock', category: 'vet', title: "Whiskey's Recovery Guide", subtitle: '',
    emoji: '❤️‍🩹', contacts: [], logs: [], noRoutine: true, noEmergency: true,
    sections: [{ id: 'a', icon: '📋', title: 'Visit Summary', body: 'Dental procedure under GA.' }] };
  const env = await GotItStore.encrypt(g, '2095');
  localStorage.setItem('how2_guides', JSON.stringify({ 'prev-lock': env }));
  sessionStorage.setItem('gotit_preview_prev-lock', '2095');
});
await page.reload(); await page.waitForTimeout(800);
ok('preview: a locked guide opens without asking the clinic to retype the code',
  await page.evaluate(() => !document.getElementById('unlockPass')) &&
  (await page.textContent('#guideDoc')).includes('Dental procedure'));
ok('preview: the handed-over code is spent, not left lying around',
  await page.evaluate(() => sessionStorage.getItem('gotit_preview_prev-lock') === null));
await page.reload(); await page.waitForTimeout(800);
ok('preview: reloading that same tab is back to a locked guide',
  await page.evaluate(() => !!document.getElementById('unlockPass')));
await page.evaluate(() => { sessionStorage.setItem('gotit_preview_prev-lock', '9999'); });
await page.reload(); await page.waitForTimeout(800);
ok('preview: a wrong handed-over code falls back to the lock screen',
  await page.evaluate(() => !!document.getElementById('unlockPass')));
await page.close();

/* ---------- 3d. Medications only shouts when there ARE medications ---------- */
page = await ctx.newPage(); await wire(page);
const medGuide = (body) => ({ slug: 'med-test', category: 'vet', title: "Whiskey's Recovery Guide",
  subtitle: '', emoji: '❤️‍🩹', contacts: [], logs: [], noRoutine: true, noEmergency: true,
  sections: [{ id: 'a', icon: '📋', title: 'Visit Summary', body: 'Dental procedure.' },
    { id: 'b', icon: '💊', title: 'Medications', body: body },
    { id: 'c', icon: '🏠', title: 'Care at Home', body: 'Soft food for three days.' }] });
await page.goto(`http://127.0.0.1:${port}/guide.html?g=med-test`);
const medCls = async (body) => {
  await page.evaluate(g => localStorage.setItem('how2_guides', JSON.stringify({ 'med-test': g })), medGuide(body));
  await page.reload(); await page.waitForSelector('.guide-section');
  return page.$$eval('.guide-section', els =>
    els.filter(e => /Medications/.test(e.textContent)).map(e => e.className)[0] || '');
};
ok('viewer: a real medication keeps the orange spine',
  /sec-med/.test(await medCls('Metacam 1.5ml once daily with food for 5 days.')));
const noneCls = await medCls('No medications were sent home.');
ok('viewer: "no medications" drops the orange spine', !/sec-med/.test(noneCls));
ok('viewer: "no medications" is no longer forced open', !/\bopen\b/.test(noneCls));
ok('viewer: the Medications section still exists to open',
  (await page.textContent('#guideDoc')).includes('Medications'));
const medCases = await page.evaluate(() => ({
  none: GotItStore.hasMeds('No medications were sent home.'),
  bare: GotItStore.hasMeds('None.'),
  nil: GotItStore.hasMeds('Nil'),
  empty: GotItStore.hasMeds(''),
  placeholder: GotItStore.hasMeds('Tap to add details…'),
  real: GotItStore.hasMeds('Give 1 tablet twice daily.'),
  mixed: GotItStore.hasMeds('Metacam 1.5ml once daily. No other medications were dispensed.'),
  note: GotItStore.hasMeds('Note: give with food.'),
  html: GotItStore.hasMeds('<p>No medications were sent home.</p>')
}));
ok('meds rule: "none" phrasings read as empty',
  !medCases.none && !medCases.bare && !medCases.nil && !medCases.empty &&
  !medCases.placeholder && !medCases.html);
ok('meds rule: real instructions are never demoted',
  medCases.real && medCases.mixed && medCases.note);
await page.close();

/* ---------- 3d-bis. a read-only tracker still informs ---------- */
page = await ctx.newPage(); await wire(page);
await page.goto(`http://127.0.0.1:${port}/guide.html?g=care-ro`);
await page.evaluate(() => {
  const d = new Date(Date.now() - 20 * 864e5);
  const when = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  localStorage.setItem('how2_guides', JSON.stringify({ 'care-ro': { slug: 'care-ro', category: 'pet',
    title: "Whiskey's 101", subtitle: '', emoji: '🐶', contacts: [], noRoutine: true, noEmergency: true,
    sections: [{ id: 'a', icon: '🐾', title: 'Behaviour', body: 'Good boy.' }],
    logs: [{ id: 'cl', kind: 'care', title: 'Last done', ownerOnly: true,
      care: [{ id: 'r1', icon: '🕷️', label: 'Tick & flea', every: 2 }],
      rows: [{ when: when, note: 'r1' }] }] } }));
});
await page.reload(); await page.waitForSelector('.guide-care');
ok('care: a read-only tracker shows the record but takes no taps', await page.evaluate(() =>
  !document.querySelector('.care-done') && /weeks ago/.test(document.querySelector('.guide-care').innerText)));
ok('care: overdue is marked in the accent, as a nudge', await page.evaluate(() =>
  !!document.querySelector('.care-due.over')));
await page.close();

/* ---------- 3e. the clinic kit is a clinic-only surface ---------- */
async function dashWith(guides, profile) {
  const p = await ctx.newPage();
  await p.route('**/js/auth.js', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.GotItAuth={ idToken:()=>Promise.resolve('tok'), isSignedIn:()=>true,
      getUser:()=>({sub:'s1',email:'j@example.com',name:'James'}),
      signIn:()=>Promise.resolve(), signInWithGoogle:()=>Promise.resolve(), signOut:()=>Promise.resolve(),
      deleteAccount:()=>Promise.resolve(), handleRedirect:()=>Promise.resolve(false) };` }));
  await p.route('**/js/store.js', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.__stub=${JSON.stringify({ guides, profile })};
    window.GotItStore={ getProfile:()=>Promise.resolve(window.__stub.profile),
      listSavedGuides:()=>Promise.resolve(window.__stub.guides),
      listGuideFeedback:()=>Promise.resolve([]), guideStats:()=>Promise.resolve({}),
      saveProfile:()=>Promise.resolve(window.__stub.profile), event:()=>Promise.resolve(true),
      sendWelcome:()=>Promise.resolve(), logoFromFile:()=>Promise.resolve('') };` }));
  await p.goto(`http://127.0.0.1:${port}/dashboard.html`);
  await p.waitForTimeout(800);
  return p;
}
const petRow = { id: '1', slug: 'whiskey-101', title: "Whiskey's 101", emoji: '📘', status: 'published', locked: false };
const vetRow = { id: '2', slug: 'whiskey-abcd', title: "Whiskey's Recovery Guide", emoji: '❤️‍🩹', status: 'published', locked: true, category: 'vet' };
let dp = await dashWith([petRow], { id: 'p1', displayName: 'James' });
ok('dashboard: a consumer never sees My clinic', await dp.$eval('#clinicKit', e => e.hidden));
await dp.close();
dp = await dashWith([petRow, vetRow], { id: 'p1', displayName: 'James' });
ok('dashboard: a clinic with a discharge guide sees My clinic', await dp.$eval('#clinicKit', e => !e.hidden));
await dp.close();
dp = await dashWith([{ ...vetRow, category: undefined }], { id: 'p1', displayName: 'James' });
ok('dashboard: a vet row saved before the category field still counts', await dp.$eval('#clinicKit', e => !e.hidden));
await dp.close();
dp = await dashWith([petRow], { id: 'p1', displayName: 'James', clinicName: 'Seaforth Vets' });
ok('dashboard: a clinic that filled the kit in keeps seeing it', await dp.$eval('#clinicKit', e => !e.hidden));
await dp.close();

/* ---------- 3f. sign-in is not a Google-only door ---------- */
page = await ctx.newPage();
await page.route('**/js/auth.js', r => r.fulfill({ contentType: 'text/javascript', body: AUTH_STUB(false) }));
await page.route('**/js/store.js', r => r.fulfill({ contentType: 'text/javascript', body: `
  window.GotItStore={ getProfile:()=>Promise.resolve(null), listSavedGuides:()=>Promise.resolve([]),
    listGuideFeedback:()=>Promise.resolve([]), guideStats:()=>Promise.resolve({}),
    saveProfile:()=>Promise.resolve(null), event:()=>Promise.resolve(true),
    sendWelcome:()=>Promise.resolve(), logoFromFile:()=>Promise.resolve('') };` }));
await page.goto(`http://127.0.0.1:${port}/dashboard.html`);
await page.waitForSelector('#dashSignin:not([hidden])', { timeout: 8000 });
ok('sign-in: the button does not present itself as Google-only', await page.evaluate(() => {
  const b = document.getElementById('signinBtn');
  return !!b && !b.querySelector('svg') && !/google/i.test(b.textContent);
}));
const ways = await page.evaluate(() => { const e = document.querySelector('.dash-signin-ways'); return e ? e.textContent : ''; });
ok('sign-in: both ways in are named on the page', /google/i.test(ways) && /code/i.test(ways));
await page.evaluate(() => { const btn = document.getElementById('signinBtn'); if (btn) btn.click(); });
ok('sign-in: it opens the chooser instead of jumping to Google',
  (await page.evaluate(() => window.__called)).join() === 'signIn');
await page.close();
const copySrc = ['builder.html', 'about.html', 'privacy.html', 'dashboard.html']
  .map(f => readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
ok('sign-in: no page still promises Google as the only way in',
  !/You'll sign in with Google/i.test(copySrc));
ok('sign-in: nothing in the app jumps straight to the Google IdP',
  !/GotItAuth\.signInWithGoogle\(/.test(
    ['js/builder.js', 'js/dashboard.js'].map(f => readFileSync(path.join(ROOT, f), 'utf8')).join('\n')));

/* ---------- 3g. a preview branch signs in against its OWN pool ---------- */
page = await ctx.newPage();
await page.route('**/amplify_outputs.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
  auth: { aws_region: 'ap-southeast-2', user_pool_id: 'ap-southeast-2_DEVPOOL',
    user_pool_client_id: 'devclient123',
    oauth: { domain: 'devpool123.auth.ap-southeast-2.amazoncognito.com',
      scopes: ['openid', 'email', 'profile'] } } }) }));
await page.goto(`http://127.0.0.1:${port}/dashboard.html`);
const devCfg = await page.evaluate(() => GotItAuth.config());
ok('auth: a non-production host uses its own pool\'s domain',
  !!devCfg && devCfg.domain === 'https://devpool123.auth.ap-southeast-2.amazoncognito.com');
ok('auth: it does not borrow production\'s custom domain',
  !!devCfg && devCfg.domain.indexOf('auth.gotitguides.com') === -1);
ok('auth: the pool details still come from the branch\'s own outputs',
  devCfg.clientId === 'devclient123' && devCfg.userPoolId === 'ap-southeast-2_DEVPOOL');
await page.close();
const authSrc = readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');
const authRes = readFileSync(path.join(ROOT, 'amplify/auth/resource.ts'), 'utf8');
ok('auth: a branch registers its own callback URL with its pool',
  /AWS_APP_ID/.test(authRes) && /AWS_BRANCH/.test(authRes) &&
  /branchOrigin \+ "\/dashboard\.html"/.test(authRes) && /branchOrigin \+ "\/"/.test(authRes));
ok('auth: the live callback URLs are still registered',
  /"https:\/\/www\.gotitguides\.com\/dashboard\.html"/.test(authRes) &&
  /"https:\/\/gotitguides\.com\/dashboard\.html"/.test(authRes));
ok('auth: production still signs in on auth.gotitguides.com',
  /PROD_HOSTS\s*=\s*\[[^\]]*"gotitguides\.com"[^\]]*"www\.gotitguides\.com"/.test(authSrc) &&
  /CUSTOM_AUTH_DOMAIN\s*=\s*"auth\.gotitguides\.com"/.test(authSrc));

/* ---------- 3h. links ---------- */
page = await ctx.newPage(); await wire(page);
await page.goto(`http://127.0.0.1:${port}/guide.html?g=nope`);
const L = await page.evaluate(() => {
  const r = (s) => GotItStore.renderBody(s);
  const hrefs = (s) => { const d = document.createElement('div'); d.innerHTML = r(s);
    return [...d.querySelectorAll('a')].map(a => a.getAttribute('href')); };
  const rels = (s) => { const d = document.createElement('div'); d.innerHTML = r(s);
    return [...d.querySelectorAll('a')].map(a => a.getAttribute('rel') + '|' + a.getAttribute('target')); };
  return {
    js: hrefs('<a href="javascript:alert(1)">tap me</a>'),
    jsText: r('<a href="javascript:alert(1)">tap me</a>'),
    obfusc: hrefs('<a href="java script:alert(1)">x</a>'),
    newline: hrefs('<a href="java\nscript:alert(1)">x</a>'),
    dataUri: hrefs('<a href="data:text/html,<script>alert(1)</script>">x</a>'),
    vb: hrefs('<a href="vbscript:msgbox(1)">x</a>'),
    https: hrefs('<a href="https://gotitguides.com/g/x">guide</a>'),
    mailto: hrefs('<a href="mailto:vet@example.com">email</a>'),
    tel: hrefs('<a href="tel:0299491288">call</a>'),
    bare: hrefs('<a href="gotitguides.com/g/x">guide</a>'),
    onclick: r('<a href="https://x.com" onclick="alert(1)" style="x">t</a>'),
    plain: hrefs('Our guide is at https://gotitguides.com/g/whiskeys101 have a look'),
    plainTxt: r('See https://gotitguides.com/g/x now'),
    noDouble: hrefs('<a href="https://a.com">https://b.com</a>'),
    rel: rels('<a href="https://x.com">t</a>'),
    autoCls: r('go to https://gotitguides.com/g/x'),
    sentence: hrefs('Read https://gotitguides.com/g/x.'),
    escaped: r('a < b & c'),
  };
});
ok('link: javascript: is refused', L.js.length === 0);
ok('link: refusing a link keeps its words readable', /tap me/.test(L.jsText) && !/javascript/i.test(L.jsText));
ok('link: a scheme hidden with a control character is refused', L.obfusc.length === 0);
ok('link: a scheme split across a newline is refused', L.newline.length === 0);
ok('link: data: and vbscript: are refused', L.dataUri.length === 0 && L.vb.length === 0);
ok('link: https, mailto and tel all survive',
  L.https[0] === 'https://gotitguides.com/g/x' &&
  L.mailto[0] === 'mailto:vet@example.com' && L.tel[0] === 'tel:0299491288');
ok('link: a bare domain gets https rather than being dropped', L.bare[0] === 'https://gotitguides.com/g/x');
ok('link: every other attribute is still stripped',
  !/onclick/i.test(L.onclick) && !/style=/i.test(L.onclick) && /href="https:\/\/x\.com"/.test(L.onclick));
ok('link: a pasted URL in plain text becomes a link', L.plain[0] === 'https://gotitguides.com/g/whiskeys101');
ok('link: the words around a pasted URL are kept', /See /.test(L.plainTxt) && / now/.test(L.plainTxt));
ok('link: a trailing full stop stays in the sentence', L.sentence[0] === 'https://gotitguides.com/g/x');
ok('link: text inside an existing link is not linked again', L.noDouble.length === 1);
ok('link: links cannot reach back into the guide tab or leak its URL',
  /noopener/.test(L.rel[0]) && /noreferrer/.test(L.rel[0]) && /_blank/.test(L.rel[0]));
ok('link: an auto-detected URL is marked so print does not repeat it', /lnk-auto/.test(L.autoCls));
ok('link: plain text is still escaped', /a &lt; b &amp; c/.test(L.escaped));
await page.close();

/* ---------- 4. privacy promises backed by code ---------- */
const robots = readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
ok('robots.txt disallows /g/', /^Disallow:\s*\/g\/\s*$/m.test(robots));
const sitemap = readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
ok('no guide URL in sitemap', !/\/g\//.test(sitemap));

console.log(`\n${pass} passed, ${fail} failed`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
