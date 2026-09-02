/* Synthesis checks for the codified Cognito settings, no AWS needed. These
   exist because both classes of backend failure this project has hit were
   invisible to tsc: a lazily-resolved property spread into the template (build
   81), and property names CloudFormation is picky about. Synthesising the same
   shape of pool Amplify produces catches both before a deploy does. */
import { App, Stack } from 'aws-cdk-lib';
import { UserPool, CfnUserPoolDomain } from 'aws-cdk-lib/aws-cognito';
import { Function as LambdaFunction, Runtime, Code } from 'aws-cdk-lib/aws-lambda';

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('✓', n)) : (fail++, console.log('✗', n)); };

const app = new App();
const stack = new Stack(app, 'S', { env: { account: '111111111111', region: 'ap-southeast-2' } });
const fn = new LambdaFunction(stack, 'F', {
  runtime: Runtime.NODEJS_20_X, handler: 'i.h', code: Code.fromInline('exports.h=()=>{}'),
});
// A password policy is set so the "does the override clobber its siblings"
// check has something real to look at; a bare pool emits none at all.
const pool = new UserPool(stack, 'P', {
  lambdaTriggers: { preSignUp: fn },
  passwordPolicy: { minLength: 8 },
});
const cfn = pool.node.defaultChild;
const client = pool.addClient('C');
const cfnClient = client.node.defaultChild;

// Mirrors amplify/backend.ts: the email trigger, the passwordless factors,
// the choice-based auth flow, and managed login on the custom domain.
cfn.addPropertyOverride('LambdaConfig.KMSKeyID', 'arn:aws:kms:ap-southeast-2:111111111111:key/abc');
cfn.addPropertyOverride('LambdaConfig.CustomEmailSender.LambdaArn', fn.functionArn);
cfn.addPropertyOverride('LambdaConfig.CustomEmailSender.LambdaVersion', 'V1_0');
cfn.addPropertyOverride('Policies.SignInPolicy.AllowedFirstAuthFactors', ['PASSWORD', 'EMAIL_OTP']);
cfnClient.explicitAuthFlows = [
  'ALLOW_USER_SRP_AUTH', 'ALLOW_CUSTOM_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH', 'ALLOW_USER_AUTH',
];
new CfnUserPoolDomain(stack, 'D', {
  userPoolId: pool.userPoolId, domain: 'auth.example.com',
  managedLoginVersion: 2,
  customDomainConfig: { certificateArn: 'arn:aws:acm:us-east-1:111111111111:certificate/x' },
});

// The old failure mode, kept as a regression check: assigning a spread of the
// lazily-resolved lambdaConfig must keep failing loudly here, so nobody
// reintroduces it thinking it types-checks (it does — that was the trap).
let spreadErr = null;
try {
  const app2 = new App();
  const st2 = new Stack(app2, 'S2', { env: { account: '111111111111', region: 'ap-southeast-2' } });
  const fn2 = new LambdaFunction(st2, 'F', { runtime: Runtime.NODEJS_20_X, handler: 'i.h', code: Code.fromInline('exports.h=()=>{}') });
  const p2 = new UserPool(st2, 'P', { lambdaTriggers: { preSignUp: fn2 } });
  const c2 = p2.node.defaultChild;
  c2.lambdaConfig = { ...(c2.lambdaConfig || {}), kmsKeyId: 'k' };
  app2.synth();
} catch (e) { spreadErr = e; }
ok('regression: spreading the lazy lambdaConfig still fails at synthesis',
  !!spreadErr && /non-data object|resolve/i.test(String(spreadErr.message)));

const res = app.synth().getStackByName('S').template.Resources;
const P = Object.values(res).find(r => r.Type === 'AWS::Cognito::UserPool').Properties;
const C = Object.values(res).find(r => r.Type === 'AWS::Cognito::UserPoolClient').Properties;
const D = Object.values(res).find(r => r.Type === 'AWS::Cognito::UserPoolDomain').Properties;

ok('email codes are an allowed first factor',
  JSON.stringify(P.Policies.SignInPolicy.AllowedFirstAuthFactors) === '["PASSWORD","EMAIL_OTP"]');
ok('the password factor is kept, not replaced',
  P.Policies.SignInPolicy.AllowedFirstAuthFactors.includes('PASSWORD'));
ok('the password policy Amplify set is not destroyed by the override',
  !!P.Policies.PasswordPolicy);
ok('the app client allows the choice-based flow',
  C.ExplicitAuthFlows.includes('ALLOW_USER_AUTH'));
ok('the three flows Amplify sets are still there',
  ['ALLOW_USER_SRP_AUTH', 'ALLOW_CUSTOM_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']
    .every(f => C.ExplicitAuthFlows.includes(f)));
ok('the custom domain serves managed login, not the classic screen',
  D.ManagedLoginVersion === 2);
ok('the email trigger survives alongside the new policy override',
  !!P.LambdaConfig.CustomEmailSender && !!P.LambdaConfig.KMSKeyID && !!P.LambdaConfig.PreSignUp);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
