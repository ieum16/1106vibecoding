import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SOURCE_INFO, collectSource, extractiveSummary, selectArticles, summarizeBatch, summaryKey } from './news.mjs';

export function createStore({ directory, env = process.env, collector = collectSource, summarizer = summarizeBatch } = {}) {
  let state = { articles: [], sources: SOURCE_INFO.map(s => ({ ...s, status: s.id === 'nate' ? 'restricted' : 'idle', message: s.note, lastSuccessAt: null })), lastAttemptAt: null, lastCompletedAt: null };
  let running = false; let phase = ''; let lastStarted = 0; let cacheWarning = '';
  let summaryCache = {};
  const file = directory && join(directory, 'news.json');
  async function load() {
    if (!file) return;
    try {
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (saved.version === 1 && Array.isArray(saved.state?.articles) && Array.isArray(saved.state?.sources)) {
        state = saved.state; summaryCache = saved.summaryCache || {};
      }
    } catch (e) { if (e.code !== 'ENOENT') cacheWarning = '이전 저장 자료를 읽지 못했습니다. 새로고침으로 다시 수집해 주세요.'; }
  }
  function snapshot() {
    return { ...state, refreshing: running, phase, cacheWarning, aiConfigured: Boolean(env.GEMINI_API_KEY), cooldownSeconds: Math.max(0, Math.ceil((20000 - (Date.now() - lastStarted)) / 1000)) };
  }
  async function save() {
    if (!file) return;
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify({ version: 1, state, summaryCache }), { mode: 0o600 });
      await rename(file + '.tmp', file);
      cacheWarning = '';
    } catch { cacheWarning = '현재 결과는 볼 수 있지만 디스크에 저장하지 못했습니다.'; }
  }
  async function refresh() {
    if (running) return false;
    running = true; lastStarted = Date.now(); phase = '뉴스 출처를 확인하고 있습니다';
    state.lastAttemptAt = new Date().toISOString();
    try {
      const old = state.articles;
      const results = await Promise.all(SOURCE_INFO.map(async info => {
        try {
          const data = await collector(info.id, env);
          const hasSuccess = ['ok', 'partial'].includes(data.status);
          const previous = state.sources.find(s => s.id === info.id);
          return { articles: data.articles, source: { ...info, status: data.status, message: data.message, lastSuccessAt: hasSuccess ? new Date().toISOString() : previous?.lastSuccessAt || null } };
        } catch {
          const previous = state.sources.find(s => s.id === info.id);
          return { articles: old.filter(a => a.source === info.id).map(a => ({ ...a, stale: true })), source: { ...info, status: 'error', message: '연결 실패 · 이전 자료가 있으면 유지합니다.', lastSuccessAt: previous?.lastSuccessAt || null } };
        }
      }));
      state.sources = results.map(r => r.source);
      let articles = selectArticles(results.flatMap(r => r.articles));
      const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
      const pending = [];
      articles = articles.map(a => {
        const cached = env.GEMINI_API_KEY && summaryCache[summaryKey(a, model)];
        if (!cached && env.GEMINI_API_KEY && a.description.length >= 40) pending.push(a);
        const fallback = extractiveSummary(a);
        if (env.GEMINI_API_KEY && fallback.summaryStatus === 'needs_ai' && a.description.length < 40) {
          fallback.summaryStatus = 'insufficient'; fallback.summaryMessage = '제공 설명이 짧아 근거 있는 3문장 요약을 보류했습니다.';
        }
        return { ...a, ...(cached || fallback) };
      });
      state.articles = articles;
      for (let i = 0; i < pending.length; i += 6) {
        phase = `한국어 요약을 정리하고 있습니다 (${Math.min(i + 6, pending.length)}/${pending.length})`;
        const batch = pending.slice(i, i + 6);
        try {
          const summaries = await summarizer(batch, env);
          for (const a of batch) {
            const summary = summaries.get(a.id);
            if (summary) summaryCache[summaryKey(a, model)] = summary;
          }
          state.articles = state.articles.map(a => {
            const summary = summaries.get(a.id);
            if (summary) return { ...a, ...summary };
            if (batch.some(b => b.id === a.id) && a.summaryStatus !== 'extractive') return { ...a, summaryStatus: 'insufficient', summaryMessage: '제공 설명으로 유효한 한국어 3문장 요약을 만들지 못했습니다.' };
            return a;
          });
        } catch {
          state.articles = state.articles.map(a => pending.slice(i).some(b => b.id === a.id) ? { ...a, summaryMessage: a.summaryStatus === 'extractive' ? 'AI 연결 실패 · 제공 설명에서 발췌한 3문장입니다.' : 'AI 연결 실패 · 한국어 요약을 제공하지 못했습니다.' } : a);
          // Stop further paid calls after an API failure; keep collected headlines usable.
          break;
        }
      }
      // Keep only summaries for this collection to bound disk usage.
      const keys = new Set(articles.map(a => summaryKey(a, model)));
      summaryCache = Object.fromEntries(Object.entries(summaryCache).filter(([k]) => keys.has(k)));
      state.lastCompletedAt = new Date().toISOString();
      await save();
    } finally { running = false; phase = ''; }
    return true;
  }
  return { load, snapshot, refresh };
}
