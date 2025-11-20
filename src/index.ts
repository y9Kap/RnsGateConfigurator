import { API, isOffline } from './api';

// -----------------------------
// Настройки режимов автозаполнения
// -----------------------------
type AutoFillMode = 'hints' | 'fill';
const AF_MODE_KEY = 'autofillMode';

function getAutoFillMode(): AutoFillMode {
  try {
    const v = localStorage.getItem(AF_MODE_KEY);
    return (v === 'fill' ? 'fill' : 'hints');
  } catch {
    return 'hints';
  }
}

function setAutoFillMode(mode: AutoFillMode) {
  try { localStorage.setItem(AF_MODE_KEY, mode); } catch {}
}

function toggleAutoFillMode(): AutoFillMode {
  const next: AutoFillMode = getAutoFillMode() === 'hints' ? 'fill' : 'hints';
  setAutoFillMode(next);
  return next;
}

function updateAutoFillToggleUI() {
  const btn = document.getElementById('autofill-toggle') as HTMLButtonElement | null;
  if (!btn) return;
  const mode = getAutoFillMode();
  btn.textContent = `Автозаполнение: ${mode === 'hints' ? 'Подсказки' : 'Полное'}`;
  btn.setAttribute('aria-pressed', String(mode === 'fill'));
  btn.title = mode === 'hints'
    ? 'Подсказки в полях ввода (datalist)'
    : 'Автоматически подставлять сохранённые значения';
}

// Сохранение/загрузка локальных профилей для форм
const WIFI_PROFILE_KEY = 'profile_wifi';
const ETH_PROFILE_KEY = 'profile_ethernet';

function saveLocalProfile(kind: 'wifi' | 'ethernet', data: any) {
  try {
    const key = kind === 'wifi' ? WIFI_PROFILE_KEY : ETH_PROFILE_KEY;
    localStorage.setItem(key, JSON.stringify(data || {}));
  } catch {}
}

function loadLocalProfile<T = any>(kind: 'wifi' | 'ethernet'): T | undefined {
  try {
    const key = kind === 'wifi' ? WIFI_PROFILE_KEY : ETH_PROFILE_KEY;
    const s = localStorage.getItem(key);
    if (!s) return undefined;
    const data = JSON.parse(s);
    if (data && typeof data === 'object') return data as T;
  } catch {}
  return undefined;
}

type Section = {
  id: string;
  title: string;
};

const sections: Section[] = [
  { id: 'rnsd', title: 'RNSD' },
  { id: 'freedv', title: 'FreeDV' },
  { id: 'wifi', title: 'WiFi' },
  { id: 'ethernet', title: 'Ethernet' },
];

function initUI() {
  const app = document.getElementById('app');
  if (!app) return;

  // Create shell
  const shell = document.createElement('div');
  shell.className = 'app-shell';

  // Sidebar
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';

  const logo = document.createElement('div');
  logo.className = 'logo';
  logo.textContent = 'RNS Gate — Configurator';
  sidebar.appendChild(logo);

  const nav = document.createElement('nav');
  nav.className = 'menu';
  sections.forEach((s, idx) => {
    const btn = document.createElement('button');
    btn.className = 'menu-item' + (idx === 0 ? ' active' : '');
    btn.textContent = s.title;
    btn.setAttribute('data-id', s.id);
    btn.addEventListener('click', () => selectSection(s.id));
    nav.appendChild(btn);
  });
  sidebar.appendChild(nav);

  // Content
  const content = document.createElement('main');
  content.className = 'content';

  const header = document.createElement('header');
  header.className = 'content-header';
  const h1 = document.createElement('h1');
  h1.id = 'section-title';
  header.appendChild(h1);
  // Центрированное текстовое сообщение топ-бара
  const topMsg = document.createElement('div');
  topMsg.id = 'top-message';
  topMsg.className = 'top-message';
  header.appendChild(topMsg);
  const status = document.createElement('div');
  status.id = 'net-status';
  status.className = 'status';
  // Кнопка «Заполнить актуальные данные» — подтягивает текущие значения с устройства
  const fillBtn = document.createElement('button');
  fillBtn.id = 'fill-current-btn';
  fillBtn.className = 'btn';
  fillBtn.type = 'button';
  fillBtn.textContent = 'Заполнить актуальные данные';
  fillBtn.title = 'Запросить и подставить актуальные значения текущего раздела';
  fillBtn.addEventListener('click', async () => {
    if (!currentSectionId) return;
    try {
      // Жёстко фиксируем текущие ширину/высоту на время запроса,
      // чтобы исключить даже субпиксельные скачки при смене :disabled
      const rect = fillBtn.getBoundingClientRect();
      if (rect.width && rect.height) {
        fillBtn.style.width = `${Math.round(rect.width)}px`;
        fillBtn.style.height = `${Math.round(rect.height)}px`;
      }
      fillBtn.disabled = true;
      await refreshCurrentSectionData();
    } finally {
      fillBtn.disabled = false;
      // Снимаем фиксацию размеров
      fillBtn.style.width = '';
      fillBtn.style.height = '';
    }
  });
  header.appendChild(fillBtn);
  // Стабилизируем ширину: учитываем и обычный, и «занятый» текст
  stabilizeActionButton(fillBtn, 'Обновление...');

  // Кнопка локальной очистки полей текущей формы
  const resetBtn = document.createElement('button');
  resetBtn.id = 'reset-fields-btn';
  resetBtn.className = 'btn';
  resetBtn.type = 'button';
  resetBtn.textContent = 'Очистить поля';
  resetBtn.title = 'Очистить значения текущей формы (локально)';
  resetBtn.addEventListener('click', () => {
    clearCurrentFormFields();
  });
  header.appendChild(resetBtn);
  // Статус помещаем в конец, чтобы его ширина не сдвигала кнопки
  header.appendChild(status);
  content.appendChild(header);

  const body = document.createElement('section');
  body.className = 'content-body';
  body.id = 'content-body';
  content.appendChild(body);

  shell.appendChild(sidebar);
  shell.appendChild(content);
  app.innerHTML = '';
  app.appendChild(shell);

  // Default selection
  selectSection(sections[0].id);
}

let currentSectionId: string = sections[0].id;

function selectSection(id: string) {
  // Update active state in menu
  document.querySelectorAll('.menu-item').forEach((el) => {
    if (!(el instanceof HTMLButtonElement)) return;
    el.classList.toggle('active', el.getAttribute('data-id') === id);
  });

  // Update right panel content
  const section = sections.find((s) => s.id === id) ?? sections[0];
  const titleEl = document.getElementById('section-title');
  const bodyEl = document.getElementById('content-body');
  if (titleEl) titleEl.textContent = section.title;
  if (bodyEl) {
    // Зафиксируем текущую высоту, чтобы исключить дёрганья при смене контента
    const currentH = (bodyEl as HTMLElement).offsetHeight;
    (bodyEl as HTMLElement).style.minHeight = currentH ? `${currentH}px` : '';
    (bodyEl as HTMLElement).classList.add('switching');
    (bodyEl as HTMLElement).scrollTop = 0;
    // Не показываем лишнее служебное сообщение в теле раздела, чтобы не дёргался контент
    // Оставляем предыдущий контент до прихода новых данных, индикатор показывается в статус-баре
  }
  currentSectionId = id;
  updateStatusBar();
  // Пробуем загрузить текущие данные раздела через CGI (GET /cgi-bin/<id>/info)
  loadSectionData(section.id)
    .catch(() => {
      // Ошибка уже отражена в статус-баре, показываем заглушку
      if (bodyEl) {
        bodyEl.textContent = `Раздел «${section.title}» — здесь позже появятся настройки.`;
      }
    })
    .finally(() => {
      // Снимаем фиксацию высоты и эффект переключения
      if (bodyEl) {
        (bodyEl as HTMLElement).classList.remove('switching');
        (bodyEl as HTMLElement).style.minHeight = '';
      }
    });
}

async function loadSectionData(id: string) {
  const bodyEl = document.getElementById('content-body');
  try {
    // Показать индикатор выполнения на время запроса
    setStatus('busy', '');
    const data = await API.get(`/${id}/info`);
    if (bodyEl) {
      // Специализированные формы для WiFi/Ethernet/FreeDV, остальные — сырые данные
      if (id === 'wifi') {
        renderWifiForm(parseInfoForSection(id, data) as any);
      } else if (id === 'ethernet') {
        renderEthernetForm(parseInfoForSection(id, data) as any);
      } else if (id === 'freedv') {
        renderFreeDVForm(parseInfoForSection(id, data) as any);
      } else if (id === 'rnsd') {
        renderRnsdConfig(data);
      } else {
        const pre = document.createElement('pre');
        pre.className = 'code';
        pre.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        bodyEl.innerHTML = '';
        bodyEl.appendChild(pre);
      }
    }
    // Показываем только иконку «онлайн», без текста
    setStatus('ok', '');
  } catch (e: any) {
    // В оффлайн-режиме или ошибке сети — формы для wifi/ethernet рендерим с дефолтами,
    // для прочих разделов оставляем прежнее поведение (ошибка и заглушка сверху).
    if (id === 'wifi') {
      if (bodyEl) renderWifiForm(undefined);
      if (isOffline()) setStatus('offline', 'Оффлайн режим: CGI недоступны');
      else setStatus('error', `Ошибка загрузки: ${e?.message || e}`);
      return; // не пробрасываем, чтобы не перетёрлось содержимое
    } else if (id === 'ethernet') {
      if (bodyEl) renderEthernetForm(undefined);
      if (isOffline()) setStatus('offline', 'Оффлайн режим: CGI недоступны');
      else setStatus('error', `Ошибка загрузки: ${e?.message || e}`);
      return;
    } else if (id === 'freedv') {
      if (bodyEl) renderFreeDVForm(undefined);
      if (isOffline()) setStatus('offline', 'Оффлайн режим: CGI недоступны');
      else setStatus('error', `Ошибка загрузки: ${e?.message || e}`);
      return;
    } else if (id === 'rnsd') {
      if (bodyEl) renderRnsdConfig(undefined);
      if (isOffline()) setStatus('offline', 'Оффлайн режим: CGI недоступны');
      else setStatus('error', `Ошибка загрузки: ${e?.message || e}`);
      return;
    } else {
      if (isOffline()) {
        setStatus('offline', 'Оффлайн режим: CGI недоступны');
      } else {
        setStatus('error', `Ошибка загрузки: ${e?.message || e}`);
      }
      throw e;
    }
  }
}

