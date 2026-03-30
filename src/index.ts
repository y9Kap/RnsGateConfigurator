import {API, isOffline} from './api';
import {t, getLang, setLang, Lang, availableLanguages} from './i18n';
import {Auth} from './auth';

const ICON_EYE = 'M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z';
const ICON_EYE_OFF = 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.82l2.93 2.93C20.88 15.51 22 13.88 22 12c-1.73-3.89-6-7-11-7-1.25 0-2.43.19-3.54.54l2.72 2.72C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.03 1 12c1.73 3.89 6 7 11 7 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z';

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
    { id: 'interfaces', title: 'Interfaces' },
    { id: 'wifi', title: 'WiFi' },
    { id: 'ethernet', title: 'Ethernet' },
];

function getVisibleSections(): Section[] {
    const list = [...sections];
    if (Auth.getInstance().isAdmin()) {
        list.push({ id: 'users', title: t('users') });
    }
    return list;
}

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
    logo.textContent = t('app_title');
    sidebar.appendChild(logo);

    const langSelect = document.createElement('select');
    langSelect.className = 'lang-select sidebar-lang';
    availableLanguages.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (getLang() === opt.value) o.selected = true;
        langSelect.appendChild(o);
    });
    langSelect.addEventListener('change', () => setLang(langSelect.value as Lang));
    sidebar.appendChild(langSelect);

    const nav = document.createElement('nav');
    nav.className = 'menu';
    getVisibleSections().forEach((s, idx) => {
        const btn = document.createElement('button');
        btn.className = 'menu-item' + (idx === 0 ? ' active' : '');
        btn.textContent = t(s.id) || s.title;
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

    const status = document.createElement('div');
    status.id = 'net-status';
    status.className = 'status';
    const ifSaveBtn = document.createElement('button');
    ifSaveBtn.id = 'if-save-btn';
    ifSaveBtn.className = 'btn primary';
    ifSaveBtn.type = 'button';
    ifSaveBtn.textContent = t('save');
    ifSaveBtn.disabled = true;
    ifSaveBtn.style.display = 'none';
    ifSaveBtn.addEventListener('click', async () => {
        if (currentSectionId === 'interfaces') {
            await handleInterfacesSave();
        } else if (currentSaveAction) {
            await currentSaveAction();
        }
    });
    header.appendChild(ifSaveBtn);

    // Кнопки раздела Interfaces (по умолчанию скрыты)
    const ifAddBtn = document.createElement('button');
    ifAddBtn.id = 'if-add-btn';
    ifAddBtn.className = 'btn';
    ifAddBtn.type = 'button';
    ifAddBtn.textContent = t('add');
    ifAddBtn.style.display = 'none';
    ifAddBtn.addEventListener('click', () => {
        handleInterfacesAdd();
    });
    header.appendChild(ifAddBtn);
    const ifDelBtn = document.createElement('button');
    ifDelBtn.id = 'if-del-btn';
    ifDelBtn.className = 'btn danger';
    ifDelBtn.type = 'button';
    ifDelBtn.textContent = t('delete');
    ifDelBtn.disabled = true;
    ifDelBtn.style.display = 'none';
    ifDelBtn.addEventListener('click', () => {
        handleInterfacesDelete();
    });
    header.appendChild(ifDelBtn);
    // Кнопка «Заполнить актуальные данные» — подтягивает текущие значения с устройства
    const fillBtn = document.createElement('button');
    fillBtn.id = 'fill-current-btn';
    fillBtn.className = 'btn';
    fillBtn.type = 'button';
    fillBtn.textContent = t('fill_actual');
    fillBtn.title = t('fill_actual_title');
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
    stabilizeActionButton(fillBtn, t('updating'));

    // Кнопка локальной очистки полей текущей формы
    const resetBtn = document.createElement('button');
    resetBtn.id = 'reset-fields-btn';
    resetBtn.className = 'btn';
    resetBtn.type = 'button';
    resetBtn.textContent = t('clear_fields');
    resetBtn.title = t('clear_form_title');
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
    
    const toasts = document.createElement('div');
    toasts.id = 'toast-container';
    shell.appendChild(toasts);

    app.innerHTML = '';
    app.appendChild(shell);

    // Default selection
    selectSection(sections[0].id);
}

let currentSectionId: string = sections[0].id;
let currentSaveAction: (() => Promise<void>) | null = null;

function selectSection(id: string) {
    // Update active state in menu
    document.querySelectorAll('.menu-item').forEach((el) => {
        if (!(el instanceof HTMLButtonElement)) return;
        el.classList.toggle('active', el.getAttribute('data-id') === id);
    });

    // Update right panel content
    const section = getVisibleSections().find((s) => s.id === id) ?? sections[0];
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
    // Для раздела Interfaces скрываем глобальные кнопки шапки,
    // поскольку у него собственные действия
    const fillBtn = document.getElementById('fill-current-btn') as HTMLButtonElement | null;
    const resetBtn = document.getElementById('reset-fields-btn') as HTMLButtonElement | null;
    const ifAddBtn = document.getElementById('if-add-btn') as HTMLButtonElement | null;
    const ifDelBtn = document.getElementById('if-del-btn') as HTMLButtonElement | null;
    const ifSaveBtn = document.getElementById('if-save-btn') as HTMLButtonElement | null;
    const isInterfaces = id === 'interfaces';
    const sectionsWithSave = ['interfaces', 'wifi', 'ethernet', 'freedv'];
    if (fillBtn) fillBtn.style.display = isInterfaces ? 'none' : '';
    if (resetBtn) resetBtn.style.display = isInterfaces ? 'none' : '';
    if (ifAddBtn) ifAddBtn.style.display = isInterfaces ? '' : 'none';
    if (ifDelBtn) ifDelBtn.style.display = isInterfaces ? '' : 'none';
    if (ifSaveBtn) ifSaveBtn.style.display = sectionsWithSave.includes(id) ? '' : 'none';
    if (isInterfaces) updateInterfacesHeaderUI();
    else currentSaveAction = null; // сброс для других разделов, они сами установят если надо
    updateStatusBar();
    // Пробуем загрузить текущие данные раздела через CGI (GET /cgi-bin/<id>/info)
    loadSectionData(section.id)
        .catch(() => {
            // Ошибка уже отражена в статус-баре, показываем заглушку
            if (bodyEl) {
                bodyEl.textContent = `${t(section.id)} ${t('section_placeholder')}`;
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
            } else if (id === 'interfaces') {
                const raw = unwrapDataPayload(data);
                let list: InterfaceItem[] = [];
                if (Array.isArray(raw)) {
                    list = raw as InterfaceItem[];
                } else if (typeof raw === 'string') {
                    try {
                        const j = JSON.parse(raw);
                        if (Array.isArray(j)) list = j;
                    } catch {}
                }
                if (list.length > 0) {
                    ifSaveAll(list);
                    // Обновляем baseline
                    interfacesBaselineJSON = JSON.stringify(list);
                    localStorage.setItem(IF_BASELINE_KEY, interfacesBaselineJSON);
                }
                renderInterfacesForm();
            } else if (id === 'users') {
                renderUsersForm(data as any);
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
            if (isOffline()) setStatus('offline', t('offline_cgi_unavailable'));
            else setStatus('error', `${t('load_error')}: ${e?.message || e}`);
            return; // не пробрасываем, чтобы не перетёрлось содержимое
        } else if (id === 'ethernet') {
            if (bodyEl) renderEthernetForm(undefined);
            if (isOffline()) setStatus('offline', t('offline_cgi_unavailable'));
            else setStatus('error', `${t('load_error')}: ${e?.message || e}`);
            return;
        } else if (id === 'freedv') {
            if (bodyEl) renderFreeDVForm(undefined);
            if (isOffline()) setStatus('offline', t('offline_cgi_unavailable'));
            else setStatus('error', `${t('load_error')}: ${e?.message || e}`);
            return;
        } else if (id === 'rnsd') {
            if (bodyEl) renderRnsdConfig(undefined);
            if (isOffline()) setStatus('offline', t('offline_cgi_unavailable'));
            else setStatus('error', `${t('load_error')}: ${e?.message || e}`);
            return;
        } else if (id === 'interfaces') {
            if (bodyEl) renderInterfacesForm();
            if (isOffline()) setStatus('offline', t('offline_cgi_unavailable'));
            else setStatus('error', `${t('load_error')}: ${e?.message || e}`);
            return;
        } else {
            if (isOffline()) {
                setStatus('offline', t('offline_cgi_unavailable'));
            } else {
                setStatus('error', `${t('load_error')}: ${e?.message || e}`);
            }
            throw e;
        }
    }
}

function updateStatusBar() {
    if (isOffline()) setStatus('offline', t('offline_cgi_unavailable'));
    else setStatus('ok', '');
}

// -----------------------------
// Раздел: Interfaces — локальная конфигурация
// -----------------------------
type InterfaceType = 'tcp_client' | 'tcp_server' | 'rnode' | 'freedv' | 'loraspi';
type InterfaceItem = {
    id: string;
    name: string;
    type: InterfaceType;
    settings: Record<string, any>;
};

type FieldDef = {
    key: string;
    label: string;
    type: 'text' | 'number' | 'select';
    default: any;
    options?: string[];
    min?: number;
    max?: number;
    datalist?: string[];
};

type TypeDef = {
    value: InterfaceType;
    label: string;
    fields: FieldDef[];
};

const IF_STORAGE_KEY = 'interfaces_config';
const IF_CUR_KEY = 'interfaces_current_id';
const IF_BASELINE_KEY = 'interfaces_saved_baseline'; // снимок последнего успешного сохранения на устройство
let interfacesBaselineJSON: string | null = null; // кэш baseline за сессию

const RN_PRESETS: Record<string, { bw: number, sf: number, cr: number }> = {
    'Short Turbo (21.88 kbps, 140dB)': { bw: 500, sf: 7, cr: 5 },
    'Short Fast (10.94 kbps, 143dB)': { bw: 250, sf: 7, cr: 5 },
    'Short Slow (6.25 kbps, 145.5dB)': { bw: 250, sf: 8, cr: 5 },
    'Medium Fast (3.52 kbps, 148dB)': { bw: 250, sf: 9, cr: 5 },
    'Medium Slow (1.95 kbps, 150.5dB)': { bw: 250, sf: 10, cr: 5 },
    'Long Turbo (1.34 kbps, 150dB)': { bw: 500, sf: 11, cr: 8 },
    'Long Fast (1.07 kbps, 153dB)': { bw: 250, sf: 11, cr: 5 },
    'Long Moderate (0.34 kbps, 156dB)': { bw: 125, sf: 11, cr: 8 },
    'Long Slow (0.18 kbps, 158.5dB)': { bw: 125, sf: 12, cr: 8 },
};

const INTERFACE_TYPES: TypeDef[] = [
    {
        value: 'tcp_client',
        label: t('label_tcp_client'),
        fields: [
            { key: 'host', label: t('label_host'), type: 'text', default: '' },
            { key: 'port', label: t('label_port'), type: 'number', default: 5000 },
        ],
    },
    {
        value: 'tcp_server',
        label: t('label_tcp_server'),
        fields: [
            { key: 'bind_host', label: t('label_bind_host'), type: 'text', default: '0.0.0.0' },
            { key: 'port', label: t('label_port'), type: 'number', default: 5000 },
        ],
    },
    {
        value: 'rnode',
        label: t('label_rnode'),
        fields: [
            { key: 'serial', label: t('label_serial_port'), type: 'text', default: '/dev/ttyUSB0' },
            { key: 'tx_power', label: t('label_tx_power'), type: 'number', default: 20 },
            { key: 'preset', label: t('label_radio_preset'), type: 'select', default: t('not_selected'), options: [t('not_selected'), ...Object.keys(RN_PRESETS)] },
            { key: 'frequency', label: t('label_frequency'), type: 'number', default: 868 },
            {
                key: 'bandwidth',
                label: t('label_bandwidth'),
                type: 'select',
                default: 125,
                options: ['7.8', '10.4', '15.6', '20.8', '31.25', '41.7', '62.5', '125', '250', '500', '1625']
            },
            { key: 'coding_rate', label: t('label_coding_rate'), type: 'select', default: 5, options: ['5', '6', '7', '8'] },
            { key: 'spread_factor', label: t('label_spread_factor'), type: 'select', default: 7, options: ['5', '6', '7', '8', '9', '10', '11', '12'] },
        ],
    },
    {
        value: 'freedv',
        label: t('label_freedv'),
        fields: [
            { key: 'mode', label: t('label_mode'), type: 'select', default: 'FSK2', options: ['FSK2', 'FSK4'] },
            { key: 'rate', label: t('label_rate'), type: 'select', default: '500', options: ['500','200','100','50','20'] },
            { key: 'ldpc', label: t('label_ldpc'), type: 'select', default: '768/256', options: ['768/256','512/256'] },
        ],
    },
    {
        value: 'loraspi',
        label: t('label_loraspi'),
        fields: [
            { key: 'spi_chip', label: t('label_spi_chip'), type: 'text', default: 'spi0' },
            { key: 'spi_pin', label: t('label_spi_pin'), type: 'number', default: 0 },

            { key: 'irq_chip', label: t('label_irq_chip'), type: 'text', default: 'gpiochip1' },
            { key: 'irq_pin', label: t('label_irq_pin'), type: 'text', default: '' },

            { key: 'busy_chip', label: t('label_busy_chip'), type: 'text', default: 'gpiochip1' },
            { key: 'busy_pin', label: t('label_busy_pin'), type: 'text', default: '' },

            { key: 'nrst_chip', label: t('label_nrst_chip'), type: 'text', default: 'gpiochip1' },
            { key: 'nrst_pin', label: t('label_nrst_pin'), type: 'text', default: '' },

            { key: 'txen_chip', label: t('label_tx_en_chip'), type: 'text', default: 'gpiochip1' },
            { key: 'txen_pin', label: t('label_tx_en_pin'), type: 'text', default: '' },

            { key: 'rxen_chip', label: t('label_rx_en_chip'), type: 'text', default: 'gpiochip1' },
            { key: 'rxen_pin', label: t('label_rx_en_pin'), type: 'text', default: '' },

            { key: 'tx_power', label: t('label_tx_power'), type: 'number', default: 20 },
            { key: 'preset', label: t('label_radio_preset'), type: 'select', default: t('not_selected'), options: [t('not_selected'), ...Object.keys(RN_PRESETS)] },
            { key: 'frequency', label: t('label_frequency'), type: 'number', default: 868 },
            {
                key: 'bandwidth',
                label: t('label_bandwidth'),
                type: 'select',
                default: 125,
                options: ['7.8', '10.4', '15.6', '20.8', '31.25', '41.7', '62.5', '125', '250', '500', '1625']
            },
            { key: 'coding_rate', label: t('label_coding_rate'), type: 'select', default: 5, options: ['5', '6', '7', '8'] },
            { key: 'spread_factor', label: t('label_spread_factor'), type: 'select', default: 7, options: ['5', '6', '7', '8', '9', '10', '11', '12'] },
        ]

    },
];

function ifLoadAll(): InterfaceItem[] {
    try {
        const s = localStorage.getItem(IF_STORAGE_KEY);
        if (!s) return [];
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr as InterfaceItem[];
    } catch {}
    return [];
}

function ifSaveAll(list: InterfaceItem[]) {
    try {
        localStorage.setItem(IF_STORAGE_KEY, JSON.stringify(list));
    } catch {}
}

function ifGetCurrentId(): string | null {
    try {
        return localStorage.getItem(IF_CUR_KEY);
    } catch { return null; }
}

function ifSetCurrentId(id: string | null) {
    try {
        if (id) localStorage.setItem(IF_CUR_KEY, id);
        else localStorage.removeItem(IF_CUR_KEY);
    } catch {}
}

function typeDefByValue(v: InterfaceType): TypeDef {
    return INTERFACE_TYPES.find(t => t.value === v) || INTERFACE_TYPES[0];
}

function typeLabel(v: InterfaceType): string {
    return typeDefByValue(v).label;
}

function buildDefaultsForType(t: InterfaceType): Record<string, any> {
    const def = typeDefByValue(t);
    const out: Record<string, any> = {};
    def.fields.forEach(f => out[f.key] = f.default);
    return out;
}

function nextInterfaceName(list: InterfaceItem[]): string {
    const base = 'iface';
    let n = 1;
    while (list.some(i => i.name === `${base}-${n}`)) n++;
    return `${base}-${n}`;
}

function renderInterfacesForm() {
    const body = byId<HTMLElement>('content-body');
    const list = ifLoadAll();

    // Синхронизируем baseline при первом рендере, если он еще не задан
    if (interfacesBaselineJSON === null) {
        interfacesBaselineJSON = localStorage.getItem(IF_BASELINE_KEY);
        // Если и в localStorage нет — значит это самый первый запуск,
        // считаем текущее состояние за baseline (или пустоту)
        if (interfacesBaselineJSON === null) {
            interfacesBaselineJSON = JSON.stringify(list);
            try { localStorage.setItem(IF_BASELINE_KEY, interfacesBaselineJSON); } catch {}
        }
    }

    let curId = ifGetCurrentId();
    if (!curId && list.length) {
        curId = list[0].id;
        ifSetCurrentId(curId);
    }
    const cur = list.find(i => i.id === curId) || null;

    body.innerHTML = '';

    // Обновить доступность кнопок в шапке
    updateInterfacesHeaderUI();

    const form = document.createElement('div');
    form.className = 'form';

    if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'form-section';
        empty.innerHTML = `<div class="form-title">${t('interfaces')}</div><div>${t('no_interfaces_added')}</div>`;
        form.appendChild(empty);
        body.appendChild(form);
        return;
    }

    // Секция со списком интерфейсов
    const secList = document.createElement('div');
    secList.className = 'form-section';
    secList.innerHTML = `<div class="form-title">${t('interfaces_list')}</div>`;
    const gridList = document.createElement('div');
    gridList.className = 'form-grid';
    const labSel = document.createElement('label');
    labSel.setAttribute('for', 'if-select');
    labSel.textContent = t('interface');
    const sel = document.createElement('select');
    sel.id = 'if-select';
    list.forEach((it) => {
        const opt = document.createElement('option');
        opt.value = it.id;
        opt.textContent = `${it.name || `(${t('no_name')})`} — ${typeLabel(it.type)}`;
        if (it.id === curId) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
        ifSetCurrentId(sel.value);
        renderInterfacesForm();
    });
    gridList.appendChild(labSel);
    gridList.appendChild(sel);
    secList.appendChild(gridList);
    form.appendChild(secList);

    if (!cur) {
        body.appendChild(form);
        return;
    }

    // Поле имени
    const secName = document.createElement('div');
    secName.className = 'form-section';
    const gridName = document.createElement('div');
    gridName.className = 'form-grid';
    const labName = document.createElement('label');
    labName.setAttribute('for', 'if-name');
    labName.textContent = t('interface_name');
    const inputName = document.createElement('input');
    inputName.id = 'if-name';
    inputName.type = 'text';
    inputName.value = cur.name;
    inputName.addEventListener('input', () => {
        const arr = ifLoadAll();
        const item = arr.find(i => i.id === cur.id);
        if (!item) return;
        item.name = inputName.value;
        ifSaveAll(arr);
        // Обновим текст выбранной опции без полного перерендера
        // Обновим option в селекте
        for (const o of Array.from(sel.options)) {
            if (o.value === cur.id) {
                o.textContent = `${item.name || `(${t('no_name')})`} — ${typeLabel(item.type)}`;
                break;
            }
        }
        updateInterfacesHeaderUI();
    });
    gridName.appendChild(labName);
    gridName.appendChild(inputName);
    secName.appendChild(gridName);
    form.appendChild(secName);

    // Выбор типа
    const secType = document.createElement('div');
    secType.className = 'form-section';
    const gridType = document.createElement('div');
    gridType.className = 'form-grid';
    const labType = document.createElement('label');
    labType.setAttribute('for', 'if-type');
    labType.textContent = t('type');
    const selType = document.createElement('select');
    selType.id = 'if-type';
    INTERFACE_TYPES.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        if (t.value === cur.type) opt.selected = true;
        selType.appendChild(opt);
    });
    selType.addEventListener('change', () => {
        const arr = ifLoadAll();
        const newType = selType.value as InterfaceType;

        // Проверка на дубликаты для loraspi и freedv
        if (newType === 'loraspi' || newType === 'freedv') {
            const exists = arr.some(i => i.id !== cur.id && i.type === newType);
            if (exists) {
                showToast('error', t('error_duplicate_iface'));
                selType.value = cur.type; // Возвращаем назад
                return;
            }
        }

        const item = arr.find(i => i.id === cur.id);
        if (!item) return;
        item.type = newType;
        item.settings = buildDefaultsForType(item.type);
        ifSaveAll(arr);
        // Обновим текст опции в списке интерфейсов
        for (const o of Array.from(sel.options)) {
            if (o.value === cur.id) {
                o.textContent = `${item.name || `(${t('no_name')})`} — ${typeLabel(item.type)}`;
                break;
            }
        }
        // Перерисуем набор настроек
        renderSettings(cur.id);
        updateInterfacesHeaderUI();
    });
    gridType.appendChild(labType);
    gridType.appendChild(selType);
    secType.appendChild(gridType);
    form.appendChild(secType);

    // Контейнер для настроек
    const secSet = document.createElement('div');
    secSet.className = 'form-section';
    const titleSet = document.createElement('div');
    titleSet.className = 'form-title';
    titleSet.textContent = t('type_settings');
    const contSet = document.createElement('div');
    contSet.id = 'if-settings';
    secSet.appendChild(titleSet);
    secSet.appendChild(contSet);
    form.appendChild(secSet);

    // Вставить форму на страницу и отрендерить настройки
    body.appendChild(form);
    renderSettings(cur.id);

    function renderSettings(itemId: string) {
        const container = byId<HTMLDivElement>('if-settings');
        if (!container) return;
        const arr = ifLoadAll();
        const item = arr.find(i => i.id === itemId);
        if (!item) { container.innerHTML = ''; return; }
        const tdef = typeDefByValue(item.type);
        container.innerHTML = '';

        // Особая отрисовка для LoraSPI — табличная раскладка Chip/Pin по сигналам
        if (tdef.value === 'loraspi') {
            // Удобный доступ к дефолтам
            const defaults: Record<string, any> = {};
            tdef.fields.forEach(f => { defaults[f.key] = f.default; });

            const table = document.createElement('div');
            table.className = 'gpio-table';

            // Шапка таблицы: «Сигнал | Chip | Pin»
            const hTitle = document.createElement('div');
            hTitle.className = 'gpio-header';
            const hChip = document.createElement('div');
            hChip.className = 'gpio-header';
            hChip.textContent = 'Chip';
            const hPin = document.createElement('div');
            hPin.className = 'gpio-header';
            hPin.textContent = 'Pin';
            table.appendChild(hTitle);
            table.appendChild(hChip);
            table.appendChild(hPin);

            type Row = { title: string; chipKey: string; pinKey: string; pinType: 'text' | 'number' };
            const rows: Row[] = [
                { title: 'SPI',  chipKey: 'spi_chip',  pinKey: 'spi_pin',  pinType: 'number' },
                { title: 'IRQ',  chipKey: 'irq_chip',  pinKey: 'irq_pin',  pinType: 'text'   },
                { title: 'Busy', chipKey: 'busy_chip', pinKey: 'busy_pin', pinType: 'text'   },
                { title: 'NRST', chipKey: 'nrst_chip', pinKey: 'nrst_pin', pinType: 'text'   },
                { title: 'TX EN',chipKey: 'txen_chip', pinKey: 'txen_pin', pinType: 'text'   },
                { title: 'RX EN',chipKey: 'rxen_chip', pinKey: 'rxen_pin', pinType: 'text'   },
            ];

            const applySave = (key: string, value: any) => {
                const a = ifLoadAll();
                const it = a.find(i => i.id === itemId);
                if (!it) return;
                it.settings[key] = value;
                ifSaveAll(a);
                updateInterfacesHeaderUI();
            };

            rows.forEach(r => {
                // Title cell
                const title = document.createElement('div');
                title.className = 'gpio-row-title';
                title.textContent = r.title;
                table.appendChild(title);

                // Chip input
                const chipInp = document.createElement('input');
                chipInp.id = `if-field-${r.chipKey}`;
                chipInp.type = 'text';
                const chipDefault = defaults[r.chipKey];
                const chipStored = item.settings[r.chipKey];
                chipInp.placeholder = chipDefault === undefined || chipDefault === null ? '' : String(chipDefault);
                // Пустое значение в инпуте, если хранится дефолт или пусто — показываем плейсхолдер
                if (chipStored === undefined || chipStored === null || String(chipStored) === String(chipDefault ?? '')) {
                    chipInp.value = '';
                } else {
                    chipInp.value = String(chipStored);
                }
                chipInp.addEventListener('input', () => {
                    applySave(r.chipKey, chipInp.value);
                });
                table.appendChild(chipInp);

                // Pin input
                const pinInp = document.createElement('input');
                pinInp.id = `if-field-${r.pinKey}`;
                pinInp.type = r.pinType === 'number' ? 'number' : 'text';
                const pinDefault = defaults[r.pinKey];
                const pinStored = item.settings[r.pinKey];
                // Для текстовых пинов (IRQ/Busy/NRST/TX EN/RX EN) показываем явный плейсхолдер
                // «номер или имя», даже если дефолта нет. Для числовых — сохраняем прежнюю логику.
                pinInp.placeholder = r.pinType === 'text'
                    ? t('num_or_name')
                    : (pinDefault === undefined || pinDefault === null ? '' : String(pinDefault));
                if (
                    pinStored === undefined || pinStored === null ||
                    // Для числовых значений сравниваем по строке — достаточно для рендера
                    String(pinStored) === String(pinDefault ?? '')
                ) {
                    pinInp.value = '';
                } else {
                    pinInp.value = String(pinStored);
                }
                pinInp.addEventListener('input', () => {
                    if (r.pinType === 'number') {
                        const n = pinInp.value.trim() === '' ? null : Number(pinInp.value);
                        applySave(r.pinKey, Number.isFinite(n as any) ? Number(n) : null);
                    } else {
                        applySave(r.pinKey, pinInp.value);
                    }
                });
                table.appendChild(pinInp);
            });

            container.appendChild(table);

            // Отрисовываем остальные поля (радио-параметры), которые не вошли в таблицу
            const tableKeys = new Set<string>();
            rows.forEach(r => { tableKeys.add(r.chipKey); tableKeys.add(r.pinKey); });

            const remainingFields = tdef.fields.filter(f => !tableKeys.has(f.key));
            if (remainingFields.length > 0) {
                const grid = document.createElement('div');
                grid.className = 'form-grid';
                grid.style.marginTop = '20px';
                container.appendChild(grid);
                remainingFields.forEach(f => renderField(f, grid, item, itemId));
            }
            return;
        }

        // Универсальная раскладка для прочих типов
        const grid = document.createElement('div');
        grid.className = 'form-grid';
        container.appendChild(grid);
        tdef.fields.forEach((f) => {
            renderField(f, grid, item, itemId);
        });
    }

    function renderField(f: any, grid: HTMLElement, item: InterfaceItem, itemId: string) {
        const lab = document.createElement('label');
        lab.setAttribute('for', `if-field-${f.key}`);
        lab.textContent = f.label;
        let input: HTMLElement;
        if (f.type === 'select') {
            const sel = document.createElement('select');
            sel.id = `if-field-${f.key}`;
            (f.options || []).forEach((optv: any) => {
                const o = document.createElement('option');
                o.value = String(optv);
                o.textContent = String(optv);
                sel.appendChild(o);
            });
            sel.value = String(item.settings[f.key] ?? f.default);
            sel.addEventListener('change', () => {
                const a = ifLoadAll();
                const it = a.find(i => i.id === itemId);
                if (!it) return;
                it.settings[f.key] = sel.value;

                // Если это пресет RNode или LoraSPI — подставляем BW/CR/SF
                if ((item.type === 'rnode' || item.type === 'loraspi') && f.key === 'preset' && RN_PRESETS[sel.value]) {
                    const p = RN_PRESETS[sel.value];
                    it.settings['bandwidth'] = p.bw;
                    it.settings['coding_rate'] = p.cr;
                    it.settings['spread_factor'] = p.sf;

                    const bwInp = byId<HTMLSelectElement>('if-field-bandwidth');
                    const crInp = byId<HTMLSelectElement>('if-field-coding_rate');
                    const sfInp = byId<HTMLSelectElement>('if-field-spread_factor');
                    if (bwInp) bwInp.value = String(p.bw);
                    if (crInp) crInp.value = String(p.cr);
                    if (sfInp) sfInp.value = String(p.sf);
                }

                ifSaveAll(a);
                updateInterfacesHeaderUI();
            });
            input = sel;
        } else {
            const inp = document.createElement('input');
            inp.id = `if-field-${f.key}`;
            inp.type = f.type === 'number' ? 'number' : 'text';
            if (f.type === 'number') inp.step = 'any';
            if (f.min !== undefined) inp.setAttribute('min', String(f.min));
            if (f.max !== undefined) inp.setAttribute('max', String(f.max));
            if (f.datalist) attachDatalist(inp, f.datalist, f.key);

            const v = item.settings[f.key] ?? f.default;
            inp.value = v === undefined || v === null ? '' : String(v);
            inp.addEventListener('input', () => {
                const a = ifLoadAll();
                const it = a.find(i => i.id === itemId);
                if (!it) return;
                if (f.type === 'number') {
                    const n = inp.value.trim() === '' ? null : Number(inp.value);
                    it.settings[f.key] = Number.isFinite(n as any) ? Number(n) : null;
                } else {
                    it.settings[f.key] = inp.value;
                }

                // Если вручную меняем параметры радио — сбрасываем пресет
                if ((item.type === 'rnode' || item.type === 'loraspi') && ['bandwidth', 'coding_rate', 'spread_factor'].includes(f.key)) {
                    if (it.settings['preset'] !== undefined) {
                        it.settings['preset'] = t('not_selected');
                        const preSel = byId<HTMLSelectElement>('if-field-preset');
                        if (preSel) preSel.value = t('not_selected');
                    }
                }

                ifSaveAll(a);
                updateInterfacesHeaderUI();
            });
            input = inp;
        }
        grid.appendChild(lab);
        grid.appendChild(input);
    }
}

