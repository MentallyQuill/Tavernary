import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

const harness = `
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const calls=[];
childProcess.spawn=(command,args,options)=>{
  calls.push({command,args,token:options.env?.GH_TOKEN});
  const child=Object.assign(new EventEmitter(),{stdin:{end(){}},stdout:new PassThrough(),stderr:new PassThrough()});
  queueMicrotask(()=>{child.stdout.write('{}');child.emit('close',0)});
  return child;
};
syncBuiltinESMExports();
process.env.GH_TOKEN='fixture-write-token';
`;
function probe(source: string) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--input-type=module", "-e", harness + source],
      { encoding: "utf8" },
    ),
  );
}

test("an explicit GitHub credential overrides only the child environment and never argv or the parent token", () => {
  const result = probe(`
const {executeGh}=await import('./scripts/submissions/kit-submission-reconciliation.mjs');
await executeGh(['api','repos/Owner/Repo/actions/variables/SWITCH'],undefined,{token:'fixture-read-token'});
await executeGh(['api','repos/Owner/Repo/pulls/1']);
console.log(JSON.stringify({calls,parentToken:process.env.GH_TOKEN}));
`);
  expect(result.calls[0].token).toBe("fixture-read-token");
  expect(JSON.stringify(result.calls[0].args)).not.toContain(
    "fixture-read-token",
  );
  expect(result.parentToken).toBe("fixture-write-token");
  expect(result.calls[1].token ?? result.parentToken).toBe(
    "fixture-write-token",
  );
});

test("the default writer adapter preserves the explicit credential through its shared request guard", () => {
  const result = probe(`
const {runAutomationWriterCli}=await import('./scripts/automation/writer-cli.mjs');
const env={GITHUB_REPOSITORY:'MentallyQuill/Tavernary',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR_ID:'2625904',GITHUB_WORKFLOW_REF:'MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main',GITHUB_RUN_ID:'700',GITHUB_RUN_ATTEMPT:'1'};
const status=await runAutomationWriterCli({env,event:{inputs:{mode:'prepare'}},loadCooldown:async()=>null,persistCooldown:async()=>{},write(){},handlers:{prepare:async(_inputs,gh)=>gh(['api','repos/MentallyQuill/Tavernary/actions/variables/PROJECT_AUTO_PUBLICATION_ENABLED'],undefined,{token:'fixture-read-token'})}});
console.log(JSON.stringify({status,calls,parentToken:process.env.GH_TOKEN}));
`);
  expect(result.status).toBe(0);
  expect(result.calls[0].token).toBe("fixture-read-token");
  expect(result.calls[0].args).toContain("--include");
  expect(result.parentToken).toBe("fixture-write-token");
});

test("explicit publication reads still consume the shared writer GitHub request budget", () => {
  const result = probe(`
const {runAutomationWriterCli}=await import('./scripts/automation/writer-cli.mjs');
const env={GITHUB_REPOSITORY:'MentallyQuill/Tavernary',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR_ID:'2625904',GITHUB_WORKFLOW_REF:'MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main',GITHUB_RUN_ID:'700',GITHUB_RUN_ATTEMPT:'1'};
const output=[];
const status=await runAutomationWriterCli({env,event:{inputs:{mode:'prepare'}},requestLimit:1,loadCooldown:async()=>null,persistCooldown:async()=>{},write(value){output.push(JSON.parse(value))},handlers:{prepare:async(_inputs,gh)=>{await gh(['api','repos/MentallyQuill/Tavernary/actions/variables/PROJECT_AUTO_PUBLICATION_ENABLED'],undefined,{token:'fixture-read-token'});return gh(['api','repos/MentallyQuill/Tavernary/pulls/1']);}}});
console.log(JSON.stringify({status,calls,output}));
`);
  expect(result.status).toBe(0);
  expect(result.calls).toHaveLength(1);
  expect(result.output).toMatchObject([
    { status: "waiting", reason: "github-request-budget" },
  ]);
});