function updateStatusBar() {
  if (isOffline()) setStatus('offline', 'Оффлайн режим: CGI недоступны');
  else setStatus('ok', '');
}

// --- Искуственная задержка переключения цветов индикатора ---
type StatusKind = '' | 'ok' | 'offline' | 'error' | 'busy';
const STATUS_COLOR_MIN_INTERVAL = 500; // мс между сменами цвета
let lastIndicatorSwitch = 0; // момент последнего применения класса
let indicatorTimer: number | null = null; // таймер отложенного применения
let indicatorPending: { kind: StatusKind; text: string } | null = null; // последняя запрошенная

function applyIndicator(kind: StatusKind, text: string) {
  const el = document.getElementById('net-status');
  if (!el) return;
  const hasText = typeof text === 'string' && text.trim().length > 0;
  el.className = `status${kind ? ' ' + kind : ''}`;
  // Текст в самом индикаторе не показываем — только цвет/tooltip
  el.textContent = '';
  // Tooltip у индикатора
  if (kind === 'ok') {
    el.setAttribute('title', 'Онлайн');
  } else if (kind === 'offline') {
    el.setAttribute('title', hasText ? text.trim() : 'Оффлайн');
  } else if (kind === 'error') {
    el.setAttribute('title', hasText ? text.trim() : 'Ошибка');
  } else if (kind === 'busy') {
    el.setAttribute('title', hasText ? text.trim() : 'Выполняется запрос…');
  } else {
    el.removeAttribute('title');
  }
  lastIndicatorSwitch = Date.now();
}

function scheduleIndicator(kind: StatusKind, text: string) {
  indicatorPending = { kind, text };
  const now = Date.now();
  const elapsed = now - lastIndicatorSwitch;
  const delay = elapsed >= STATUS_COLOR_MIN_INTERVAL ? 0 : (STATUS_COLOR_MIN_INTERVAL - elapsed);

  if (indicatorTimer !== null) {
    // Перепланируем — применим самое свежее состояние в нужный момент
    clearTimeout(indicatorTimer);
    indicatorTimer = null;
  }

  if (delay === 0) {
    const p = indicatorPending;
    if (p) applyIndicator(p.kind, p.text);
  } else {
    indicatorTimer = window.setTimeout(() => {
      indicatorTimer = null;
      const p = indicatorPending;
      if (p) applyIndicator(p.kind, p.text);
    }, delay);
  }
}

function setStatus(kind: StatusKind, text: string) {
  const msg = document.getElementById('top-message');
  const hasText = typeof text === 'string' && text.trim().length > 0;

  // Центрированное сообщение в топ-баре — обновляем сразу, без задержек
  if (msg) {
    msg.textContent = '';
    msg.classList.remove('ok', 'error');
    if (kind === 'ok' && hasText) {
      msg.textContent = text.trim();
      msg.classList.add('ok');
    } else if (kind === 'error') {
      msg.textContent = hasText ? text.trim() : 'Ошибка';
      msg.classList.add('error');
    }
  }

  // Визуальный индикатор состояния — меняем цвет с искусственной задержкой
  scheduleIndicator(kind, text);
}

// Init after DOM ready (supports file:// open)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI);
} else {
  initUI();
}

// -----------------------------
// Разделы: WiFi, Ethernet — формы
// -----------------------------

type WifiInfo = {
  mode?: 'client' | 'ap' | string;
  ssid?: string;
  password?: string;
  ip_config?: 'dhcp' | 'static' | string;
  ip?: string;
  netmask?: string;
  gateway?: string;
  dns1?: string;
  dns2?: string;
};

type EthernetInfo = {
  ip_config?: 'dhcp' | 'static' | string;
  ip?: string;
  netmask?: string;
  gateway?: string;
  dns1?: string;
  dns2?: string;
};

// ----- FreeDV -----
type FreeDVInfo = {
  mode?: 'FSK2' | 'FSK4' | string;
  rate?: string | number; // 500, 200, 100, 50, 20
  ldpc?: '768/256' | '512/256' | string;
};

// Секция LoraSPI удалена — связанные типы и поля больше не используются

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

// Стабилизация кнопок действий: выставляет минимальную ширину так,
// чтобы она вмещала как обычную надпись, так и «занятую» (например, «Сохранение…»)
function stabilizeActionButton(btn: HTMLButtonElement, busyText: string) {
  try {
    const original = btn.textContent ?? '';
    // Ширина с обычной надписью
    const w1 = btn.offsetWidth;
    // Временно подменим текст и измерим ещё раз
    btn.textContent = busyText;
    // Принудительный рефлоу
    const w2 = btn.offsetWidth;
    // Вернём исходный текст
    btn.textContent = original;
    const minW = Math.max(w1, w2);
    if (minW) btn.style.minWidth = `${minW}px`;
  } catch {}
}

// Обновить данные текущего раздела без визуального «переключения» раздела,
// чтобы UI не дёргался: без затухания, без временных заглушек и без сброса скролла.
async function refreshCurrentSectionData() {
  if (!currentSectionId) return;
  const bodyEl = document.getElementById('content-body') as HTMLElement | null;
  // Зафиксируем текущую высоту и положение скролла, чтобы избежать скачков
  const prevHeight = bodyEl ? bodyEl.offsetHeight : 0;
  const prevScroll = bodyEl ? bodyEl.scrollTop : 0;
  if (bodyEl && prevHeight) {
    bodyEl.style.minHeight = `${prevHeight}px`;
  }
  try {
    await loadSectionData(currentSectionId);
  } catch {
    // Ошибка уже отражена в статус-баре внутри loadSectionData.
    // Контент раздела сохраняем как есть, чтобы не было дёрганья.
  } finally {
    if (bodyEl) {
      // Восстановим высоту и скролл после перерисовки
      bodyEl.style.minHeight = '';
      bodyEl.scrollTop = prevScroll;
    }
  }
}

// Локальная очистка полей текущей формы (без запросов к бэкенду)
function clearCurrentFormFields() {
  const clear = (id: string) => {
    const el = document.getElementById(id);
    if (el && el instanceof HTMLInputElement) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  if (currentSectionId === 'wifi') {
    ['wifi-ssid', 'wifi-pass', 'wifi-ip', 'wifi-mask', 'wifi-gw', 'wifi-dns1', 'wifi-dns2']
      .forEach(clear);
    return;
  }
  if (currentSectionId === 'ethernet') {
    ['eth-ip', 'eth-mask', 'eth-gw', 'eth-dns1', 'eth-dns2']
      .forEach(clear);
    return;
  }
  if (currentSectionId === 'freedv') {
    ['freedv-mode', 'freedv-rate', 'freedv-ldpc']
      .forEach(clear);
    return;
  }
  // Для прочих разделов — ничего не делаем
}

function uniq(values: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = (v ?? '').trim();
    if (!s) continue;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function attachDatalist(input: HTMLInputElement, options: string[], idSuffix: string) {
  const listId = `${input.id}-list-${idSuffix}`;
  let dl = document.getElementById(listId) as HTMLDataListElement | null;
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = listId;
    document.body.appendChild(dl);
  }
  dl.innerHTML = '';
  options.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    dl!.appendChild(opt);
  });
  input.setAttribute('list', listId);
}

function isValidIp(v?: string): boolean {
  if (!v) return false;
  // простая проверка IPv4
  const m = v.trim().match(/^([0-9]{1,3}\.){3}[0-9]{1,3}$/);
  if (!m) return false;
  return v.split('.').every((n) => {
    const x = Number(n);
    return x >= 0 && x <= 255 && String(x) === n.replace(/^0+(?=\d)/, (s) => (n === '0' ? '0' : s));
  });
}

// Утилиты отображения «текущего состояния» для интерфейсов
const SENSITIVE_RE = /(pass|password|secret|key|token)/i;

function redactForDisplay(data: any): any {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map((v) => redactForDisplay(v));
  if (typeof data === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (SENSITIVE_RE.test(k)) {
        out[k] = '••••••';
      } else {
        out[k] = redactForDisplay(v);
      }
    }
    return out;
  }
  return data;
}

function createInfoSection(title: string, info?: Record<string, any>): HTMLElement {
  const section = document.createElement('div');
  section.className = 'form-section';
  const h = document.createElement('div');
  h.className = 'form-title';
  h.textContent = title;
  section.appendChild(h);
  const content = document.createElement('div');
  if (info && typeof info === 'object') {
    const pre = document.createElement('pre');
    pre.className = 'code';
    try {
      pre.textContent = JSON.stringify(redactForDisplay(info), null, 2);
    } catch {
      pre.textContent = String(info);
    }
    content.appendChild(pre);
  } else {
    const p = document.createElement('div');
    p.textContent = 'Нет данных о текущем состоянии.';
    content.appendChild(p);
  }
  section.appendChild(content);
  return section;
}

