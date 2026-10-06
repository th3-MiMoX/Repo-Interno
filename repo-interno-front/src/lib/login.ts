import {
    saveTokens,
    getAccessToken,
}
from '@lib/authService';
const API_URL = import.meta.env.PUBLIC_API_URL;

class LoginManager {
    private form!: HTMLFormElement;
    private usernameInput!: HTMLInputElement;
    private passwordInput!: HTMLInputElement;
    private submitButton!: HTMLButtonElement;
    private loginError!: HTMLElement | null;

    async init(): Promise<void> {
        

        this.form = document.getElementById('loginForm') as HTMLFormElement;
        this.usernameInput = this.form.querySelector('[data-login-username]') as HTMLInputElement;
        this.passwordInput = this.form.querySelector('[data-login-password]') as HTMLInputElement;
        this.submitButton = this.form.querySelector('[data-login-submit]') as HTMLButtonElement;
        this.loginError = document.getElementById('login__error');

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        this.initLogin();
    }

    private initLogin(): void {
        const token = getAccessToken();

        if (token) {
            window.location.replace('/dashboard');
        }
    }

    // ==================== VALIDACIONES ====================
    private validateUsername(): boolean {
        const username = this.usernameInput.value.trim();
        const errorElement = this.usernameInput.nextElementSibling as HTMLElement;

        if (!username) {
            this.showError(this.usernameInput, errorElement, 'El usuario es requerido');
            return false;
        }

        this.hideError(this.usernameInput, errorElement);
        return true;

    }

    private validatePassword(): boolean {
        const password = this.passwordInput.value;
        const errorElement = this.passwordInput.nextElementSibling as HTMLElement;

        if (!password) {
            this.showError(this.passwordInput, errorElement, 'La contraseña es requerida');
            return false;
        }

        this.hideError(this.passwordInput, errorElement);
        return true;
    }

    // ==================== UI HELPERS ====================
    private showError(input: HTMLInputElement, errorElement: HTMLElement, message: string): void {
        input.classList.add('error');
        if (errorElement && errorElement.classList.contains('form-error')) {
            errorElement.textContent = message;
            errorElement.classList.add('active');
        }
    }

    private hideError(input: HTMLInputElement, errorElement: HTMLElement): void {
        input.classList.remove('error');
        if (errorElement && errorElement.classList.contains('form-error')) {
            errorElement.classList.remove('active');
        }
    }

    private showLoginError(message: string): void {
        if (!this.loginError) return;
        this.loginError.textContent = message;
        this.loginError.hidden = false;
    }

    private hideLoginError(): void {
        if (!this.loginError) return;
        this.loginError.hidden = true;
        this.loginError.textContent = '';
    }

    private setLoading(loading: boolean): void {
        this.submitButton.disabled = loading;
        this.submitButton.toggleAttribute('data-loading', loading);
    }

    private async handleSubmit(e: Event): Promise<void> {
        e.preventDefault();
        this.hideLoginError();

        const isUsernameValid = this.validateUsername();
        const isPasswordValid = this.validatePassword();

        if (!isUsernameValid || !isPasswordValid) {
            this.showLoginError('Usuario y contraseña son requeridos');
            return;
        }

        this.setLoading(true);

        try {
            await this.loginUsuario();
            window.location.replace('/dashboard');
        } catch (error) {
            console.error('Error en login:', error);
            const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión';
            this.showLoginError(message);
            this.setLoading(false);
        }
    }

    private async loginUsuario(): Promise<void> {
        const formData = new URLSearchParams();
        formData.append('username', this.usernameInput.value.trim());
        formData.append('password', this.passwordInput.value);

        const response = await fetch(`${API_URL}/auth/login`, {
            mode: 'cors',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',  // ← NO 'application/json'
            },
            body: formData.toString(),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);

            if (errorData?.detail) {
                if (typeof errorData.detail === "string") {
                    throw new Error(errorData.detail);
                }
                if (Array.isArray(errorData.detail)) {
                    const message = errorData.detail.map((err: any) => {
                        const field = err.loc?.slice(-1)[0] || 'campo';
                        return `${field}: ${err.msg}`;
                    });
                    throw new Error(message.join(", "));
                }
            }
            throw new Error(`Error HTTP ${response.status}`);
        }

        const data = await response.json();
        saveTokens(data.access_token, data.refresh_token);

        console.log('✅ Login exitoso');
    }
}

document.addEventListener('DOMContentLoaded', () => { new LoginManager().init(); });
