import { authFetch } from './authService';
import { loadCategoriasInto } from './categorias';

export interface EditableDocument {
    uuid: string;
    file_name: string;
    descripcion: string;
    categoria: { uuid: string; nombre: string } | null;
    activo: boolean;
}

/**
 * Modal de "Editar documento": solo permite cambiar descripción y categoría
 * (el archivo en sí no se reemplaza aquí, para eso existe "Subir documento").
 * A diferencia de UploadDocumentModal, este no tiene un botón disparador fijo
 * en el DOM — se abre programáticamente desde la fila de la tabla que
 * corresponda, pasándole los datos del documento a editar.
 */
export class EditDocumentModal {
    private modal: HTMLDialogElement;
    private form: HTMLFormElement;
    private categoriaSelect: HTMLSelectElement;
    private submitButton: HTMLButtonElement;
    private erroresList: HTMLElement;

    constructor(modalId: string) {
        this.modal = document.getElementById(modalId) as HTMLDialogElement;
        this.form = this.modal.querySelector('[data-editar-documento-form]') as HTMLFormElement;
        this.categoriaSelect = this.modal.querySelector('[data-categoria-select]') as HTMLSelectElement;
        this.submitButton = this.modal.querySelector('[data-editar-documento-submit]') as HTMLButtonElement;
        this.erroresList = this.modal.querySelector('[data-form-errores]') as HTMLElement;
    }

    init(): void {
        this.modal.querySelectorAll('[data-modal-cerrar]').forEach((boton) =>
            boton.addEventListener('click', () => this.modal.close())
        );

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    async open(doc: EditableDocument): Promise<void> {
        this.erroresList.innerHTML = '';
        (this.form.querySelector('[name="uuid"]') as HTMLInputElement).value = doc.uuid;
        (this.form.querySelector('[name="file_name"]') as HTMLInputElement).value = doc.file_name;
        (this.form.querySelector('[name="descripcion"]') as HTMLInputElement).value = doc.descripcion;
        (this.form.querySelector('[name="activo"]') as HTMLInputElement).checked = doc.activo;

        this.modal.showModal();
        await loadCategoriasInto(this.categoriaSelect, doc.categoria?.uuid);
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

        const uuid = (this.form.querySelector('[name="uuid"]') as HTMLInputElement).value;
        const file_name = (this.form.querySelector('[name="file_name"]') as HTMLInputElement).value.trim();
        const descripcion = (this.form.querySelector('[name="descripcion"]') as HTMLInputElement).value.trim();
        const categoriaId = this.categoriaSelect.value;
        const activo = (this.form.querySelector('[name="activo"]') as HTMLInputElement).checked;

        const errores: string[] = [];
        if (!file_name) errores.push('El nombre es obligatoria.');
        if (!descripcion) errores.push('La descripción es obligatoria.');
        if (!categoriaId) errores.push('Selecciona una categoría.');

        if (errores.length) {
            this.showErrors(errores);
            return;
        }
        this.showErrors([]);
        this.setLoading(true);

        try {
            const response = await authFetch(`/dashboard/documents/${uuid}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_name, descripcion, categoria_id: categoriaId, activo }),
            });

            if (!response.ok) {
                throw new Error(await this.parseErrorResponse(response));
            }

            const documento = await response.json();
            this.modal.close();
            document.dispatchEvent(new CustomEvent('documento:actualizado', { detail: documento }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo actualizar el documento.';
            this.showErrors([message]);
        } finally {
            this.setLoading(false);
        }
    }
}
