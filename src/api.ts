/**
 * Простая обёртка для взаимодействия с CGI через GET/POST.
 * Предполагаем, что на сервере есть CGI-скрипты по адресу /cgi-bin/...
 * Рекомендация по соглашению:
 *   GET  /cgi-bin/<section>/info        — получить текущую конфигурацию раздела
 *   POST /cgi-bin/<section>/apply       — применить/сохранить конфигурацию (form-urlencoded)
 * Ответы желательно в JSON (Content-Type: application/json),
 * а при ошибках — статус 4xx/5xx и JSON с полем message.
 */

export type Dict = Record<string, string | number | boolean | null | undefined>;

// Определяем базовый путь до CGI. Можно переопределить глобально через window.CGI_BASE
function detectBase(): string {
  try {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { CGI_BASE?: unknown; __CGI_BASE__?: unknown };
      if (typeof w.CGI_BASE === 'string' && w.CGI_BASE) return w.CGI_BASE;
      if (typeof w.__CGI_BASE__ === 'string' && w.__CGI_BASE__) return w.__CGI_BASE__;
    }
  } catch {}
  return '/cgi-bin';
}

export function isOffline(): boolean {
  // Если страница открыта как file:// или нет сети — считаем оффлайн-режимом.
  return typeof window !== 'undefined' && (window.location.protocol === 'file:' || !navigator.onLine);
}

function buildQuery(params?: Dict): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    usp.set(k, String(v));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!ms) return promise;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await promise;
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

export type ApiOptions = {
  baseUrl?: string;      // База для CGI. По умолчанию /cgi-bin
  timeoutMs?: number;    // Таймаут запросов
};

class ApiClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(opts?: ApiOptions) {
    this.baseUrl = opts?.baseUrl ?? detectBase();
    this.timeoutMs = opts?.timeoutMs ?? 8000;
  }

  async get<T = unknown>(path: string, params?: Dict): Promise<T> {
    if (isOffline()) {
      // В оффлайн-режиме не ходим в сеть — пусть UI решит, что показывать.
      return Promise.reject(new Error('offline'));
    }
    const url = joinUrl(this.baseUrl, `${path}${buildQuery(params)}`);
    const req = fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
      },
      credentials: 'same-origin',
    }).then(async (r) => {
      if (!r.ok) {
        const ct = r.headers.get('content-type') || '';
        let details = '';
        if (ct.includes('application/json')) {
          try {
            const j = await r.json();
            if (j && typeof j === 'object' && 'message' in j && typeof (j as any).message === 'string') {
              details = (j as any).message;
            } else {
              details = JSON.stringify(j);
            }
          } catch {}
        } else {
          const text = await r.text().catch(() => '');
          const m = /<title>(.*?)<\/title>/i.exec(text);
          details = m ? m[1] : '';
        }
        const msg = [`HTTP ${r.status}${r.statusText ? ' ' + r.statusText : ''}`, details ? `— ${details}` : '', `at ${url}`]
          .filter(Boolean)
          .join(' ');
        throw new Error(msg);
      }
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('application/json')) return r.json() as Promise<T>;
      // Если пришёл не JSON — вернём текст.
      return (r.text() as unknown) as T;
    });
    return withTimeout(req, this.timeoutMs);
  }

  async postForm<T = unknown>(path: string, data: Dict): Promise<T> {
    if (isOffline()) {
      return Promise.reject(new Error('offline'));
    }
    const url = joinUrl(this.baseUrl, path);
    const body = new URLSearchParams();
    Object.entries(data).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      body.set(k, String(v));
    });
    const req = fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/plain, */*',
      },
      body,
    }).then(async (r) => {
      if (!r.ok) {
        const ct = r.headers.get('content-type') || '';
        let details = '';
        if (ct.includes('application/json')) {
          try {
            const j = await r.json();
            if (j && typeof j === 'object' && 'message' in j && typeof (j as any).message === 'string') {
              details = (j as any).message;
            } else {
              details = JSON.stringify(j);
            }
          } catch {}
        } else {
          const text = await r.text().catch(() => '');
          const m = /<title>(.*?)<\/title>/i.exec(text);
          details = m ? m[1] : '';
        }
        const msg = [`HTTP ${r.status}${r.statusText ? ' ' + r.statusText : ''}`, details ? `— ${details}` : '', `at ${url}`]
          .filter(Boolean)
          .join(' ');
        throw new Error(msg);
      }
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('application/json')) return r.json() as Promise<T>;
      return (r.text() as unknown) as T;
    });
    return withTimeout(req, this.timeoutMs);
  }
}

export const API = new ApiClient();
