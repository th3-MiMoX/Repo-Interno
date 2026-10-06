import { authFetch } from './authService';

/** Modal de "Nuevo usuario", solo para administradores. */
export class RegisterUserModal {
    private modal: HTMLDialogElement;
    private form: HTMLFormElement;
    private submitButton: HTMLButtonElement;
    private erroresList: HTMLElement;
    private triggerButton: HTMLElement | null;

    constructor(modalId: string, triggerSelector: string) {
        this.modal = document.getElementById(modalId) as HTMLDialogElement;
        this.form = this.modal.querySelector('[data-usuario-form]') as HTMLFormElement;
        this.submitButton = this.modal.querySelector('[data-usuario-submit]') as HTMLButtonElement;
        this.erroresList = this.modal.querySelector('[data-form-errores]') as HTMLElement;
        this.triggerButton = document.querySelector(triggerSelector);
    }

    init(): void {
        this.triggerButton?.addEventListener('click', () => this.open());

        this.modal.querySelectorAll('[data-modal-cerrar]').forEach((boton) =>
            boton.addEventListener('click', () => this.modal.close())
        );

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    private open(): void {
        this.form.reset();
        (this.form.querySelector('[name="activo"]') as HTMLInputElement).checked = true;
        this.erroresList.innerHTML = '';
        this.modal.showModal();
    }

    private setLoading(loading: boolean): void {
        this.submitButton.disabled = loading;
        this.submitButton.toggleAttribute('data-loading', loading);
    }

    private showErrors(errores: string[]): void {
        this.erroresList.innerHTML = errores.map((e) => `<li>${e}</li>`).join('');
    }

    private async parseErrorResponse(response: Response): Promise<string> {
        const errorData = await response.json().catch(() => null);

        if (Array.isArray(errorData?.detail)) {
            return errorData.detail
                .map((err: any) => `${err.loc?.slice(-1)[0] ?? 'campo'}: ${err.msg}`)
                .join(', ');
        }

        return errorData?.detail ?? `Error HTTP ${response.status}`;
    }

    private async handleSubmit(e: Event): Promise<void> {
        e.preventDefault();

        const username = (this.form.querySelector('[name="username"]') as HTMLInputElement).value.trim();
        const nombre = (this.form.querySelector('[name="nombre"]') as HTMLInputElement).value.trim();
        const apellido = (this.form.querySelector('[name="apellido"]') as HTMLInputElement).value.trim();
        const password = (this.form.querySelector('[name="password"]') as HTMLInputElement).value;
        const esAdmin = (this.form.querySelector('[name="es_admin"]') as HTMLInputElement).checked;
        const activo = (this.form.querySelector('[name="activo"]') as HTMLInputElement).checked;

        const errores: string[] = [];
        if (username.length < 9 || username.length > 10) errores.push('El usuario debe tener entre 9 y 10 caracteres.');
        if (!nombre) errores.push('El nombre es obligatorio.');
        if (!apellido) errores.push('El apellido es obligatorio.');
        if (!password) errores.push('La contraseña es obligatoria.');

        if (errores.length) {
            this.showErrors(errores);
            return;
        }
        this.showErrors([]);
        this.setLoading(true);

        try {
            const response = await authFetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    nombre,
                    apellido,
                    password,
                    es_admin: esAdmin,
                    activo,
                }),
            });

            if (!response.ok) {
                throw new Error(await this.parseErrorResponse(response));
            }

            const usuario = await response.json();
            this.modal.close();
            document.dispatchEvent(new CustomEvent('usuario:creado', { detail: usuario }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo crear el usuario.';
            this.showErrors([message]);
        } finally {
            this.setLoading(false);
        }
    }
}