// Универсальный парсер ответа /<id>/info: поддерживает JSON и key=value
function parseInfoForSection(
  id: string,
  data: unknown,
): Partial<WifiInfo> | Partial<EthernetInfo> | Partial<FreeDVInfo> | undefined {
  // 1) Уже объект — используем как есть
  let obj: any = (data && typeof data === 'object') ? data : undefined;
  // 2) Попытаться распарсить строку
  if (!obj && typeof data === 'string') {
    const s = data.trim();
    // Сначала пробуем как JSON
    try {
      const j = JSON.parse(s);
      if (j && typeof j === 'object') obj = j;
    } catch {}
    // Если не JSON — парсим как набор пар key=value
    if (!obj) obj = parseKeyValueString(s);
  }
  // 3) Если ответ приходит в «конверте» { section, data, updatedAt }, развернём data
  if (obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, 'data')) {
    let inner: any = (obj as any).data;
    if (typeof inner === 'string') {
      const s = inner.trim();
      try {
        const j = JSON.parse(s);
        if (j && typeof j === 'object') inner = j;
      } catch {}
      if (typeof inner === 'string') {
        // попробовать как key=value
        inner = parseKeyValueString(inner);
      }
    }
    if (inner && typeof inner === 'object') {
      obj = inner;
    } else {
      // если data пустая/некорректная — дальше не продолжаем
      return undefined;
    }
  }
  if (!obj || typeof obj !== 'object') return undefined;

  const norm = normalizeKeys(obj);
  if (id === 'wifi') {
    const out: Partial<WifiInfo> = {};
    if ('mode' in norm) out.mode = String(norm.mode) as any;
    if ('ssid' in norm) out.ssid = toStr(norm.ssid);
    if ('password' in norm) out.password = toStr(norm.password);
    if ('ip_config' in norm) out.ip_config = normalizeIpConfig(norm.ip_config);
    if ('ip' in norm) out.ip = toStr(norm.ip);
    if ('netmask' in norm) out.netmask = toStr(norm.netmask);
    if ('gateway' in norm) out.gateway = toStr(norm.gateway);
    if ('dns1' in norm) out.dns1 = toStr(norm.dns1);
    if ('dns2' in norm) out.dns2 = toStr(norm.dns2);
    return out;
  } else if (id === 'ethernet') {
    const out: Partial<EthernetInfo> = {};
    if ('ip_config' in norm) out.ip_config = normalizeIpConfig(norm.ip_config);
    if ('ip' in norm) out.ip = toStr(norm.ip);
    if ('netmask' in norm) out.netmask = toStr(norm.netmask);
    if ('gateway' in norm) out.gateway = toStr(norm.gateway);
    if ('dns1' in norm) out.dns1 = toStr(norm.dns1);
    if ('dns2' in norm) out.dns2 = toStr(norm.dns2);
    return out;
  } else if (id === 'freedv') {
    const out: Partial<FreeDVInfo> = {};
    if ('mode' in norm) out.mode = String(norm.mode).toUpperCase() as any;
    if ('rate' in norm) out.rate = toStr(norm.rate);
    if ('ldpc' in norm) out.ldpc = toStr(norm.ldpc);
    return out;
  }
  return undefined;
}