function updateInterfacesHeaderUI() {
    const addBtn = byId<HTMLButtonElement>('if-add-btn');
    const delBtn = byId<HTMLButtonElement>('if-del-btn');
    const saveBtn = byId<HTMLButtonElement>('if-save-btn');
    const list = ifLoadAll();
    const curId = ifGetCurrentId();
    const hasCur = !!curId && list.some(i => i.id === curId);

    if (addBtn) {
        const isAdmin = Auth.getInstance().isAdmin();
        if (!isAdmin && list.length >= 1) {
            addBtn.disabled = true;
            addBtn.title = t('limit_one_config');
        } else {
            addBtn.disabled = false;
            addBtn.title = '';
        }
    }

    if (delBtn) delBtn.disabled = !hasCur;
    if (saveBtn) {
        // Инициализируем baseline из localStorage или текущим состоянием (если нет сохранений)
        if (!interfacesBaselineJSON) {
            try {
                interfacesBaselineJSON = localStorage.getItem(IF_BASELINE_KEY);
            } catch {}
            if (!interfacesBaselineJSON) interfacesBaselineJSON = JSON.stringify(list);
        }
        const curJSON = JSON.stringify(list);
        const hasDiff = curJSON !== interfacesBaselineJSON;
        saveBtn.disabled = isOffline() || list.length === 0 || !hasDiff;
    }
}

