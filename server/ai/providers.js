// AI provider adapters. Each returns { json, text, usage, model, latencyMs }.
// API keys are read from the server environment only.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { RESPONSE_SCHEMA } from '../agents/definitions.js';
import { demoRespond } from './demo.js';

export function extractJson(text) {
  if (!text) throw new Error('Empty model response');
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error('Model did not return JSON');
}

// ---------- Anthropic (Claude) ----------
let anthropic;
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

async function callAnthropic({ system, prompt, model, effort }) {
  anthropic ||= new Anthropic();
  const base = {
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  const full = {
    ...base,
    output_config: {
      ...(/haiku-4|-3-/.test(model) ? {} : { effort: effort || config.anthropicEffort }),
      format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
    },
    // Server-side refusal fallback (routes by refusal category).
    ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  };
  let res;
  try {
    res = await anthropic.beta.messages.create(full);
  } catch (err) {
    // Older/other models may not accept structured output or fallbacks: retry plain.
    if (err instanceof Anthropic.BadRequestError) res = await anthropic.beta.messages.create(base);
    else throw err;
  }
  if (res.stop_reason === 'refusal') {
    throw new Error(`Model declined this request${res.stop_details?.category ? ` (${res.stop_details.category})` : ''}`);
  }
  if (res.stop_reason === 'max_tokens') console.warn('[anthropic] response hit max_tokens');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return {
    text, json: extractJson(text), model: res.model,
    usage: { in: res.usage?.input_tokens || 0, out: res.usage?.output_tokens || 0 },
  };
}

// ---------- OpenAI / OpenAI-compatible ----------
async function callOpenAI({ system, prompt, model }) {
  const res = await fetch(`${config.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { text, json: extractJson(text), model: data.model || model, usage: { in: data.usage?.prompt_tokens || 0, out: data.usage?.completion_tokens || 0 } };
}

// ---------- Google Gemini ----------
async function callGemini({ system, prompt, model }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return { text, json: extractJson(text), model, usage: { in: data.usageMetadata?.promptTokenCount || 0, out: data.usageMetadata?.candidatesTokenCount || 0 } };
}

export function modelFor(agentId, override) {
  if (override) return override;
  if (config.agentModels[agentId]) return config.agentModels[agentId];
  return config.models[config.provider] || 'demo';
}

/**
 * Run one inference for an agent.
 * @param {{agentId:string, system:string, prompt:string, model?:string, effort?:string, context:object}} req
 */
export async function generate(req) {
  const started = Date.now();
  const model = modelFor(req.agentId, req.model);
  let out;
  switch (config.provider) {
    case 'anthropic': out = await callAnthropic({ ...req, model }); break;
    case 'openai': out = await callOpenAI({ ...req, model }); break;
    case 'gemini': out = await callGemini({ ...req, model }); break;
    default: out = await demoRespond(req); break;
  }
  return { ...out, latencyMs: Date.now() - started };
}
