// NOT EXECUTED here. Requires psql and a freshly migrated LOCAL disposable Supabase DB.
// Run: node supabase/tests/ledger-commands-concurrency.mjs 'postgresql://USER:PASS@127.0.0.1:54322/moniq_task4_disposable'
// No .env, linked project, or default connection lookup. This script deliberately leaves
// synthetic audit records intact; discard the dedicated database after inspecting results.
// It tests real blocking/source atomicity, not the TypeScript benefit calculator.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const dsn = process.argv[2];
if (!dsn) throw new Error("Provide the explicit local disposable database URL");
const url = new URL(dsn);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/moniq_task4_disposable") throw new Error("Only the dedicated local moniq_task4_disposable database is allowed");
const owner = randomUUID(), product = randomUUID(), card = randomUUID();
const tx1 = randomUUID(), tx2 = randomUUID();
function run(sql, name = "moniq_task4_probe") {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [dsn, "-XqAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", sql], { env: { ...process.env, PGAPPNAME: name } });
    let out = "", err = "";
    child.stdout.on("data", data => out += data); child.stderr.on("data", data => err += data);
    child.on("error", reject); child.on("close", code => resolve({ code, out: out.trim(), err }));
  });
}
async function ok(sql) { const result = await run(sql); assert.equal(result.code, 0, result.err); return result.out; }
const auth = `set local role authenticated; select set_config('request.jwt.claims','${JSON.stringify({ sub: owner, role: "authenticated" })}',true);`;
const command = (id, body) => `select public.apply_ledger_command('${id}', '${JSON.stringify(body).replaceAll("'", "''")}');`;
const purchase = id => ({ kind: "transaction.create", id, source: { occurred_at: "2026-02-01T01:00:00Z", merchant_name: "Synthetic concurrent purchase", amount: 1000, payment_method: "credit_card", user_card_id: card, payment_channel: "unknown", installment_months: null, ledger_category: null, is_fixed_cost: false, memo: null } });
async function race(first, second, expectedFailure) {
  const name = `task4_follower_${randomUUID()}`;
  const leader = spawn("psql", [dsn, "-XqAt", "-v", "ON_ERROR_STOP=1"], { env: { ...process.env, PGAPPNAME: "moniq_task4_leader" } });
  let stderr = "";
  leader.stderr.on("data", data => stderr += data);
  try {
    await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("leader timed out")), 10000);
      leader.stdout.on("data", data => { output += data; if(output.includes("LOCK_HELD")) { clearTimeout(timer); resolve(); } });
      leader.on("error", error => { clearTimeout(timer); reject(error); });
      leader.on("exit", code => { if(code !== null) { clearTimeout(timer); reject(new Error(stderr || `leader exited ${code}`)); } });
      leader.stdin.write(`begin; ${auth} ${first}\n\\echo LOCK_HELD\n`);
    });
    const follower = run(`begin; ${auth} ${second} commit;`, name);
    const deadline = Date.now() + 10000;
    let blocked = false;
    while(Date.now() < deadline) {
      blocked = await ok(`select exists(select 1 from pg_stat_activity where application_name='${name}' and cardinality(pg_blocking_pids(pid))>0);`) === "t";
      if(blocked) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(blocked, true, "follower must demonstrably wait on the owner lock");
    leader.stdin.end("commit;\n\\q\n");
    const result = await follower;
    if(expectedFailure) { assert.notEqual(result.code, 0); assert.match(result.err, new RegExp(expectedFailure)); }
    else assert.equal(result.code, 0, result.err);
  } finally { if(leader.exitCode === null) leader.kill(); }
}
await ok(`begin;
insert into auth.users(id,email,aud,role) values('${owner}','${owner}@moniq.test','authenticated','authenticated');
insert into public.app_members(user_id,role) values('${owner}','owner');
insert into public.cards(id,issuer,name,card_type,searchable_text) values('${product}','Synthetic','Concurrent ledger','credit_card','synthetic');
insert into public.user_cards(id,owner_id,card_id) values('${card}','${owner}','${product}');
commit;`);
await race(command(randomUUID(), purchase(tx1)), command(randomUUID(), purchase(tx2)));
assert.equal(await ok(`select count(*) from public.transactions where owner_id='${owner}';`), "2");
assert.equal(await ok(`select revision from public.owner_ledger_revisions where owner_id='${owner}';`), "2");
await race(command(randomUUID(), { kind: "transaction.update", id: tx1, expected_version: "1", patch: { memo: "first" } }), command(randomUUID(), { kind: "transaction.update", id: tx1, expected_version: "1", patch: { memo: "stale" } }), "40001");
const refund = () => ({ kind: "refund.create", id: randomUUID(), source: { transaction_id: tx1, occurred_at: "2026-03-01T01:00:00Z", amount: 600, memo: null } });
await race(command(randomUUID(), refund()), command(randomUUID(), refund()), "23514");
assert.equal(await ok(`select sum(amount) from public.transaction_adjustments where owner_id='${owner}';`), "600");
const request = randomUUID(), body = purchase(randomUUID());
await race(command(request, body), command(request, body));
assert.equal(await ok(`select count(*) from public.ledger_mutation_log where owner_id='${owner}' and request_id='${request}';`), "1");
assert.equal(await ok(`select revision from public.owner_ledger_revisions where owner_id='${owner}';`), "5");
const snapshot = await ok(`begin; ${auth} select public.get_ledger_inputs('2026-02'); commit;`);
const inputs = JSON.parse(snapshot.split("\n").at(-1));
assert.equal(inputs.inputs.transactions.length, 3); assert.equal(inputs.inputs.adjustments.length, 1); assert.equal(inputs.ownerRevision, "5");
console.log("PASS: concurrent creates, observed owner-lock blocking, stale edit, cumulative refund cap, identical concurrent retry, complete snapshot.");
console.log(`Synthetic owner retained for inspection: ${owner}`);
