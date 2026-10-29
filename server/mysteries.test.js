import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  createMystery,
  discoverClue,
  getMystery,
  requestHint,
  revealMystery,
  submitAccusation
} from "./mysteries.js";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;
let fetchCount = 0;

function generatedCase() {
  return {
    title: "The Clockmaker's Last Hour",
    introduction: "A rare timepiece vanished during a locked-room reception.",
    suspects: [
      { id: "ada", name: "Ada Vale", description: "The clockmaker's apprentice.", motive: "She feared losing her position.", alibi: "She says she was in the workshop." },
      { id: "basil", name: "Basil Reed", description: "A collector with a private gallery.", motive: "He wanted the watch for his collection.", alibi: "He claims he was in the library." },
      { id: "clara", name: "Clara Moss", description: "The host's business partner.", motive: "She needed to repay a debt.", alibi: "She says she was greeting guests." }
    ],
    clues: [
      { id: "wax", title: "Wax seal", description: "A broken seal is found near the display.", relatedSuspectIds: ["ada"], significance: "It points to someone with workshop access." },
      { id: "gear", title: "Brass gear", description: "A gear from a travel clock is left behind.", relatedSuspectIds: ["ada"], significance: "It matches the apprentice's tools." },
      { id: "guestbook", title: "Guestbook", description: "A name was added after the reception began.", relatedSuspectIds: ["basil"], significance: "The timeline rules out the collector." },
      { id: "ledger", title: "Ledger", description: "An account entry contradicts an alibi.", relatedSuspectIds: ["clara"], significance: "The partner was occupied elsewhere." }
    ],
    hints: ["Check who had access to the display.", "Compare the workshop evidence.", "The gear points toward the apprentice."],
    culpritId: "ada",
    solution: {
      motive: "Ada wanted to prove her skill and sell the watch.",
      explanation: "The broken seal and matching gear connect Ada to the display.",
      narrative: "Ada used a quiet moment to take the watch and left behind a gear from her tool kit."
    }
  };
}

before(() => {
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = async (_url, options) => {
    fetchCount += 1;
    assert.equal(options.headers["x-goog-api-key"], "test-key");
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(generatedCase()) }] } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
});

test("keeps the solution server-side until accusation or reveal and persists investigation progress", async () => {
  const mystery = await createMystery("easy", "A locked room at a seaside hotel.");
  assert.equal(fetchCount, 1);
  assert.equal(mystery.difficulty, "easy");
  assert.equal(mystery.premise, "A locked room at a seaside hotel.");
  assert.equal("culpritId" in mystery, false);
  assert.equal("solution" in mystery, false);
  assert.equal("hints" in mystery, false);
  assert.equal("description" in mystery.clues[0], false);

  const clue = await discoverClue(mystery.id, "wax");
  assert.equal(clue.description, "A broken seal is found near the display.");
  const hint = await requestHint(mystery.id);
  assert.equal(hint.hint, "Check who had access to the display.");
  assert.equal(hint.totalHints, 3);

  const restored = await getMystery(mystery.id);
  assert.equal(restored.clues[0].discovered, true);
  assert.equal(restored.clues[0].description, clue.description);
  assert.equal("description" in restored.clues[1], false);
  assert.equal(restored.progress.latestHint, hint.hint);
  assert.equal("solution" in restored, false);

  const accused = await submitAccusation(mystery.id, "ada");
  assert.equal(accused.progress.status, "completed");
  const result = await getMystery(mystery.id);
  assert.equal(result.correct, true);
  assert.equal(result.solution.culprit.id, "ada");
  assert.deepEqual(result.score, {
    total: 74,
    correctAccusation: 60,
    clueDiscovery: 7,
    hintEfficiency: 7
  });

  const secondMystery = await createMystery("hard", "A mystery at a mountain observatory.");
  const revealed = await revealMystery(secondMystery.id);
  assert.equal(revealed.progress.status, "revealed");
  const revealedCase = await getMystery(secondMystery.id);
  assert.equal(revealedCase.solution.culprit.id, "ada");
  assert.equal(revealedCase.score, null);
});

test("rejects unsupported difficulty levels before calling Gemini", async () => {
  await assert.rejects(createMystery("impossible", "A mystery premise."), { status: 400 });
  assert.equal(fetchCount, 2);
});

test("rejects missing and overlong premises before calling Gemini", async () => {
  await assert.rejects(createMystery("easy", ""), { status: 400 });
  await assert.rejects(createMystery("easy", "x".repeat(501)), { status: 400 });
  assert.equal(fetchCount, 2);
});
