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
  { id: 'rnsd', title: 'RNSd' },
  { id: 'freedv', title: 'FreeDV' },
  { id: 'loraspi', title: 'LoraSPI' },
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
      // Зафиксируем текущую ширину кнопки, чтобы шапка не дёргалась при смене текста
      const w = fillBtn.offsetWidth;
      if (w) fillBtn.style.width = `${w}px`;
      fillBtn.disabled = true;
      fillBtn.textContent = 'Обновление...';
      await refreshCurrentSectionData();
    } finally {
      fillBtn.disabled = false;
      fillBtn.textContent = 'Заполнить актуальные данные';
      // Снимаем фиксацию ширины
      fillBtn.style.width = '';
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
    bodyEl.textContent = `Раздел «${section.title}». Загрузка данных...`;
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
      // Специализированные формы для WiFi/Ethernet, остальные — сырые данные
      if (id === 'wifi') {
        renderWifiForm(parseInfoForSection(id, data) as any);
      } else if (id === 'ethernet') {
        renderEthernetForm(parseInfoForSection(id, data) as any);
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
const STATUS_COLOR_MIN_INTERVAL = 600; // мс между сменами цвета
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
): Partial<WifiInfo> | Partial<EthernetInfo> | undefined {
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
  const serverBaseline: WifiInfo | null = info ? {
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
  const serverBaseline: EthernetInfo | null = info ? {
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
