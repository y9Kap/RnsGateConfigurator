import { API, isOffline, ApiError } from './api';
import { t } from './i18n';

export interface AuthStatus {
  authenticated: boolean;
  username?: string;
  is_admin?: boolean;
  no_users?: boolean;
}

export class Auth {
  private static instance: Auth;
  private app: HTMLElement | null = null;
  private onAuthenticated: (() => void) | null = null;
  private user: { username: string, is_admin: boolean } | null = null;

  private constructor() {
    this.app = document.getElementById('app');
    // Если любой запрос вернет 401, перекидываем на логин
    API.onUnauthorized(() => {
      this.user = null;
      this.renderLogin();
    });
  }

  public static getInstance(): Auth {
    if (!Auth.instance) {
      Auth.instance = new Auth();
    }
    return Auth.instance;
  }

  public isAdmin(): boolean {
    return this.user?.is_admin || false;
  }

  public getCurrentUser(): string | null {
    return this.user?.username || null;
  }

  public async checkAuth(callback: () => void) {
    this.onAuthenticated = callback;
    
    if (isOffline()) {
      // В оффлайн режиме пропускаем авторизацию, так как CGI недоступен
      callback();
      return;
    }

    try {
      // Проверяем статус авторизации через CGI
      const status = await API.get<AuthStatus>('/auth/status');
      if (status && status.authenticated) {
        this.user = { 
            username: status.username || '', 
            is_admin: status.is_admin === true || (status.is_admin as any) === 1 || (status.is_admin as any) === '1'
        };
        callback();
      } else {
        if (status && status.no_users) {
            // Если пользователей вообще нет — даем зарегистрировать первого (админа)
            this.renderRegister(true);
        } else {
            this.renderLogin();
        }
      }
    } catch (e: any) {
      // Если это ошибка 401 (Unauthorized) — показываем форму входа.
      // Если любая другая ошибка (сервер лежит, таймаут и т.д.) — 
      // считаем это оффлайн-режимом и пускаем в основное приложение.
      if (e instanceof ApiError && e.status === 401) {
        this.renderLogin();
      } else {
        console.warn('Auth check failed or server unreachable, proceeding in offline mode', e);
        callback();
      }
    }
  }

  private renderLogin() {
    if (!this.app) return;

    this.app.innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-header">
            <h1>${t('login_title')}</h1>
          </div>
          <form id="login-form" class="auth-form">
            <div class="auth-field">
              <label for="username">${t('username')}</label>
              <input type="text" id="username" required autocomplete="username">
            </div>
            <div class="auth-field">
              <label for="password">${t('password_label')}</label>
              <input type="password" id="password" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn primary">${t('login')}</button>
            <div id="auth-error" class="hint error" style="display: none;"></div>
          </form>
          <div class="auth-footer" id="auth-footer">
            <a href="#" id="go-to-register">${t('no_account')}</a>
          </div>
        </div>
      </div>
    `;

    const form = document.getElementById('login-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (document.getElementById('username') as HTMLInputElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;
      const errorEl = document.getElementById('auth-error') as HTMLElement;

      try {
        const res = await API.postForm<AuthStatus>('/auth/login', { username, password });
        this.user = { 
            username: res.username || username, 
            is_admin: res.is_admin === true || (res.is_admin as any) === 1 || (res.is_admin as any) === '1'
        };
        if (this.onAuthenticated) this.onAuthenticated();
      } catch (err: any) {
        errorEl.textContent = t('auth_error') + ': ' + (err.message || err);
        errorEl.style.display = 'block';
      }
    });

    const regLink = document.getElementById('go-to-register');
    regLink?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const status = await API.get<AuthStatus>('/auth/status');
        if (status && status.no_users) {
            this.renderRegister(true);
        } else {
            const footer = document.getElementById('auth-footer');
            if (footer) {
                footer.innerHTML = `<span class="hint">${t('registration_closed')}</span>`;
            }
        }
      } catch {
        this.renderRegister();
      }
    });
  }

  private renderRegister(isFirst: boolean = false) {
    if (!this.app) return;

    this.app.innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-header">
            <h1>${isFirst ? t('register') + ' (Admin)' : t('register')}</h1>
          </div>
          <form id="register-form" class="auth-form">
            <div class="auth-field">
              <label for="username">${t('username')}</label>
              <input type="text" id="username" required autocomplete="username">
            </div>
            <div class="auth-field">
              <label for="password">${t('password_label')}</label>
              <input type="password" id="password" required autocomplete="new-password">
            </div>
            <div class="auth-field">
              <label for="password_confirm">${t('password_confirm')}</label>
              <input type="password" id="password_confirm" required autocomplete="new-password">
            </div>
            <button type="submit" class="btn primary">${t('register')}</button>
            <div id="auth-error" class="hint error" style="display: none;"></div>
          </form>
          <div class="auth-footer">
            <a href="#" id="go-to-login">${t('have_account')}</a>
          </div>
        </div>
      </div>
    `;

    const form = document.getElementById('register-form') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (document.getElementById('username') as HTMLInputElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;
      const passwordConfirm = (document.getElementById('password_confirm') as HTMLInputElement).value;
      const errorEl = document.getElementById('auth-error') as HTMLElement;

      if (password !== passwordConfirm) {
        errorEl.textContent = t('pass_mismatch');
        errorEl.style.display = 'block';
        return;
      }

      try {
        const res = await API.postForm<AuthStatus>('/auth/register', { username, password });
        this.user = { 
            username: res.username || username, 
            is_admin: res.is_admin === true || (res.is_admin as any) === 1 || (res.is_admin as any) === '1'
        };
        if (this.onAuthenticated) this.onAuthenticated();
      } catch (err: any) {
        errorEl.textContent = t('reg_error') + ': ' + (err.message || err);
        errorEl.style.display = 'block';
      }
    });

    const loginLink = document.getElementById('go-to-login');
    loginLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.renderLogin();
    });
  }
}