function toStr(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeIpConfig(v: any): 'dhcp' | 'static' | string {
  const s = toStr(v).toLowerCase();
  if (s === 'dhcp' || s === 'auto' || s === 'automatic') return 'dhcp';
  if (s === 'static' || s === 'manual' || s === 'fixed') return 'static';
  return (s as any) || 'dhcp';
}

function parseKeyValueString(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  for (let raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) continue;
    let key = '';
    let val = '';
    const eqIdx = line.indexOf('=');
    const colonIdx = line.indexOf(':');
    let idx = -1;
    if (eqIdx >= 0 && (colonIdx < 0 || eqIdx < colonIdx)) idx = eqIdx; else if (colonIdx >= 0) idx = colonIdx;
    if (idx < 0) continue;
    key = line.slice(0, idx).trim();
    val = line.slice(idx + 1).trim();
    // Убираем кавычки вокруг значения
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

// --- RNSD: просмотр текущей конфигурации ---
function unwrapDataPayload(input: unknown): unknown {
  // Разворачиваем возможный конверт { data, ... } или { config } / { content }
  if (input && typeof input === 'object') {
    const obj: any = input as any;
    if (Object.prototype.hasOwnProperty.call(obj, 'data')) return obj.data;
    if (Object.prototype.hasOwnProperty.call(obj, 'config')) return obj.config;
    if (Object.prototype.hasOwnProperty.call(obj, 'content')) return obj.content;
  }
  return input;
}

function renderRnsdConfig(data: unknown | undefined) {
  const bodyEl = document.getElementById('content-body');
  if (!bodyEl) return;
  bodyEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'form';

  // Вспомогательная функция: попытаться структурировать вход на RNSD и SPI
  const splitPayload = (input: unknown): { raw: unknown; rnsd: any; spi: any } => {
    const raw = unwrapDataPayload(input);
    let obj: any | undefined;
    // Нормализуем в объект, если возможно
    if (raw && typeof raw === 'object') {
      obj = raw as any;
    } else if (typeof raw === 'string') {
      const s = raw.trim();
      // Попробовать JSON
      try {
        const j = JSON.parse(s);
        if (j && typeof j === 'object') obj = j;
      } catch {}
      // Попробовать key=value
      if (!obj && s) obj = parseKeyValueString(s);
    }

    // Если объект не получился — вернём как есть в RNSD
    if (!obj || typeof obj !== 'object') {
      return { raw, rnsd: raw, spi: undefined };
    }

    const isSpiKey = (k: string) => {
      const kk = String(k).toLowerCase();
      // Эвристика: любые ключи, содержащие 'spi', а также распространённые поля шин
      if (kk.includes('spi')) return true;
      // Типичные GPIO/контрольные линии для радиомодемов
      if (kk.startsWith('gpio')) return true; // gpio_irq_port, gpio_busy_pin, gpio_tx_en_*
      if (kk.includes('irq') || kk.includes('busy') || kk.includes('nrst') || kk.includes('reset') || kk.includes('tx_en') || kk.includes('rx_en') || kk.includes('txen') || kk.includes('rxen')) return true;
      const known = ['miso', 'mosi', 'sck', 'clk', 'cs', 'chipselect', 'baud', 'speed', 'mode'];
      // если ключ оформлен как spi_* он уже пойман, иначе проверим составные вида spi.mode (уже поймано),
      // здесь поддержим случаи когда секция может быть вынесена в под-объект obj.spi
      return known.includes(kk) || kk.startsWith('spi.');
    };

    // Если внутри есть под-объект spi — берём его целиком
    let spi: any = undefined;
    if (Object.prototype.hasOwnProperty.call(obj, 'spi')) {
      const v = (obj as any).spi;
      if (v && typeof v === 'object') spi = v; else spi = v;
    }

    // Остальное распределим по эвристике
    const rnsd: Record<string, any> = {};
    const extraSpi: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'spi') continue;
      if (isSpiKey(k)) extraSpi[k] = v; else rnsd[k] = v;
    }
    // Объединить spi из поля и собранные по ключам
    if (spi && typeof spi === 'object' && Object.keys(extraSpi).length > 0) {
      spi = { ...spi, ...extraSpi };
    } else if (!spi && Object.keys(extraSpi).length > 0) {
      spi = extraSpi;
    }

    return { raw, rnsd, spi };
  };

  const parts = splitPayload(data);

  // Секция RNSD
  const rnsdBox = document.createElement('section');
  rnsdBox.className = 'form-section';
  const rnsdTitle = document.createElement('div');
  rnsdTitle.className = 'form-title';
  rnsdTitle.textContent = 'RNSD';
  rnsdBox.appendChild(rnsdTitle);
  const rnsdPre = document.createElement('pre');
  rnsdPre.className = 'code';
  if (parts.rnsd === undefined || parts.rnsd === null || (typeof parts.rnsd === 'object' && Object.keys(parts.rnsd).length === 0)) {
    // Если не удалось выделить RNSD и есть «сырой» контент строкой — покажем его здесь
    if (typeof parts.raw === 'string') rnsdPre.textContent = String(parts.raw);
    else if (parts.raw && typeof parts.raw === 'object') {
      try { rnsdPre.textContent = JSON.stringify(parts.raw, null, 2); } catch { rnsdPre.textContent = String(parts.raw); }
    } else {
      rnsdPre.textContent = 'Нет данных о RNSD.';
    }
  } else if (typeof parts.rnsd === 'string') {
    rnsdPre.textContent = parts.rnsd;
  } else if (typeof parts.rnsd === 'object') {
    try { rnsdPre.textContent = JSON.stringify(parts.rnsd, null, 2); } catch { rnsdPre.textContent = String(parts.rnsd); }
  } else {
    rnsdPre.textContent = String(parts.rnsd);
  }
  rnsdBox.appendChild(rnsdPre);

  // Секция SPI
  const spiBox = document.createElement('section');
  spiBox.className = 'form-section';
  const spiTitle = document.createElement('div');
  spiTitle.className = 'form-title';
  spiTitle.textContent = 'SPI';
  spiBox.appendChild(spiTitle);
  // Форма настроек SPI/GPIO: переход на libgpiod и dev-путь SPI
  const getStr = (v: any): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'string') {
      const s = v.trim();
      return s ? s : undefined;
    }
    if (typeof v === 'number') {
      return Number.isFinite(v) ? String(Math.trunc(v)) : undefined;
    }
    return undefined;
  };
  // Поддержим разные варианты структуры из бэкенда
  const spiSrc: any = parts.spi && typeof parts.spi === 'object' ? parts.spi : {};

  const buildSpiDevice = (): string | undefined => {
    let dev = getStr(spiSrc.spi_device ?? spiSrc.device ?? spiSrc.dev ?? spiSrc.path ?? spiSrc.spi?.device ?? spiSrc.spi?.dev);
    if (!dev) {
      const portStr = getStr(spiSrc.spi_port ?? spiSrc.port ?? spiSrc.spi?.port);
      const csStr = getStr(spiSrc.spi_cs ?? spiSrc.cs ?? spiSrc.chipselect ?? spiSrc.spi?.cs);
      if (portStr !== undefined && csStr !== undefined) {
        const p = String(portStr).replace(/\D+/g, '');
        const c = String(csStr).replace(/\D+/g, '');
        if (p !== '' && c !== '') dev = `/dev/spi${p}.${c}`;
      }
    }
    if (dev) {
      // нормализуем варианты spi0.0 без префикса
      const m = /^(?:\/dev\/)?(spi\d+\.\d+)$/.exec(dev);
      if (m) dev = `/dev/${m[1]}`;
    }
    return dev;
  };

  const normChip = (v: any): string | undefined => {
    let s = getStr(v);
    if (!s) return undefined;
    s = s.trim();
    // если пришло просто число — считаем, что это индекс gpiochipN
    if (/^\d+$/.test(s)) return `gpiochip${s}`;
    // если пришло /dev/gpiochipN — допустим, но приведём к gpiochipN
    const m = /^(?:\/dev\/)?(gpiochip\d+)$/.exec(s);
    if (m) return m[1];
    return s;
  };
  const normPin = (v: any): string | undefined => {
    const s = getStr(v);
    return s;
  };

  const initialSpi = {
    spi_device: buildSpiDevice(),
    // Новые поля для таблицы SPI: Chip и Pin
    spi_chip: (() => {
      const dev = buildSpiDevice();
      if (dev) {
        const m = /^\/dev\/(spi\d+)\.(\d+)$/.exec(dev);
        if (m) return m[1];
      }
      const portStr = getStr(spiSrc.spi_port ?? spiSrc.port ?? spiSrc.spi?.port);
      if (portStr !== undefined) {
        const p = String(portStr).replace(/\D+/g, '');
        if (p !== '') return `spi${p}`;
      }
      return undefined;
    })(),
    spi_pin: (() => {
      const dev = buildSpiDevice();
      if (dev) {
        const m = /^\/dev\/(spi\d+)\.(\d+)$/.exec(dev);
        if (m) return m[2];
      }
      const csStr = getStr(spiSrc.spi_cs ?? spiSrc.cs ?? spiSrc.chipselect ?? spiSrc.spi?.cs);
      if (csStr !== undefined) {
        const c = String(csStr).replace(/\D+/g, '');
        if (c !== '') return c;
      }
      return undefined;
    })(),
    gpio_irq_chip: normChip(spiSrc.gpio_irq_chip ?? spiSrc.irq_chip ?? spiSrc.gpio?.irq?.chip ?? spiSrc.gpio_irq_port ?? spiSrc.irq_port ?? spiSrc.gpio?.irq?.port),
    gpio_irq_pin: normPin(spiSrc.gpio_irq_pin ?? spiSrc.irq_pin ?? spiSrc.gpio?.irq?.pin),
    gpio_busy_chip: normChip(spiSrc.gpio_busy_chip ?? spiSrc.busy_chip ?? spiSrc.gpio?.busy?.chip ?? spiSrc.gpio_busy_port ?? spiSrc.busy_port ?? spiSrc.gpio?.busy?.port),
    gpio_busy_pin: normPin(spiSrc.gpio_busy_pin ?? spiSrc.busy_pin ?? spiSrc.gpio?.busy?.pin),
    gpio_nrst_chip: normChip(spiSrc.gpio_nrst_chip ?? spiSrc.nrst_chip ?? spiSrc.reset_chip ?? spiSrc.gpio?.nrst?.chip ?? spiSrc.gpio?.reset?.chip ?? spiSrc.gpio_nrst_port ?? spiSrc.nrst_port ?? spiSrc.gpio?.nrst?.port ?? spiSrc.gpio?.reset?.port),
    gpio_nrst_pin: normPin(spiSrc.gpio_nrst_pin ?? spiSrc.nrst_pin ?? spiSrc.reset_pin ?? spiSrc.gpio?.nrst?.pin ?? spiSrc.gpio?.reset?.pin),
    gpio_tx_en_chip: normChip(spiSrc.gpio_tx_en_chip ?? spiSrc.tx_en_chip ?? spiSrc.gpio?.tx_en?.chip ?? spiSrc.gpio?.txen?.chip ?? spiSrc.gpio_tx_en_port ?? spiSrc.tx_en_port ?? spiSrc.gpio?.tx_en?.port ?? spiSrc.gpio?.txen?.port),
    gpio_tx_en_pin: normPin(spiSrc.gpio_tx_en_pin ?? spiSrc.tx_en_pin ?? spiSrc.gpio?.tx_en?.pin ?? spiSrc.gpio?.txen?.pin),
    gpio_rx_en_chip: normChip(spiSrc.gpio_rx_en_chip ?? spiSrc.rx_en_chip ?? spiSrc.gpio?.rx_en?.chip ?? spiSrc.gpio?.rxen?.chip ?? spiSrc.gpio_rx_en_port ?? spiSrc.rx_en_port ?? spiSrc.gpio?.rx_en?.port ?? spiSrc.gpio?.rxen?.port),
    gpio_rx_en_pin: normPin(spiSrc.gpio_rx_en_pin ?? spiSrc.rx_en_pin ?? spiSrc.gpio?.rx_en?.pin ?? spiSrc.gpio?.rxen?.pin),
  } as Record<string, string | undefined>;

  const grid = document.createElement('div');
  grid.className = 'form-grid';
  grid.innerHTML = `
    <div class="gpio-table indent-left" style="grid-column: 1 / -1;">
      <div class="gpio-header"></div>
      <div class="gpio-header">Chip</div>
      <div class="gpio-header">Pin</div>

      <div class="gpio-row-title">SPI</div>
      <input id="spi-chip" type="text" inputmode="text" placeholder="spi0">
      <input id="spi-pin" type="text" inputmode="numeric" placeholder="0">

      <div class="gpio-row-title">IRQ</div>
      <input id="gpio-irq-chip" type="text" inputmode="text" placeholder="gpiochip1">
      <input id="gpio-irq-pin" type="text" inputmode="text" placeholder="номер или имя">

      <div class="gpio-row-title">Busy</div>
      <input id="gpio-busy-chip" type="text" inputmode="text" placeholder="gpiochip1">
      <input id="gpio-busy-pin" type="text" inputmode="text" placeholder="номер или имя">

      <div class="gpio-row-title">NRST</div>
      <input id="gpio-nrst-chip" type="text" inputmode="text" placeholder="gpiochip1">
      <input id="gpio-nrst-pin" type="text" inputmode="text" placeholder="номер или имя">

      <div class="gpio-row-title">TX EN</div>
      <input id="gpio-tx-en-chip" type="text" inputmode="text" placeholder="gpiochip1">
      <input id="gpio-tx-en-pin" type="text" inputmode="text" placeholder="номер или имя">

      <div class="gpio-row-title">RX EN</div>
      <input id="gpio-rx-en-chip" type="text" inputmode="text" placeholder="gpiochip1">
      <input id="gpio-rx-en-pin" type="text" inputmode="text" placeholder="номер или имя">
    </div>
  `;
  spiBox.appendChild(grid);

  // Кнопка «Сохранить» для SPI удалена: сохранение будет общим для RNSD и SPI

  // Важно: добавим секции в DOM до поиска элементов по id,
  // чтобы document.getElementById корректно их находил
  wrap.appendChild(rnsdBox);
  wrap.appendChild(spiBox);
  bodyEl.appendChild(wrap);

  // Установка начальных значений
  const setVal = (id: string, v: string | undefined) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    if (v === undefined || v === null) el.value = '';
    else el.value = String(v);
  };
  setVal('spi-chip', initialSpi.spi_chip as any);
  setVal('spi-pin', initialSpi.spi_pin as any);
  setVal('gpio-irq-chip', initialSpi.gpio_irq_chip);
  setVal('gpio-irq-pin', initialSpi.gpio_irq_pin);
  setVal('gpio-busy-chip', initialSpi.gpio_busy_chip);
  setVal('gpio-busy-pin', initialSpi.gpio_busy_pin);
  setVal('gpio-nrst-chip', initialSpi.gpio_nrst_chip);
  setVal('gpio-nrst-pin', initialSpi.gpio_nrst_pin);
  setVal('gpio-tx-en-chip', initialSpi.gpio_tx_en_chip);
  setVal('gpio-tx-en-pin', initialSpi.gpio_tx_en_pin);
  setVal('gpio-rx-en-chip', initialSpi.gpio_rx_en_chip);
  setVal('gpio-rx-en-pin', initialSpi.gpio_rx_en_pin);

  // Локальные элементы действий SPI отсутствуют

  type SpiModel = {
    spi_chip: string; spi_pin: string;
    gpio_irq_chip: string; gpio_irq_pin: string;
    gpio_busy_chip: string; gpio_busy_pin: string;
    gpio_nrst_chip: string; gpio_nrst_pin: string;
    gpio_tx_en_chip: string; gpio_tx_en_pin: string;
    gpio_rx_en_chip: string; gpio_rx_en_pin: string;
  };

  const collect = (): SpiModel | null => {
    const read = (id: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return undefined as any;
      const s = (el.value ?? '').trim();
      return s ? s : undefined;
    };
    const v = {
      spi_chip: read('spi-chip'), spi_pin: read('spi-pin'),
      gpio_irq_chip: read('gpio-irq-chip'), gpio_irq_pin: read('gpio-irq-pin'),
      gpio_busy_chip: read('gpio-busy-chip'), gpio_busy_pin: read('gpio-busy-pin'),
      gpio_nrst_chip: read('gpio-nrst-chip'), gpio_nrst_pin: read('gpio-nrst-pin'),
      gpio_tx_en_chip: read('gpio-tx-en-chip'), gpio_tx_en_pin: read('gpio-tx-en-pin'),
      gpio_rx_en_chip: read('gpio-rx-en-chip'), gpio_rx_en_pin: read('gpio-rx-en-pin'),
    } as Record<string, any>;
    // Проверим, что все значения заданы
    const keys = Object.keys(v);
    for (const k of keys) {
      if (v[k] === undefined) return null;
    }
    return v as SpiModel;
  };

  const serverBaseline: Partial<SpiModel> | null = (() => {
    // Если сервер прислал хоть одно поле — считаем baseline заданным
    const any = Object.values(initialSpi).some((x) => x !== undefined);
    if (!any) return null;
    const toStr = (x: any) => (typeof x === 'string' ? x : undefined);
    return {
      spi_chip: toStr(initialSpi.spi_chip)!,
      spi_pin: toStr(initialSpi.spi_pin)!,
      gpio_irq_chip: toStr(initialSpi.gpio_irq_chip)!, gpio_irq_pin: toStr(initialSpi.gpio_irq_pin)!,
      gpio_busy_chip: toStr(initialSpi.gpio_busy_chip)!, gpio_busy_pin: toStr(initialSpi.gpio_busy_pin)!,
      gpio_nrst_chip: toStr(initialSpi.gpio_nrst_chip)!, gpio_nrst_pin: toStr(initialSpi.gpio_nrst_pin)!,
      gpio_tx_en_chip: toStr(initialSpi.gpio_tx_en_chip)!, gpio_tx_en_pin: toStr(initialSpi.gpio_tx_en_pin)!,
      gpio_rx_en_chip: toStr(initialSpi.gpio_rx_en_chip)!, gpio_rx_en_pin: toStr(initialSpi.gpio_rx_en_pin)!,
    } as Partial<SpiModel>;
  })();

  const isDifferentFromBaseline = (cur: SpiModel | null): boolean => {
    if (!cur) return false; // не все заполнено — пока не сохраняем
    if (!serverBaseline) return true;
    const keys = Object.keys(cur) as (keyof SpiModel)[];
    return keys.some((k) => (serverBaseline as any)[k] === undefined || (serverBaseline as any)[k] !== (cur as any)[k]);
  };

  const validate = (cur: SpiModel | null): string | null => {
    if (!cur) return 'Заполните все поля';
    // SPI: chip "spiN" и pin — номер
    if (!/^spi\d+$/.test(cur.spi_chip)) return 'SPI Chip должен быть вида spiN (например spi0)';
    if (!/^\d+$/.test(cur.spi_pin)) return 'SPI Pin (CS) должен быть числом (например 0)';
    const chipFields: (keyof SpiModel)[] = ['gpio_irq_chip','gpio_busy_chip','gpio_nrst_chip','gpio_tx_en_chip','gpio_rx_en_chip'];
    for (const cf of chipFields) {
      const v = cur[cf] as string;
      if (!/^(?:\/dev\/)?gpiochip\d+$/.test(v) && !/^gpiochip\d+$/.test(v)) {
        return 'Имя GPIO чипа должно быть вида gpiochipN (например gpiochip1)';
      }
    }
    // Пины могут быть номером или именем — требуем непустые значения
    const pinFields: (keyof SpiModel)[] = ['gpio_irq_pin','gpio_busy_pin','gpio_nrst_pin','gpio_tx_en_pin','gpio_rx_en_pin'];
    for (const pf of pinFields) {
      if (!cur[pf] || String(cur[pf]).trim() === '') return 'Укажите номер или имя GPIO пина';
    }
    return null;
  };

  // Доступность сохранения будет обрабатываться общей кнопкой (вне секции SPI)
  const updateSaveAvailability = () => {};

  // Сохранение обрабатывается общей кнопкой (не здесь)
}

