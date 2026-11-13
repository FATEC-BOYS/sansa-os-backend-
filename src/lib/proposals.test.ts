import {test} from "node:test";
import assert from "node:assert/strict";
import {resolveProvider,heuristicAssessment} from "./proposals.js";
const env=(extra:Record<string,string>)=>extra as NodeJS.ProcessEnv;
test("no API key defaults to explicitly labeled rules",()=>{
  assert.equal(resolveProvider("auto",env({})),"rules");
});
test("Claude and GPT can be selected independently",()=>{
  assert.equal(resolveProvider("anthropic",env({ANTHROPIC_API_KEY:"test"})),"anthropic");
  assert.equal(resolveProvider("openai",env({OPENAI_API_KEY:"test"})),"openai");
  assert.equal(resolveProvider("auto",env({ANTHROPIC_API_KEY:"test",OPENAI_API_KEY:"test"})),"anthropic");
});
test("missing required provider key does not silently fall back",()=>{
  assert.throws(()=>resolveProvider("anthropic",env({})),/ANTHROPIC_KEY_MISSING/);
  assert.throws(()=>resolveProvider("openai",env({})),/OPENAI_KEY_MISSING/);
});
test("rules produce channel-specific message without unsupported claims",()=>{
  const base={name:"Ateliê Flor",category:"Floricultura",website:null,socialListed:false,score:60,evidence:"OSM"};
  const w=heuristicAssessment({...base,channel:"whatsapp"}),e=heuristicAssessment({...base,channel:"email"});
  assert.notEqual(w.body,e.body);
  assert.ok(w.body.includes("SANSA Oficina Digital"));
  assert.ok(e.body.includes("Alessandra"));
});
