import { authFetch } from './authService';

/** Modal de "Nueva categoría", solo para administradores. */
export class CreateCategoryModal {
    private modal: HTMLDialogElement;
    private form: HTMLFormElement;
    private submitButton: HTMLButtonElement;
    private erroresList: HTMLElement;
    private triggerButton: HTMLElement | null;

    constructor(modalId: string, triggerSelector: string) {
        this.modal = document.getElementById(modalId) as HTMLDialogElement;
        this.form = this.modal.querySelector('[data-categoria-form]') as HTMLFormElement;
        this.submitButton = this.modal.querySelector('[data-categoria-submit]') as HTMLButtonElement;
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

        const nombre = (this.form.querySelector('[name="nombre"]') as HTMLInputElement).value.trim();

        if (!nombre) {
            this.showErrors(['El nombre de la categoría es obligatorio.']);
            return;
        }
        this.showErrors([]);
        this.setLoading(true);

        try {
            const response = await authFetch('/dashboard/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre }),
            });

            if (!response.ok) {
                throw new Error(await this.parseErrorResponse(response));
            }

            const categoria = await response.json();
            this.modal.close();
            document.dispatchEvent(new CustomEvent('categoria:creada', { detail: categoria }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo crear la categoría.';
            this.showErrors([message]);
        } finally {
            this.setLoading(false);
        }
    }
}
