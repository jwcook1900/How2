/* Unit checks for the Cognito custom-email-sender copy (the sign-in and
   confirmation codes sent via Resend). The smoke suite drives a browser, so it
   can't reach a Lambda; these run the pure wording/rendering bits directly. */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('✓', n)) : (fail++, console.log('✗', n)); };

// Compile the handler's pure exports without dragging in the KMS client.
const src = readFileSync(path.join(ROOT, 'amplify/functions/auth-email/handler.ts'), 'utf8');
const pure = src
  .replace(/^import[\s\S]*?from "\.\.\/shared\/sendEmail";\n/m, '')
  .replace(/^import \{ buildClient[\s\S]*?client-node";\n/m, '')
  .replace(/const \{ decrypt \} = buildClient[\s\S]*?\n/, '')
  .replace(/let keyring[\s\S]*?^}/m, '')
  .replace(/export const handler[\s\S]*$/m, '');
const dir = mkdtempSync(path.join(tmpdir(), 'authmail-'));
const tsFile = path.join(dir, 'copy.ts');
writeFileSync(tsFile, pure);
execSync(`npx tsc --target es2020 --module es2020 --moduleResolution bundler --skipLibCheck ${tsFile}`, { cwd: ROOT });
const { wordingFor, render } = await import(path.join(dir, 'copy.js'));

const SOURCES = [
  'CustomEmailSender_Authentication',
  'CustomEmailSender_SignUp',
  'CustomEmailSender_ResendCode',
  'CustomEmailSender_ForgotPassword',
  'CustomEmailSender_UpdateUserAttribute',
  'CustomEmailSender_VerifyUserAttribute',
  'CustomEmailSender_AdminCreateUser',
];

// A code that never reaches the recipient is the worst outcome available, so an
// unrecognised trigger source must still produce a sendable email.
ok('every trigger source, known or not, yields sendable wording',
  [...SOURCES, 'CustomEmailSender_SomethingAWSAddsLater', ''].every(s => {
    const w = wordingFor(s, false);
    return w.subject && w.lead && w.label && w.footnote;
  }));
ok('the sign-in code email is the one a returning clinic gets',
  /sign-in code/i.test(wordingFor('CustomEmailSender_Authentication', false).subject));
ok('sign-up and sign-in do not read the same',
  wordingFor('CustomEmailSender_SignUp', false).subject !==
  wordingFor('CustomEmailSender_Authentication', false).subject);
ok('a temporary password is never called a code',
  /temporary password/i.test(wordingFor('CustomEmailSender_AdminCreateUser', true).label));

// The anti-phishing requirement: an unfamiliar address asking for a code has to
// say who it is and why it arrived, or a cautious practice manager bins it.
ok('every subject names GotIt Guides',
  SOURCES.every(s => /GotIt Guides/.test(wordingFor(s, false).subject)));
ok('every email says what to do if you did not ask for it',
  SOURCES.every(s => /ignore this email/i.test(wordingFor(s, false).footnote)));

const r = render(wordingFor('CustomEmailSender_Authentication', false), '653603');
ok('the code appears in both the text and HTML parts',
  r.text.includes('653603') && r.html.includes('653603'));
ok('the HTML names the site so it is checkable',
  /gotitguides\.com/.test(r.html) && /gotitguides\.com/.test(r.text));
ok('brand: the accent is the orange token value, not a stray hex',
  r.html.includes('#ED7446') && !/#FF6B35|#F5A623/.test(r.html));

const hostile = render(wordingFor('CustomEmailSender_Authentication', false), '<script>x</script>');
ok('a code is escaped rather than injected into the HTML',
  !hostile.html.includes('<script>') && hostile.html.includes('&lt;script&gt;'));

// House style, checked on the copy only (code comments are exempt).
const copyStrings = [...SOURCES, ''].flatMap(s => {
  const w = wordingFor(s, false);
  return [w.subject, w.lead, w.label, w.footnote];
}).concat([r.text.replace(/https:\/\/\S+/g, '')]);
ok('brand: no em dashes in the new copy', copyStrings.every(t => !t.includes('—')));
ok('brand: subjects are sentence case, not Title Case',
  SOURCES.every(s => {
    const sub = wordingFor(s, false).subject;
    const words = sub.split(' ').filter(w => !/GotIt|Guides/.test(w));
    return words.filter(w => /^[A-Z]/.test(w)).length <= 1;
  }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