function handleInterfacesAdd() {
    const list = ifLoadAll();
    const id = `if-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const type: InterfaceType = 'tcp_client';
    const item: InterfaceItem = {
        id,
        name: nextInterfaceName(list),
        type,
        settings: buildDefaultsForType(type),
    };
    list.push(item);
    ifSaveAll(list);
    ifSetCurrentId(id);
    updateInterfacesHeaderUI();
    renderInterfacesForm();
}

function handleInterfacesDelete() {
    const list = ifLoadAll();
    const curId = ifGetCurrentId();
    if (!curId) return;
    const idx = list.findIndex(i => i.id === curId);
    if (idx === -1) return;
    list.splice(idx, 1);
    ifSaveAll(list);
    if (list.length) {
        const next = list[Math.min(idx, list.length - 1)];
        ifSetCurrentId(next.id);
    } else {
        ifSetCurrentId(null);
    }
    updateInterfacesHeaderUI();
    renderInterfacesForm();
}

async function handleInterfacesSave() {
    const list = ifLoadAll();
    try {
        if (isOffline()) throw new Error('offline');
        await API.postForm('/interfaces/apply', { payload: JSON.stringify(list) });
        setStatus('ok', t('interfaces_saved'));
        // Обновляем baseline последнего сохранения
        try {
            interfacesBaselineJSON = JSON.stringify(list);
            localStorage.setItem(IF_BASELINE_KEY, interfacesBaselineJSON);
        } catch {}
    } catch (e: any) {
        if (e && String(e.message || e) === 'offline') {
            setStatus('offline', t('offline_save_unavailable'));
        } else {
            setStatus('error', `${t('save_error')}: ${e?.message || e}`);
        }
    } finally {
        updateInterfacesHeaderUI();
    }
}

// --- Искуственная задержка переключения цветов индикатора ---
type StatusKind = '' | 'ok' | 'offline' | 'error' | 'busy';
const STATUS_COLOR_MIN_INTERVAL = 500; // мс между сменами цвета
let lastIndicatorSwitch = 0; // момент последнего применения класса
let indicatorTimer: number | null = null; // таймер отложенного применения
let indicatorPending: { kind: StatusKind; text: string } | null = null; // последняя запрошенная

function showToast(kind: StatusKind, text: string) {
    const container = document.getElementById('toast-container');
    if (!container || !kind || kind === 'busy') return;

    // Предотвращение дубликатов (если такое же сообщение уже показывается)
    const existing = Array.from(container.children).find(el => el.textContent === text);
    if (existing) return;

    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.textContent = text;
    container.appendChild(toast);

    // Анимация появления
    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    // Автоматическое удаление
    const duration = kind === 'ok' ? 3000 : 5000;
    setTimeout(() => {
        toast.classList.remove('visible');
        // Даем время на анимацию исчезновения перед удалением из DOM
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 400);
    }, duration);
}

function applyIndicator(kind: StatusKind, text: string) {
    const el = document.getElementById('net-status');
    if (!el) return;
    const hasText = typeof text === 'string' && text.trim().length > 0;
    el.className = `status${kind ? ' ' + kind : ''}`;
    // Текст в самом индикаторе не показываем — только цвет/tooltip
    el.textContent = '';
    // Tooltip у индикатора
    if (kind === 'ok') {
        el.setAttribute('title', t('online'));
    } else if (kind === 'offline') {
        el.setAttribute('title', hasText ? text.trim() : t('offline'));
    } else if (kind === 'error') {
        el.setAttribute('title', hasText ? text.trim() : t('error'));
    } else if (kind === 'busy') {
        el.setAttribute('title', hasText ? text.trim() : t('requesting'));
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
    const hasText = typeof text === 'string' && text.trim().length > 0;

    if (hasText && kind !== 'busy') {
        showToast(kind, text.trim());
    }

    // Визуальный индикатор состояния — меняем цвет с искусственной задержкой
    scheduleIndicator(kind, text);
}

function startApp() {
    Auth.getInstance().checkAuth(initUI);
}

// Init after DOM ready (supports file:// open)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
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

    const currentOptions = Array.from(dl.options).map(o => o.value);
    if (currentOptions.length === options.length && currentOptions.every((v, i) => v === options[i])) {
        if (input.getAttribute('list') !== listId) {
            input.setAttribute('list', listId);
        }
        return;
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
            rnsdPre.textContent = t('no_rnsd_data');
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
        return getStr(v);
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
      <input id="gpio-irq-pin" type="text" inputmode="text" placeholder="${t("num_or_name")}">

      <div class="gpio-row-title">Busy</div>
      <input id="gpio-busy-chip" type="text" inputmode="text" placeholder="gpiochip1">
      <input id="gpio-busy-pin" type="text" inputmode="text" placeholder="${t("num_or_name")}">

      <div class="gpio-row-title">NRST</div>
      <input id="gpio-nrst-chip" type="text" inputmode="text" placeholder="gpiochip1">
      <input id="gpio-nrst-pin" type="text" inputmode="text" placeholder="${t("num_or_name")}">

      <div class="gpio-row-title">TX EN</div>
      <input id="gpio-tx-en-chip" type="text" inputmode="text" placeholder="gpiochip1">
      <input id="gpio-tx-en-pin" type="text" inputmode="text" placeholder="${t("num_or_name")}">

      <div class="gpio-row-title">RX EN</div>
      <input id="gpio-rx-en-chip" type="text" inputmode="text" placeholder="gpiochip1">
      <input id="gpio-rx-en-pin" type="text" inputmode="text" placeholder="${t("num_or_name")}">
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
    (() => {
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
        <label for="wifi-mode">${t('mode')}</label>
        <select id="wifi-mode">
          <option value="client">${t('client')}</option>
          <option value="ap">${t('ap')}</option>
        </select>

        <label for="wifi-ssid">SSID</label>
        <input id="wifi-ssid" type="text" placeholder="${t('ssid')}">

        <label for="wifi-pass">${t('password_label')}</label>
        <div class="input-with-icon">
          <input id="wifi-pass" type="password" placeholder="${t('password')}" autocomplete="current-password">
          <button id="wifi-pass-toggle" type="button" class="icon-btn" aria-pressed="false" aria-label="${t('show_pass')}" title="${t('show_pass')}">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="${ICON_EYE}" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-title">${t('ip_settings')}</div>
      <div class="form-grid">
        <label for="wifi-ipcfg">${t('address_mode')}</label>
        <select id="wifi-ipcfg">
          <option value="dhcp">DHCP</option>
          <option value="static">${t('static')}</option>
        </select>

        <label for="wifi-ip">${t('ip_address')}</label>
        <input id="wifi-ip" type="text" placeholder="192.168.1.10">

        <label for="wifi-mask">${t('mask')}</label>
        <input id="wifi-mask" type="text" placeholder="255.255.255.0">

        <label for="wifi-gw">${t('gateway')}</label>
        <input id="wifi-gw" type="text" placeholder="192.168.1.1">

        <label for="wifi-dns1">DNS 1</label>
        <input id="wifi-dns1" type="text" placeholder="8.8.8.8">

        <label for="wifi-dns2">DNS 2</label>
        <input id="wifi-dns2" type="text" placeholder="1.1.1.1">
      </div>
    </div>

    <div class="form-section">
      <div class="form-title">${t('network_status')}</div>
      <div class="status-container">
        <pre id="wifi-status-text" class="code-small">${t('requesting')}</pre>
        <button id="wifi-status-refresh" type="button" class="btn btn-sm">${t('refresh_status')}</button>
      </div>
    </div>

    <div class="form-actions">
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

    const refreshStatus = async () => {
        const statusText = document.getElementById('wifi-status-text');
        const refreshBtn = document.getElementById('wifi-status-refresh') as HTMLButtonElement | null;
        if (!statusText) return;

        statusText.textContent = t('requesting');
        if (refreshBtn) refreshBtn.disabled = true;

        try {
            const res = await API.get('/wifi/status');
            statusText.textContent = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
        } catch (e: any) {
            statusText.textContent = `${t('error')}: ${e?.message || e}`;
        } finally {
            if (refreshBtn) refreshBtn.disabled = false;
        }
    };

    byId('wifi-status-refresh').addEventListener('click', refreshStatus);
    refreshStatus();

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
        const passIconPath = passToggle.querySelector('path');
        passToggle.addEventListener('click', () => {
            const toShow = passInput.type === 'password';
            passInput.type = toShow ? 'text' : 'password';
            passToggle.setAttribute('aria-pressed', String(toShow));
            passToggle.setAttribute('aria-label', toShow ? t('hide_pass') : t('show_pass'));
            passToggle.setAttribute('title', toShow ? t('hide_pass') : t('show_pass'));
            passToggle.classList.toggle('active', toShow);

            if (passIconPath) {
                passIconPath.setAttribute('d', toShow ? ICON_EYE_OFF : ICON_EYE);
            }

            // Вернём фокус в поле и установим курсор в конец
            try {
                passInput.focus({ preventScroll: true });
                const len = passInput.value.length;
                passInput.setSelectionRange(len, len);
            } catch {}
        });
    }

    const hint = byId<HTMLDivElement>('wifi-hint');
    const saveBtn = byId<HTMLButtonElement>('if-save-btn');

    // Ранее использовался serverBaseline; теперь работаем от «последнего сохранения»

    // Стабилизация ширины кнопки «Сохранить», чтобы текст «Сохранение…» не менял лэйаут
    stabilizeActionButton(saveBtn, t('saving'));

    // Валидация доступности сохранения: разрешаем только если есть дифф относительно последнего сохранения
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

    // База сравнения «последнее сохранение»: если сервер не прислал данные,
    // используем текущее начальное состояние формы до первого ввода.
    let lastSaved: WifiInfo = {
        mode: initial.mode,
        ssid: initial.ssid,
        password: initial.password,
        ip_config: initial.ip_config,
        ip: initial.ip,
        netmask: initial.netmask,
        gateway: initial.gateway,
        dns1: initial.dns1,
        dns2: initial.dns2,
    };

    const isDifferentFromBaseline = (current: WifiInfo): boolean => {
        const a = normalizeWifi(lastSaved);
        const b = normalizeWifi(current);
        // Пароль сравниваем как обычную строку; отличия учитываются как изменение
        const pwChanged = (a.password || '') !== (b.password || '');
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
            hint.textContent = t('offline_save_unavailable_short');
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
        hint.textContent = t('offline_save_unavailable_short');
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
        if (!v.ssid || v.ssid.trim().length === 0) return t('specify_ssid');
        if (v.mode === 'client' && (!v.password || v.password.length < 8)) return t('pass_too_short');
        if (v.ip_config === 'static') {
            if (!isValidIp(v.ip)) return t('invalid_ip');
            if (!isValidIp(v.netmask)) return t('invalid_mask');
            if (v.gateway && !isValidIp(v.gateway)) return t('invalid_gw');
            if (v.dns1 && !isValidIp(v.dns1)) return t('invalid_dns1');
            if (v.dns2 && !isValidIp(v.dns2)) return t('invalid_dns2');
        }
        return null;
    }

    currentSaveAction = async () => {
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
            saveBtn.textContent = t('saving');
            setStatus('busy', '');
            await API.postForm('/wifi/apply', payload as any);
            // Сохраним локальный профиль
            saveLocalProfile('wifi', payload);
            hint.textContent = t('saved');
            hint.className = 'hint success';
            setStatus('ok', t('wifi_applied'));
            // Обновляем baseline «последнее сохранение» — дифф обнуляется
            lastSaved = { ...payload } as WifiInfo;
            savedOk = true;
        } catch (e: any) {
            hint.textContent = `${t('save_error')}: ${e?.message || e}`;
            hint.className = 'hint error';
            setStatus('error', t('wifi_save_error'));
        } finally {
            // После успешного сохранения снова блокируем кнопку «Сохранить».
            // После ошибки оставляем разблокированной (если не оффлайн), чтобы можно было повторить.
            saveBtn.disabled = isOffline() || savedOk;
            saveBtn.textContent = t('save');
            saveBtn.style.width = '';
            if (!saveBtn.disabled) updateSaveAvailability();
        }
    };

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
        <label for="eth-ipcfg">${t('address_mode')}</label>
        <select id="eth-ipcfg">
          <option value="dhcp">DHCP</option>
          <option value="static">${t('static')}</option>
        </select>

        <label for="eth-ip">${t('ip_address')}</label>
        <input id="eth-ip" type="text" placeholder="192.168.1.10">

        <label for="eth-mask">${t('mask')}</label>
        <input id="eth-mask" type="text" placeholder="255.255.255.0">

        <label for="eth-gw">${t('gateway')}</label>
        <input id="eth-gw" type="text" placeholder="192.168.1.1">

        <label for="eth-dns1">DNS 1</label>
        <input id="eth-dns1" type="text" placeholder="8.8.8.8">

        <label for="eth-dns2">DNS 2</label>
        <input id="eth-dns2" type="text" placeholder="1.1.1.1">
      </div>
    </div>

    <div class="form-actions">
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
    const saveBtn = byId<HTMLButtonElement>('if-save-btn');

    // Прежняя логика serverBaseline больше не используется — работаем от «последнего сохранения»

    // Стабилизация ширины кнопки Ethernet «Сохранить»
    stabilizeActionButton(saveBtn, t('saving'));

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

    // База «последнее сохранение»: по умолчанию — начальное состояние формы
    let lastSavedEth: EthernetInfo = {
        ip_config: initial.ip_config,
        ip: initial.ip,
        netmask: initial.netmask,
        gateway: initial.gateway,
        dns1: initial.dns1,
        dns2: initial.dns2,
    };

    const isDifferentFromBaseline = (current: EthernetInfo): boolean => {
        const a = normalizeEth(lastSavedEth);
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
            hint.textContent = t('offline_save_unavailable_short');
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
        hint.textContent = t('offline_save_unavailable_short');
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
            if (!isValidIp(v.ip)) return t('invalid_ip');
            if (!isValidIp(v.netmask)) return t('invalid_mask');
            if (v.gateway && !isValidIp(v.gateway)) return t('invalid_gw');
            if (v.dns1 && !isValidIp(v.dns1)) return t('invalid_dns1');
            if (v.dns2 && !isValidIp(v.dns2)) return t('invalid_dns2');
        }
        return null;
    }

    currentSaveAction = async () => {
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
            saveBtn.textContent = t('saving');
            setStatus('busy', '');
            await API.postForm('/ethernet/apply', payload as any);
            // Сохраним локальный профиль
            saveLocalProfile('ethernet', payload);
            hint.textContent = t('saved');
            hint.className = 'hint success';
            setStatus('ok', t('eth_applied'));
            // Обновляем базу «последнее сохранение», чтобы сбросить дифф
            lastSavedEth = { ...payload } as EthernetInfo;
            savedOk = true;
        } catch (e: any) {
            hint.textContent = `${t('save_error')}: ${e?.message || e}`;
            hint.className = 'hint error';
            setStatus('error', t('eth_save_error'));
        } finally {
            // После успешного сохранения снова блокируем кнопку «Сохранить».
            // После ошибки оставляем разблокированной (если не оффлайн), чтобы можно было повторить.
            saveBtn.disabled = isOffline() || savedOk;
            saveBtn.textContent = t('save');
            saveBtn.style.width = '';
            if (!saveBtn.disabled) updateSaveAvailability();
        }
    };

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
      <div id="freedv-hint" class="hint"></div>
    </div>
  `;
    while (wrapper.firstChild) form.appendChild(wrapper.firstChild as Node);
    body.appendChild(form);

    byId<HTMLSelectElement>('freedv-mode').value = initial.mode as string;
    byId<HTMLSelectElement>('freedv-rate').value = String(initial.rate);
    byId<HTMLSelectElement>('freedv-ldpc').value = initial.ldpc as string;

    const hint = byId<HTMLDivElement>('freedv-hint');
    const saveBtn = byId<HTMLButtonElement>('if-save-btn');
    stabilizeActionButton(saveBtn, t('saving'));

    // База «последнее сохранение» для FreeDV — берём текущее начальное состояние формы
    let lastSavedFree: Required<Pick<FreeDVInfo, 'mode' | 'rate' | 'ldpc'>> = { ...initial } as any;

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
        if (!modes.includes(String(v.mode))) return t('invalid_mode');
        if (!rates.includes(String(v.rate))) return t('invalid_rate');
        if (!ldpcl.includes(String(v.ldpc))) return t('invalid_ldpc');
        return null;
    }

    function isDifferentFromBaseline(cur: Required<Pick<FreeDVInfo, 'mode' | 'rate' | 'ldpc'>>): boolean {
        return (
            String(lastSavedFree.mode).toUpperCase() !== String(cur.mode).toUpperCase() ||
            String(lastSavedFree.rate) !== String(cur.rate) ||
            String(lastSavedFree.ldpc) !== String(cur.ldpc)
        );
    }

    function updateSaveAvailability() {
        const cur = collect();
        const err = validate(cur);
        if (err) {
            hint.textContent = err;
            hint.className = 'hint error';
        } else if (isDifferentFromBaseline(cur)) {
            hint.textContent = t('unsaved_changes');
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

    currentSaveAction = async () => {
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
            saveBtn.textContent = t('saving');
            setStatus('busy', '');
            await API.postForm('/freedv/apply', payload as any);
            hint.textContent = t('saved');
            hint.className = 'hint success';
            setStatus('ok', t('freedv_applied'));
            // Обновляем «последнее сохранение»
            lastSavedFree = { ...payload } as any;
            savedOk = true;
        } catch (e: any) {
            hint.textContent = `${t('save_error')}: ${e?.message || e}`;
            hint.className = 'hint error';
            setStatus('error', t('freedv_save_error'));
        } finally {
            saveBtn.disabled = isOffline() || savedOk;
            saveBtn.textContent = t('save');
            saveBtn.style.width = '';
            if (!saveBtn.disabled) updateSaveAvailability();
        }
    };
}