function normalizeKeys(input: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  const map: Record<string, string> = {
    // Common
    'ipcfg': 'ip_config',
    'ip_config': 'ip_config',
    'addrmode': 'ip_config',
    'address': 'ip',
    'ipaddr': 'ip',
    'mask': 'netmask',
    'netmask': 'netmask',
    'gateway': 'gateway',
    'gw': 'gateway',
    'dns': 'dns1',
    'dns1': 'dns1',
    'dns2': 'dns2',
    // WiFi
    'mode': 'mode',
    'ssid': 'ssid',
    'pass': 'password',
    'password': 'password',
    'psk': 'password',
    'key': 'password',
    // FreeDV
    'freedv_mode': 'mode',
    'freedv_rate': 'rate',
    'freedv_ldpc': 'ldpc',
  };
  for (const [k, v] of Object.entries(input)) {
    const kk = k.trim().toLowerCase();
    const target = map[kk] || kk;
    if (target === 'dns1' && out['dns1'] !== undefined) {
      // если уже есть dns1, попытка положить следующий как dns2
      out['dns2'] = v;
    } else {
      out[target] = v;
    }
  }
  return out;
}

function renderWifiForm(info?: Partial<WifiInfo>) {
  const body = byId<HTMLElement>('content-body');
  const initial: WifiInfo = {
    mode: info?.mode === 'ap' ? 'ap' : 'client',
    ssid: info?.ssid ?? '',
    password: info?.password ?? '',
    ip_config: info?.ip_config === 'static' ? 'static' : 'dhcp',
    ip: info?.ip ?? '',
    netmask: info?.netmask ?? '',
    gateway: info?.gateway ?? '',
    dns1: info?.dns1 ?? '',
    dns2: info?.dns2 ?? '',
  };

  body.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'form';
  // Разметка формы настроек как отдельный контейнер (без JSON-блока состояния)
  const settingsWrapper = document.createElement('div');
  settingsWrapper.innerHTML = `
    <div class="form-section">
      <div class="form-title">WiFi</div>
      <div class="form-grid">
        <label for="wifi-mode">Режим</label>
        <select id="wifi-mode">
          <option value="client">Клиент</option>
          <option value="ap">Точка доступа</option>
        </select>

        <label for="wifi-ssid">SSID</label>
        <input id="wifi-ssid" type="text" placeholder="Имя сети">

        <label for="wifi-pass">Пароль</label>
        <div class="input-with-icon">
          <input id="wifi-pass" type="password" placeholder="Пароль (WPA2)" autocomplete="current-password">
          <button id="wifi-pass-toggle" type="button" class="icon-btn" aria-pressed="false" aria-label="Показать пароль" title="Показать пароль">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-title">IP-настройки</div>
      <div class="form-grid">
        <label for="wifi-ipcfg">Режим адресации</label>
        <select id="wifi-ipcfg">
          <option value="dhcp">DHCP</option>
          <option value="static">Статический</option>
        </select>

        <label for="wifi-ip">IP адрес</label>
        <input id="wifi-ip" type="text" placeholder="192.168.1.10">

        <label for="wifi-mask">Маска</label>
        <input id="wifi-mask" type="text" placeholder="255.255.255.0">

        <label for="wifi-gw">Шлюз</label>
        <input id="wifi-gw" type="text" placeholder="192.168.1.1">

        <label for="wifi-dns1">DNS 1</label>
        <input id="wifi-dns1" type="text" placeholder="8.8.8.8">

        <label for="wifi-dns2">DNS 2</label>
        <input id="wifi-dns2" type="text" placeholder="1.1.1.1">
      </div>
    </div>

    <div class="form-actions">
      <button id="wifi-save" class="btn primary" type="button">Сохранить</button>
      <div id="wifi-hint" class="hint"></div>
    </div>
  `;
  while (settingsWrapper.firstChild) {
    form.appendChild(settingsWrapper.firstChild as Node);
  }

  body.appendChild(form);

  // Префилд
  (byId<HTMLSelectElement>('wifi-mode').value = initial.mode || 'client');
  byId<HTMLInputElement>('wifi-ssid').value = initial.ssid || '';
  byId<HTMLInputElement>('wifi-pass').value = initial.password || '';
  (byId<HTMLSelectElement>('wifi-ipcfg').value = initial.ip_config || 'dhcp');
  byId<HTMLInputElement>('wifi-ip').value = initial.ip || '';
  byId<HTMLInputElement>('wifi-mask').value = initial.netmask || '';
  byId<HTMLInputElement>('wifi-gw').value = initial.gateway || '';
  byId<HTMLInputElement>('wifi-dns1').value = initial.dns1 || '';
  byId<HTMLInputElement>('wifi-dns2').value = initial.dns2 || '';

  const ipcfg = byId<HTMLSelectElement>('wifi-ipcfg');
  const toggleStatic = () => {
    const isStatic = ipcfg.value === 'static';
    ['wifi-ip', 'wifi-mask', 'wifi-gw', 'wifi-dns1', 'wifi-dns2'].forEach((id) => {
      byId<HTMLInputElement>(id).disabled = !isStatic;
    });
  };
  ipcfg.addEventListener('change', toggleStatic);
  toggleStatic();

  // Применить режим автозаполнения
  const afMode = getAutoFillMode();
  const wifiProfile = loadLocalProfile<WifiInfo>('wifi');
  if (afMode === 'fill' && wifiProfile) {
    if (wifiProfile.mode) byId<HTMLSelectElement>('wifi-mode').value = wifiProfile.mode as any;
    if (wifiProfile.ssid !== undefined) byId<HTMLInputElement>('wifi-ssid').value = wifiProfile.ssid || '';
    if (wifiProfile.password !== undefined) byId<HTMLInputElement>('wifi-pass').value = wifiProfile.password || '';
    if (wifiProfile.ip_config) byId<HTMLSelectElement>('wifi-ipcfg').value = wifiProfile.ip_config as any;
    if (wifiProfile.ip !== undefined) byId<HTMLInputElement>('wifi-ip').value = wifiProfile.ip || '';
    if (wifiProfile.netmask !== undefined) byId<HTMLInputElement>('wifi-mask').value = wifiProfile.netmask || '';
    if (wifiProfile.gateway !== undefined) byId<HTMLInputElement>('wifi-gw').value = wifiProfile.gateway || '';
    if (wifiProfile.dns1 !== undefined) byId<HTMLInputElement>('wifi-dns1').value = wifiProfile.dns1 || '';
    if (wifiProfile.dns2 !== undefined) byId<HTMLInputElement>('wifi-dns2').value = wifiProfile.dns2 || '';
    // обновим доступность полей
    toggleStatic();
  } else if (afMode === 'hints') {
    // Подсказки через datalist (без пароля)
    const ssidVals = uniq([initial.ssid, wifiProfile?.ssid]);
    if (ssidVals.length) attachDatalist(byId<HTMLInputElement>('wifi-ssid'), ssidVals, 'wifi');

    const ipVals = uniq([initial.ip, wifiProfile?.ip, '192.168.1.10']);
    attachDatalist(byId<HTMLInputElement>('wifi-ip'), ipVals, 'wifi');

    const maskVals = uniq([initial.netmask, wifiProfile?.netmask, '255.255.255.0', '255.255.0.0']);
    attachDatalist(byId<HTMLInputElement>('wifi-mask'), maskVals, 'wifi');

    const gwVals = uniq([initial.gateway, wifiProfile?.gateway, '192.168.1.1']);
    attachDatalist(byId<HTMLInputElement>('wifi-gw'), gwVals, 'wifi');

    const dnsVals1 = uniq([initial.dns1, wifiProfile?.dns1, '8.8.8.8', '1.1.1.1']);
    attachDatalist(byId<HTMLInputElement>('wifi-dns1'), dnsVals1, 'wifi');

    const dnsVals2 = uniq([initial.dns2, wifiProfile?.dns2, '1.0.0.1', '8.8.4.4']);
    attachDatalist(byId<HTMLInputElement>('wifi-dns2'), dnsVals2, 'wifi');
  }

  // По требованию UI: убираем галочки/бейджи рядом с полями

  // Переключатель показа пароля (иконка внутри поля)
  const passInput = byId<HTMLInputElement>('wifi-pass');
  const passToggle = document.getElementById('wifi-pass-toggle') as HTMLButtonElement | null;
  if (passToggle) {
    passToggle.addEventListener('click', () => {
      const toShow = passInput.type === 'password';
      passInput.type = toShow ? 'text' : 'password';
      passToggle.setAttribute('aria-pressed', String(toShow));
      passToggle.setAttribute('aria-label', toShow ? 'Скрыть пароль' : 'Показать пароль');
      passToggle.setAttribute('title', toShow ? 'Скрыть пароль' : 'Показать пароль');
      passToggle.classList.toggle('active', toShow);
      // Вернём фокус в поле и установим курсор в конец
      try {
        passInput.focus({ preventScroll: true });
        const len = passInput.value.length;
        passInput.setSelectionRange(len, len);
      } catch {}
    });
  }

  const hint = byId<HTMLDivElement>('wifi-hint');
  const saveBtn = byId<HTMLButtonElement>('wifi-save');

  // Базовое состояние «как на сервере» для сравнения (дифф)
  // Если данные пришли с сервера, используем их как baseline
  // Если сервер недоступен и пришли дефолты, считаем, что baseline отсутствует
  // Считаем, что на сервере есть данные, только если пришло хотя бы одно поле из набора.
  const wifiKeys = ['mode','ssid','password','ip_config','ip','netmask','gateway','dns1','dns2'] as const;
  const hasWifiServerData = !!info && wifiKeys.some((k) => (info as any)[k] !== undefined && String((info as any)[k] ?? '') !== '');
  const serverBaseline: WifiInfo | null = hasWifiServerData ? {
    mode: initial.mode,
    ssid: initial.ssid,
    password: initial.password, // если сервер вернул пусто, сравнение пароля будет учитывать только непустые изменения
    ip_config: initial.ip_config,
    ip: initial.ip,
    netmask: initial.netmask,
    gateway: initial.gateway,
    dns1: initial.dns1,
    dns2: initial.dns2,
  } : null;

  // Стабилизация ширины кнопки «Сохранить», чтобы текст «Сохранение…» не менял лэйаут
  stabilizeActionButton(saveBtn, 'Сохранение...');

  // Валидация доступности сохранения: разрешаем только если есть дифф с сервером
  const normalizeWifi = (v: WifiInfo): WifiInfo => {
    const t = (s?: string) => (s ?? '').trim();
    const res: WifiInfo = {
      mode: (v.mode || '') as any,
      ssid: t(v.ssid),
      password: t(v.password),
      ip_config: (v.ip_config || '') as any,
      ip: t(v.ip),
      netmask: t(v.netmask),
      gateway: t(v.gateway),
      dns1: t(v.dns1),
      dns2: t(v.dns2),
    };
    // Для DHCP игнорируем статические поля при сравнении
    if (res.ip_config !== 'static') {
      res.ip = '';
      res.netmask = '';
      res.gateway = '';
      res.dns1 = '';
      res.dns2 = '';
    }
    return res;
  };

  const isDifferentFromBaseline = (current: WifiInfo): boolean => {
    if (!serverBaseline) {
      // Если baseline неизвестен (не получили данные с сервера),
      // используем упрощённую логика: разрешать сохранение при любом вводе
      return true;
    }
    const a = normalizeWifi(serverBaseline);
    const b = normalizeWifi(current);
    // Пароль: если на сервере пусто, а пользователь ставит пусто — не считаем отличием;
    // если пользователь вводит непустой пароль — считаем изменением
    const pwChanged = (a.password || '') !== (b.password || '');
    // Сравниваем остальное без пароля
    const eq =
      (a.mode || '') === (b.mode || '') &&
      (a.ssid || '') === (b.ssid || '') &&
      (a.ip_config || '') === (b.ip_config || '') &&
      (a.ip || '') === (b.ip || '') &&
      (a.netmask || '') === (b.netmask || '') &&
      (a.gateway || '') === (b.gateway || '') &&
      (a.dns1 || '') === (b.dns1 || '') &&
      (a.dns2 || '') === (b.dns2 || '');
    return pwChanged || !eq;
  };

  const updateSaveAvailability = () => {
    if (isOffline()) {
      saveBtn.disabled = true;
      hint.textContent = 'Оффлайн режим — сохранение недоступно';
      hint.className = 'hint warn';
      return;
    }
    const cur = collect();
    const diff = isDifferentFromBaseline(cur);
    saveBtn.disabled = !diff;
    // Подсказку не трогаем, чтобы не мешать сообщениям валидации/успеха
  };

  // Изначально кнопка отключена, дальше управление берёт updateSaveAvailability
  saveBtn.disabled = true;
  if (isOffline()) {
    hint.textContent = 'Оффлайн режим — сохранение недоступно';
    hint.className = 'hint warn';
  }
  // Изменения формы проверяем на дифф
  form.addEventListener('input', updateSaveAvailability);
  form.addEventListener('change', () => { toggleStatic(); updateSaveAvailability(); });

  const collect = (): WifiInfo => ({
    mode: byId<HTMLSelectElement>('wifi-mode').value as any,
    ssid: byId<HTMLInputElement>('wifi-ssid').value,
    password: byId<HTMLInputElement>('wifi-pass').value,
    ip_config: byId<HTMLSelectElement>('wifi-ipcfg').value as any,
    ip: byId<HTMLInputElement>('wifi-ip').value,
    netmask: byId<HTMLInputElement>('wifi-mask').value,
    gateway: byId<HTMLInputElement>('wifi-gw').value,
    dns1: byId<HTMLInputElement>('wifi-dns1').value,
    dns2: byId<HTMLInputElement>('wifi-dns2').value,
  });

  // Выполним первичную проверку диффа после инициализации формы
  updateSaveAvailability();

  function validate(v: WifiInfo): string | null {
    if (!v.ssid || v.ssid.trim().length === 0) return 'Укажите SSID';
    if (v.mode === 'client' && (!v.password || v.password.length < 8)) return 'Пароль не короче 8 символов';
    if (v.ip_config === 'static') {
      if (!isValidIp(v.ip)) return 'Некорректный IP адрес';
      if (!isValidIp(v.netmask)) return 'Некорректная маска';
      if (v.gateway && !isValidIp(v.gateway)) return 'Некорректный шлюз';
      if (v.dns1 && !isValidIp(v.dns1)) return 'Некорректный DNS1';
      if (v.dns2 && !isValidIp(v.dns2)) return 'Некорректный DNS2';
    }
    return null;
  }

  saveBtn.addEventListener('click', async () => {
    if (isOffline()) return; // на всякий случай
    hint.textContent = '';
    hint.className = 'hint';
    const payload = collect();
    const err = validate(payload);
    if (err) {
      hint.textContent = err;
      hint.className = 'hint error';
      return;
    }
    let savedOk = false;
    try {
      const w = saveBtn.offsetWidth; if (w) saveBtn.style.width = `${w}px`;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';
      setStatus('busy', '');
      await API.postForm('/wifi/apply', payload as any);
      // Сохраним локальный профиль
      saveLocalProfile('wifi', payload);
      hint.textContent = 'Изменения отправлены.';
      hint.className = 'hint success';
      setStatus('ok', 'Настройки WiFi применены');
      // Обновляем baseline на только что отправленные значения — дифф обнуляется
      if (serverBaseline) {
        (serverBaseline.mode as any) = payload.mode;
        serverBaseline.ssid = payload.ssid;
        serverBaseline.password = payload.password;
        (serverBaseline.ip_config as any) = payload.ip_config;
        serverBaseline.ip = payload.ip;
        serverBaseline.netmask = payload.netmask;
        serverBaseline.gateway = payload.gateway;
        serverBaseline.dns1 = payload.dns1;
        serverBaseline.dns2 = payload.dns2;
      }
      savedOk = true;
    } catch (e: any) {
      hint.textContent = `Ошибка сохранения: ${e?.message || e}`;
      hint.className = 'hint error';
      setStatus('error', 'Ошибка сохранения WiFi');
    } finally {
      // После успешного сохранения снова блокируем кнопку «Сохранить».
      // После ошибки оставляем разблокированной (если не оффлайн), чтобы можно было повторить.
      saveBtn.disabled = isOffline() || savedOk;
      saveBtn.textContent = 'Сохранить';
      saveBtn.style.width = '';
      if (!saveBtn.disabled) updateSaveAvailability();
    }
  });

  // Кнопка обновления убрана: при переходе в раздел данные подгружаются автоматически
}

