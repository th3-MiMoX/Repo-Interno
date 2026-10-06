const PREVIEWABLE_EXTENSIONS = new Set(['pdf']);

export interface PreviewTarget {
    fileName: string;
    url: string;
    /** true cuando `url` es un blob: creado con URL.createObjectURL, para liberarlo al cerrar. */
    revocar?: boolean;
}

/**
 * Modal de "Visualizar documento", compartido entre la página pública de
 * expedientes (URL directa, sin autenticación) y el historial del panel
 * (URL blob: obtenida vía `authFetch`, ya que un <iframe>/<a> no puede
 * enviar el header Authorization). Vive una sola vez dentro de <Header/>.
 */
export class DocumentPreviewModal {
    private modal: HTMLDialogElement;
    private body: HTMLElement;
    private downloadLink: HTMLAnchorElement;
    private nuevaPestanaLink: HTMLAnchorElement;
    private tituloEl: HTMLElement | null;
    private objectUrlActual: string | null = null;

    constructor(modalId: string) {
        this.modal = document.getElementById(modalId) as HTMLDialogElement;
        this.body = this.modal.querySelector('[data-doc-preview-body]') as HTMLElement;
        this.downloadLink = this.modal.querySelector('[data-doc-preview-download]') as HTMLAnchorElement;
        this.nuevaPestanaLink = this.modal.querySelector('[data-doc-preview-nueva-pestana]') as HTMLAnchorElement;
        this.tituloEl = this.modal.querySelector('[data-modal-titulo]');
    }

    init(): void {
        this.modal.querySelectorAll('[data-modal-cerrar]').forEach((boton) =>
            boton.addEventListener('click', () => this.modal.close())
        );

        this.modal.addEventListener('close', () => this.limpiar());
    }

    open(target: PreviewTarget): void {
        this.limpiar();

        if (target.revocar) this.objectUrlActual = target.url;

        if (this.tituloEl) this.tituloEl.textContent = target.fileName;
        this.downloadLink.href = target.url;
        this.downloadLink.setAttribute('download', target.fileName);
        this.nuevaPestanaLink.href = target.url;

        const extension = (target.fileName.split('.').pop() ?? '').toLowerCase();

        if (PREVIEWABLE_EXTENSIONS.has(extension)) {
            this.body.innerHTML = `<iframe src="${target.url}" title="Previsualización de ${target.fileName}"></iframe>`;
        } else {
            this.body.innerHTML = `
              <div class="doc-preview__fallback">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
                <p>La previsualización no está disponible para archivos .${extension.toUpperCase()}.</p>
                <p class="doc-preview__hint">Descárgalo o ábrelo en una pestaña nueva para verlo.</p>
              </div>`;
        }

        this.modal.showModal();
    }

    private limpiar(): void {
        this.body.innerHTML = '';
        if (this.objectUrlActual) {
            URL.revokeObjectURL(this.objectUrlActual);
            this.objectUrlActual = null;
        }
    }
}

let sharedInstance: DocumentPreviewModal | null = null;

/**
 * El modal vive una sola vez en el DOM (dentro de `<Header/>`), pero tanto
 * `index.ts` (expedientes públicos) como `dashboard.ts` (historial propio)
 * necesitan abrirlo. Este singleton evita instanciarlo dos veces, lo que
 * registraría los listeners de cierre por duplicado.
 */
export function getDocumentPreviewModal(): DocumentPreviewModal {
    if (!sharedInstance) {
        sharedInstance = new DocumentPreviewModal('modal-visualizar-documento');
        sharedInstance.init();
    }
    return sharedInstance;
}
