import { authFetch } from './authService';
import { loadCategoriasInto } from './categorias';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx'];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Encapsula el modal de "Subir documento": carga de categorías, validación
 * y envío a la API. Se reutiliza en dashboard.astro e index.astro — cada
 * página solo indica el id del modal y el selector del botón que lo abre.
 */
export class UploadDocumentModal {
    private modal: HTMLDialogElement;
    private form: HTMLFormElement;
    private categoriaSelect: HTMLSelectElement;
    private submitButton: HTMLButtonElement;
    private erroresList: HTMLElement;
    private triggerButton: HTMLElement | null;

    constructor(modalId: string, triggerSelector: string) {
        this.modal = document.getElementById(modalId) as HTMLDialogElement;
        this.form = this.modal.querySelector('[data-documento-form]') as HTMLFormElement;
        this.categoriaSelect = this.modal.querySelector('[data-categoria-select]') as HTMLSelectElement;
        this.submitButton = this.modal.querySelector('[data-documento-submit]') as HTMLButtonElement;
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

    private async open(): Promise<void> {
        this.form.reset();
        this.erroresList.innerHTML = '';
        this.modal.showModal();
        await loadCategoriasInto(this.categoriaSelect);
    }

    private setLoading(loading: boolean): void {
        this.submitButton.disabled = loading;
        this.submitButton.toggleAttribute('data-loading', loading);
    }

    private showErrors(errores: string[]): void {
        this.erroresList.innerHTML = errores.map((e) => `<li>${e}</li>`).join('');
    }

    private validate( descripcion: string, categoriaId: string, archivo: File | undefined): string[] {
        const errores: string[] = [];

        if (!descripcion.trim()) errores.push('La descripción es obligatoria.');
        if (!categoriaId) errores.push('Selecciona una categoría.');

        if (!archivo) {
            errores.push('Selecciona un archivo.');
        } else {
            const extension = archivo.name.slice(archivo.name.lastIndexOf('.')).toLowerCase();
            if (!ALLOWED_EXTENSIONS.includes(extension)) {
                errores.push('Formato no permitido. Usa PDF, DOCX o XLSX.');
            } else if (archivo.size > MAX_FILE_SIZE) {
                errores.push('El archivo no puede superar 15 MB.');
            }
        }

        return errores;
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

        const descripcion = (this.form.querySelector('[name="descripcion"]') as HTMLInputElement).value;
        const categoriaId = this.categoriaSelect.value;
        const archivo = (this.form.querySelector('[name="archivo"]') as HTMLInputElement).files?.[0];

        const errores = this.validate( descripcion, categoriaId, archivo );
        if (errores.length) {
            this.showErrors(errores);
            return;
        }
        this.showErrors([]);
        this.setLoading(true);

        try {
            const formData = new FormData();
            formData.append('descripcion', descripcion.trim());
            formData.append('categoria_id', categoriaId);
            formData.append('file', archivo as File);

            // OJO: no fijar Content-Type manualmente — el navegador debe
            // generar el boundary de multipart/form-data a partir de FormData.
            const response = await authFetch('/dashboard/documents', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(await this.parseErrorResponse(response));
            }

            const documento = await response.json();
            this.modal.close();
            document.dispatchEvent(new CustomEvent('documento:subido', { detail: documento }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo subir el documento.';
            this.showErrors([message]);
        } finally {
            this.setLoading(false);
        }
    }
}