function renderEthernetForm(info?: Partial<EthernetInfo>) {
  const body = byId<HTMLElement>('content-body');
  const initial: EthernetInfo = {
    ip_config: info?.ip_config === 'static' ? 'static' : 'dhcp',
    ip: info?.ip ?? '',
    netmask: info?.netmask ?? '',
    gateway: info?.gateway ?? '',
    dns1: info?.dns1 ?? '',
    dns2: info?.dns2 ?? '',
  };

  body.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'form';
  // Разметка формы настроек как отдельный контейнер (без JSON-блока состояния)
  const settingsWrapper = document.createElement('div');
  settingsWrapper.innerHTML = `
    <div class="form-section">
      <div class="form-title">Ethernet</div>
      <div class="form-grid">
        <label for="eth-ipcfg">Режим адресации</label>
        <select id="eth-ipcfg">
          <option value="dhcp">DHCP</option>
          <option value="static">Статический</option>
        </select>

        <label for="eth-ip">IP адрес</label>
        <input id="eth-ip" type="text" placeholder="192.168.1.10">

        <label for="eth-mask">Маска</label>
        <input id="eth-mask" type="text" placeholder="255.255.255.0">

        <label for="eth-gw">Шлюз</label>
        <input id="eth-gw" type="text" placeholder="192.168.1.1">

        <label for="eth-dns1">DNS 1</label>
        <input id="eth-dns1" type="text" placeholder="8.8.8.8">

        <label for="eth-dns2">DNS 2</label>
        <input id="eth-dns2" type="text" placeholder="1.1.1.1">
      </div>
    </div>

    <div class="form-actions">
      <button id="eth-save" class="btn primary" type="button">Сохранить</button>
      <div id="eth-hint" class="hint"></div>
    </div>
  `;
  while (settingsWrapper.firstChild) {
    form.appendChild(settingsWrapper.firstChild as Node);
  }

  body.appendChild(form);

  (byId<HTMLSelectElement>('eth-ipcfg').value = initial.ip_config || 'dhcp');
  byId<HTMLInputElement>('eth-ip').value = initial.ip || '';
  byId<HTMLInputElement>('eth-mask').value = initial.netmask || '';
  byId<HTMLInputElement>('eth-gw').value = initial.gateway || '';
  byId<HTMLInputElement>('eth-dns1').value = initial.dns1 || '';
  byId<HTMLInputElement>('eth-dns2').value = initial.dns2 || '';

  const ipcfg = byId<HTMLSelectElement>('eth-ipcfg');
  const toggleStatic = () => {
    const isStatic = ipcfg.value === 'static';
    ['eth-ip', 'eth-mask', 'eth-gw', 'eth-dns1', 'eth-dns2'].forEach((id) => {
      byId<HTMLInputElement>(id).disabled = !isStatic;
    });
  };
  ipcfg.addEventListener('change', toggleStatic);
  toggleStatic();

  // Применить режим автозаполнения
  const afMode2 = getAutoFillMode();
  const ethProfile = loadLocalProfile<EthernetInfo>('ethernet');
  if (afMode2 === 'fill' && ethProfile) {
    if (ethProfile.ip_config) byId<HTMLSelectElement>('eth-ipcfg').value = ethProfile.ip_config as any;
    if (ethProfile.ip !== undefined) byId<HTMLInputElement>('eth-ip').value = ethProfile.ip || '';
    if (ethProfile.netmask !== undefined) byId<HTMLInputElement>('eth-mask').value = ethProfile.netmask || '';
    if (ethProfile.gateway !== undefined) byId<HTMLInputElement>('eth-gw').value = ethProfile.gateway || '';
    if (ethProfile.dns1 !== undefined) byId<HTMLInputElement>('eth-dns1').value = ethProfile.dns1 || '';
    if (ethProfile.dns2 !== undefined) byId<HTMLInputElement>('eth-dns2').value = ethProfile.dns2 || '';
    toggleStatic();
  } else if (afMode2 === 'hints') {
    const ipVals = uniq([initial.ip, ethProfile?.ip, '192.168.1.10']);
    attachDatalist(byId<HTMLInputElement>('eth-ip'), ipVals, 'eth');

    const maskVals = uniq([initial.netmask, ethProfile?.netmask, '255.255.255.0', '255.255.0.0']);
    attachDatalist(byId<HTMLInputElement>('eth-mask'), maskVals, 'eth');

    const gwVals = uniq([initial.gateway, ethProfile?.gateway, '192.168.1.1']);
    attachDatalist(byId<HTMLInputElement>('eth-gw'), gwVals, 'eth');

    const dnsVals1 = uniq([initial.dns1, ethProfile?.dns1, '8.8.8.8', '1.1.1.1']);
    attachDatalist(byId<HTMLInputElement>('eth-dns1'), dnsVals1, 'eth');

    const dnsVals2 = uniq([initial.dns2, ethProfile?.dns2, '1.0.0.1', '8.8.4.4']);
    attachDatalist(byId<HTMLInputElement>('eth-dns2'), dnsVals2, 'eth');
  }

  // По требованию UI: убираем галочки/бейджи рядом с полями

  const hint = byId<HTMLDivElement>('eth-hint');
  const saveBtn = byId<HTMLButtonElement>('eth-save');

  // Базовое состояние с сервера для сравнения
  // Если с сервера пришёл полностью пустой ответ (нет ни одного из полей),
  // считаем, что baseline отсутствует, и разрешаем сохранение по умолчанию.
  const ethKeys = ['ip_config','ip','netmask','gateway','dns1','dns2'] as const;
  const hasEthServerData = !!info && ethKeys.some((k) => (info as any)[k] !== undefined && String((info as any)[k] ?? '') !== '');
  const serverBaseline: EthernetInfo | null = hasEthServerData ? {
    ip_config: initial.ip_config,
    ip: initial.ip,
    netmask: initial.netmask,
    gateway: initial.gateway,
    dns1: initial.dns1,
    dns2: initial.dns2,
  } : null;

  // Стабилизация ширины кнопки Ethernet «Сохранить»
  stabilizeActionButton(saveBtn, 'Сохранение...');

  // Проверка диффа для Ethernet
  const normalizeEth = (v: EthernetInfo): EthernetInfo => {
    const t = (s?: string) => (s ?? '').trim();
    const res: EthernetInfo = {
      ip_config: (v.ip_config || '') as any,
      ip: t(v.ip),
      netmask: t(v.netmask),
      gateway: t(v.gateway),
      dns1: t(v.dns1),
      dns2: t(v.dns2),
    };
    if (res.ip_config !== 'static') {
      res.ip = '';
      res.netmask = '';
      res.gateway = '';
      res.dns1 = '';
      res.dns2 = '';
    }
    return res;
  };

  const isDifferentFromBaseline = (current: EthernetInfo): boolean => {
    if (!serverBaseline) return true;
    const a = normalizeEth(serverBaseline);
    const b = normalizeEth(current);
    return !(
      (a.ip_config || '') === (b.ip_config || '') &&
      (a.ip || '') === (b.ip || '') &&
      (a.netmask || '') === (b.netmask || '') &&
      (a.gateway || '') === (b.gateway || '') &&
      (a.dns1 || '') === (b.dns1 || '') &&
      (a.dns2 || '') === (b.dns2 || '')
    );
  };

  const updateSaveAvailability = () => {
    if (isOffline()) {
      saveBtn.disabled = true;
      hint.textContent = 'Оффлайн режим — сохранение недоступно';
      hint.className = 'hint warn';
      return;
    }
    const cur = collect();
    const diff = isDifferentFromBaseline(cur);
    saveBtn.disabled = !diff;
  };

  // Стартовое состояние
  saveBtn.disabled = true;
  if (isOffline()) {
    hint.textContent = 'Оффлайн режим — сохранение недоступно';
    hint.className = 'hint warn';
  }
  form.addEventListener('input', updateSaveAvailability);
  form.addEventListener('change', () => { toggleStatic(); updateSaveAvailability(); });

  const collect = (): EthernetInfo => ({
    ip_config: byId<HTMLSelectElement>('eth-ipcfg').value as any,
    ip: byId<HTMLInputElement>('eth-ip').value,
    netmask: byId<HTMLInputElement>('eth-mask').value,
    gateway: byId<HTMLInputElement>('eth-gw').value,
    dns1: byId<HTMLInputElement>('eth-dns1').value,
    dns2: byId<HTMLInputElement>('eth-dns2').value,
  });

  // Первичная оценка диффа
  updateSaveAvailability();

  function validate(v: EthernetInfo): string | null {
    if (v.ip_config === 'static') {
      if (!isValidIp(v.ip)) return 'Некорректный IP адрес';
      if (!isValidIp(v.netmask)) return 'Некорректная маска';
      if (v.gateway && !isValidIp(v.gateway)) return 'Некорректный шлюз';
      if (v.dns1 && !isValidIp(v.dns1)) return 'Некорректный DNS1';
      if (v.dns2 && !isValidIp(v.dns2)) return 'Некорректный DNS2';
    }
    return null;
  }

  saveBtn.addEventListener('click', async () => {
    if (isOffline()) return;
    hint.textContent = '';
    hint.className = 'hint';
    const payload = collect();
    const err = validate(payload);
    if (err) {
      hint.textContent = err;
      hint.className = 'hint error';
      return;
    }
    let savedOk = false;
    try {
      const w = saveBtn.offsetWidth; if (w) saveBtn.style.width = `${w}px`;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';
      setStatus('busy', '');
      await API.postForm('/ethernet/apply', payload as any);
      // Сохраним локальный профиль
      saveLocalProfile('ethernet', payload);
      hint.textContent = 'Изменения отправлены.';
      hint.className = 'hint success';
      setStatus('ok', 'Настройки Ethernet применены');
      if (serverBaseline) {
        (serverBaseline.ip_config as any) = payload.ip_config;
        serverBaseline.ip = payload.ip;
        serverBaseline.netmask = payload.netmask;
        serverBaseline.gateway = payload.gateway;
        serverBaseline.dns1 = payload.dns1;
        serverBaseline.dns2 = payload.dns2;
      }
      savedOk = true;
    } catch (e: any) {
      hint.textContent = `Ошибка сохранения: ${e?.message || e}`;
      hint.className = 'hint error';
      setStatus('error', 'Ошибка сохранения Ethernet');
    } finally {
      // После успешного сохранения снова блокируем кнопку «Сохранить».
      // После ошибки оставляем разблокированной (если не оффлайн), чтобы можно было повторить.
      saveBtn.disabled = isOffline() || savedOk;
      saveBtn.textContent = 'Сохранить';
      saveBtn.style.width = '';
      if (!saveBtn.disabled) updateSaveAvailability();
    }
  });

  // Кнопка обновления убрана: при переходе в раздел данные подгружаются автоматически
}

