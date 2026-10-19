import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClassification, workersAiClassifier } from '../worker/moderation-ai.ts';
import { moderateLobby } from '../worker/moderation.ts';

test('the classifier reads a JSON verdict even when the model adds words around it', () => {
  assert.deepEqual(parseClassification({ response: 'Sure: {"label":"ok","score":0.92}' }), { label: 'ok', score: 0.92 });
  assert.deepEqual(parseClassification('{"label":"spam","score":0.7}'), { label: 'spam', score: 0.7 });
});

test('malformed or out-of-range output is rejected rather than guessed at', () => {
  assert.throws(() => parseClassification({ response: 'no json here' }), /no JSON/);
  assert.throws(() => parseClassification({ response: '{"label":"maybe","score":0.5}' }), /unknown label/);
  assert.throws(() => parseClassification({ response: '{"label":"ok","score":1.5}' }), /invalid score/);
  assert.throws(() => parseClassification({}), /no text/);
});

test('the Workers AI classifier calls the configured model and feeds the pipeline', async () => {
  const calls: { model: string; input: any }[] = [];
  const ai = { run: async (model: string, input: unknown) => { calls.push({ model, input }); return { response: '{"label":"abuse","score":0.95}' }; } };
  const decision = await moderateLobby('hello', workersAiClassifier(ai, '@cf/test/model'));
  assert.equal(calls[0].model, '@cf/test/model');
  assert.equal(calls[0].input.messages[1].content, 'hello', 'the user text is sent as the user message');
  assert.equal(decision.action, 'block');
});

test('a model that returns garbage holds the message through the pipeline', async () => {
  const ai = { run: async () => ({ response: 'I cannot help with that' }) };
  const decision = await moderateLobby('hello', workersAiClassifier(ai, '@cf/test/model'));
  assert.equal(decision.action, 'hold');
});