function renderUsersForm(data: { users: { username: string, is_admin: boolean }[] }) {
    const body = byId<HTMLElement>('content-body');
    body.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'form';

    const secList = document.createElement('div');
    secList.className = 'form-section';
    secList.innerHTML = `<div class="form-title">${t('user_management')}</div>`;
    
    const users = (data && data.users) || [];

    const table = document.createElement('table');
    table.className = 'users-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>${t('username')}</th>
            <th style="text-align:center">${t('is_admin')}</th>
            <th style="text-align:right"></th>
        </tr>
    `;
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.username}</td>
            <td style="text-align:center">${u.is_admin ? '✅' : ''}</td>
            <td style="text-align:right">
                ${u.username !== Auth.getInstance().getCurrentUser() ? `<button class="btn btn-sm danger del-user" data-username="${u.username}">${t('delete')}</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    secList.appendChild(table);

    // Форма добавления
    const secAdd = document.createElement('div');
    secAdd.className = 'form-section';
    secAdd.innerHTML = `<div class="form-title">${t('add_user')}</div>`;
    
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    
    const labName = document.createElement('label');
    labName.textContent = t('username');
    const inpName = document.createElement('input');
    inpName.type = 'text';
    
    const labPass = document.createElement('label');
    labPass.textContent = t('password_label');
    const inpPass = document.createElement('input');
    inpPass.type = 'password';
    
    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn primary';
    btnAdd.textContent = t('add');
    
    grid.appendChild(labName);
    grid.appendChild(inpName);
    grid.appendChild(labPass);
    grid.appendChild(inpPass);
    grid.appendChild(document.createElement('div'));
    grid.appendChild(btnAdd);
    
    secAdd.appendChild(grid);
    form.appendChild(secList);
    form.appendChild(secAdd);
    body.appendChild(form);

    // Listeners
    btnAdd.addEventListener('click', async () => {
        const username = inpName.value;
        const password = inpPass.value;
        if (!username || !password) return;
        try {
            setStatus('busy', '');
            await API.postForm('/auth/register', { username, password });
            showToast('ok', t('saved'));
            loadSectionData('users'); // Refresh
        } catch (e: any) {
            setStatus('error', e.message);
        }
    });

    tbody.querySelectorAll('.del-user').forEach(btn => {
        btn.addEventListener('click', async () => {
            const username = (btn as HTMLElement).getAttribute('data-username');
            if (!username) return;
            if (!confirm(`Delete user ${username}?`)) return;
            try {
                setStatus('busy', '');
                await API.postForm('/auth/delete', { username });
                showToast('ok', t('saved'));
                loadSectionData('users'); // Refresh
            } catch (e: any) {
                setStatus('error', e.message);
            }
        });
    });
}