// -----------------------------
// Раздел: FreeDV — форма
// -----------------------------
function renderFreeDVForm(info?: Partial<FreeDVInfo>) {
  const body = byId<HTMLElement>('content-body');
  const initial: Required<Pick<FreeDVInfo, 'mode' | 'rate' | 'ldpc'>> = {
    mode: (info?.mode?.toUpperCase?.() === 'FSK4' ? 'FSK4' : 'FSK2'),
    rate: String(info?.rate ?? '500'),
    ldpc: (info?.ldpc === '512/256' ? '512/256' : '768/256'),
  } as any;

  body.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'form';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="form-section">
      <div class="form-title">FreeDV</div>
      <div class="form-grid">
        <label for="freedv-mode">Mode</label>
        <select id="freedv-mode">
          <option value="FSK2">FSK2</option>
          <option value="FSK4">FSK4</option>
        </select>

        <label for="freedv-rate">Rate</label>
        <select id="freedv-rate">
          <option value="500">500</option>
          <option value="200">200</option>
          <option value="100">100</option>
          <option value="50">50</option>
          <option value="20">20</option>
        </select>

        <label for="freedv-ldpc">LDPC</label>
        <select id="freedv-ldpc">
          <option value="768/256">768/256</option>
          <option value="512/256">512/256</option>
        </select>
      </div>
    </div>

    <div class="form-actions">
      <button id="freedv-save" class="btn primary" type="button">Сохранить</button>
      <div id="freedv-hint" class="hint"></div>
    </div>
  `;
  while (wrapper.firstChild) form.appendChild(wrapper.firstChild as Node);
  body.appendChild(form);

  byId<HTMLSelectElement>('freedv-mode').value = initial.mode as string;
  byId<HTMLSelectElement>('freedv-rate').value = String(initial.rate);
  byId<HTMLSelectElement>('freedv-ldpc').value = initial.ldpc as string;

  const hint = byId<HTMLDivElement>('freedv-hint');
  const saveBtn = byId<HTMLButtonElement>('freedv-save');
  stabilizeActionButton(saveBtn, 'Сохранение...');

  // Если сервер не прислал ни одного поля (mode/rate/ldpc), baseline отсутствует
  const freedvKeys = ['mode','rate','ldpc'] as const;
  const hasFreeDvServerData = !!info && freedvKeys.some((k) => (info as any)[k] !== undefined && String((info as any)[k] ?? '') !== '');
  const serverBaseline: FreeDVInfo | null = hasFreeDvServerData ? { ...initial } : null;

  function collect(): Required<Pick<FreeDVInfo, 'mode' | 'rate' | 'ldpc'>> {
    return {
      mode: byId<HTMLSelectElement>('freedv-mode').value as any,
      rate: byId<HTMLSelectElement>('freedv-rate').value,
      ldpc: byId<HTMLSelectElement>('freedv-ldpc').value as any,
    };
  }

  function validate(v: Required<Pick<FreeDVInfo, 'mode' | 'rate' | 'ldpc'>>): string | null {
    const modes = ['FSK2', 'FSK4'];
    const rates = ['500','200','100','50','20'];
    const ldpcl = ['768/256','512/256'];
    if (!modes.includes(String(v.mode))) return 'Недопустимый Mode';
    if (!rates.includes(String(v.rate))) return 'Недопустимый Rate';
    if (!ldpcl.includes(String(v.ldpc))) return 'Недопустимый LDPC';
    return null;
  }

  function isDifferentFromBaseline(cur: Required<Pick<FreeDVInfo, 'mode' | 'rate' | 'ldpc'>>): boolean {
    if (!serverBaseline) return true;
    return (
      String(serverBaseline.mode).toUpperCase() !== String(cur.mode).toUpperCase() ||
      String(serverBaseline.rate) !== String(cur.rate) ||
      String(serverBaseline.ldpc) !== String(cur.ldpc)
    );
  }

  function updateSaveAvailability() {
    const cur = collect();
    const err = validate(cur);
    if (err) {
      hint.textContent = err;
      hint.className = 'hint error';
    } else if (isDifferentFromBaseline(cur)) {
      hint.textContent = 'Есть несохранённые изменения';
      hint.className = 'hint';
    } else {
      hint.textContent = '';
      hint.className = 'hint';
    }
    saveBtn.disabled = isOffline() || !!err || !isDifferentFromBaseline(cur);
  }

  ['freedv-mode','freedv-rate','freedv-ldpc'].forEach((id) => {
    byId<HTMLElement>(id).addEventListener('change', updateSaveAvailability as any);
  });
  updateSaveAvailability();

  saveBtn.addEventListener('click', async () => {
    const payload = collect();
    const err = validate(payload);
    if (err) {
      hint.textContent = err;
      hint.className = 'hint error';
      return;
    }
    let savedOk = false;
    try {
      const w = saveBtn.offsetWidth; if (w) saveBtn.style.width = `${w}px`;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';
      setStatus('busy', '');
      await API.postForm('/freedv/apply', payload as any);
      hint.textContent = 'Изменения отправлены.';
      hint.className = 'hint success';
      setStatus('ok', 'Настройки FreeDV применены');
      if (serverBaseline) {
        (serverBaseline.mode as any) = payload.mode;
        (serverBaseline.rate as any) = payload.rate;
        (serverBaseline.ldpc as any) = payload.ldpc;
      }
      savedOk = true;
    } catch (e: any) {
      hint.textContent = `Ошибка сохранения: ${e?.message || e}`;
      hint.className = 'hint error';
      setStatus('error', 'Ошибка сохранения FreeDV');
    } finally {
      saveBtn.disabled = isOffline() || savedOk;
      saveBtn.textContent = 'Сохранить';
      saveBtn.style.width = '';
      if (!saveBtn.disabled) updateSaveAvailability();
    }
  });
}
