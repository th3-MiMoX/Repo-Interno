import { isAuthenticated } from './authService';
import { UploadDocumentModal } from './uploadDocumentModal';
import { getDocumentPreviewModal } from './documentPreviewModal';

const API_URL = import.meta.env.PUBLIC_API_URL;
const PAGE_SIZE = 9;
const ACENTOS_CATEGORIA = ['terracotta', 'brass', 'sage', 'slate'];
const EXTENSION_LABEL: Record<string, string> = { pdf: 'PDF', docx: 'DOC', xlsx: 'XLS' };

interface Categoria {
    uuid: string;
    nombre: string;
}

interface Documento {
    uuid: string;
    usuario_id: string;
    categoria_id: string;
    file_name: string;
    descripcion: string;
    activo: boolean;
    created_at: string;
}

interface PaginatedDocumentos {
    items: Documento[];
    total: number;
}

class ExpedientesManager {
    private categorias: Categoria[] = [];
    private categoriaActiva: string | null = null;
    private busqueda = '';
    private pagina = 0;
    private total = 0;

    async init(): Promise<void> {
        this.initBotonSubir();
        this.initBuscador();

        document.addEventListener('documento:subido', () => {
            this.pagina = 0;
            this.loadDocumentos();
        });

        this.categoriaActiva = window.location.hash ? window.location.hash.slice(1) : null;

        this.initAccionesGrid();

        await this.loadCategorias();
        await this.loadDocumentos();
    }

    // ---------- Visualizar documento ----------

    private initAccionesGrid(): void {
        const grid = document.querySelector<HTMLElement>('[data-documentos-grid]');
        if (!grid) return;

        grid.addEventListener('click', (e) => {
            const boton = (e.target as HTMLElement).closest<HTMLElement>('[data-accion="visualizar"]');
            if (!boton) return;

            e.preventDefault();
            const uuid = boton.dataset.uuid;
            const fileName = boton.dataset.fileName;
            if (!uuid || !fileName) return;

            getDocumentPreviewModal().open({
                fileName,
                url: `${API_URL}/index/document/${uuid}/download`,
            });
        });
    }

    // ---------- Subir documento (solo usuarios con sesión) ----------

    private initBotonSubir(): void {
        const uploadButton = document.querySelector<HTMLElement>('[data-abrir-modal-documento]');

        if (!isAuthenticated()) {
            // Sin sesión, ni el botón ni el modal deben existir para este usuario.
            uploadButton?.remove();
            return;
        }

        if (uploadButton) uploadButton.hidden = false;
        new UploadDocumentModal('modal-documento', '[data-abrir-modal-documento]').init();
    }

    // ---------- Búsqueda ----------

    private initBuscador(): void {
        const buscador = document.querySelector<HTMLInputElement>('[data-search-input]');
        let temporizador: ReturnType<typeof setTimeout>;

        buscador?.addEventListener('input', () => {
            clearTimeout(temporizador);
            temporizador = setTimeout(() => {
                this.busqueda = buscador.value.trim();
                this.pagina = 0;
                this.loadDocumentos();
            }, 300);
        });

        window.addEventListener('keydown', (evento) => {
            if (evento.key === '/' && document.activeElement !== buscador) {
                evento.preventDefault();
                buscador?.focus();
            }
        });
    }

    // ---------- Categorías ----------

    private async loadCategorias(): Promise<void> {
        try {
            const response = await fetch(`${API_URL}/index/categorias`);
            if (!response.ok) throw new Error(`Error HTTP ${response.status}`);

            this.categorias = await response.json();
            this.renderCategorias();
        } catch (err: unknown) {
            console.error('Error al cargar categorías:', err);
        }
    }

    private categoriaNombre(uuid: string): string {
        return this.categorias.find((c) => c.uuid === uuid)?.nombre ?? 'Sin categoría';
    }

    private categoriaAcento(uuid: string): string {
        const indice = this.categorias.findIndex((c) => c.uuid === uuid);
        return ACENTOS_CATEGORIA[indice >= 0 ? indice % ACENTOS_CATEGORIA.length : 0];
    }

    private renderCategorias(): void {
        const lista = document.getElementById('catList');
        if (!lista) return;

        const itemTodo = `
          <li>
            <a href="${window.location.pathname}" data-filter="" class="index__item ${this.categoriaActiva === null ? 'is-active' : ''}">
              <span class="index__dot index__dot--all" aria-hidden="true"></span>
              <span class="index__label">Todo el archivo</span>
            </a>
          </li>`;

        const itemsCategorias = this.categorias
            .map((cat, i) => {
                const acento = ACENTOS_CATEGORIA[i % ACENTOS_CATEGORIA.length];
                const activa = this.categoriaActiva === cat.uuid;
                return `
                  <li>
                    <a href="#${cat.uuid}" data-filter="${cat.uuid}" class="index__item acento-${acento} ${activa ? 'is-active' : ''}">
                      <span class="index__dot" aria-hidden="true"></span>
                      <span class="index__label">${cat.nombre}</span>
                    </a>
                  </li>`;
            })
            .join('');

        lista.innerHTML = itemTodo + itemsCategorias;

        lista.querySelectorAll<HTMLAnchorElement>('[data-filter]').forEach((enlace) => {
            enlace.addEventListener('click', (evento) => {
                evento.preventDefault();
                const uuid = enlace.dataset.filter || null;
                if (uuid === this.categoriaActiva) return;

                this.categoriaActiva = uuid;
                this.pagina = 0;
                history.pushState(null, '', uuid ? `#${uuid}` : window.location.pathname);
                this.renderCategorias();
                this.loadDocumentos();
            });
        });
    }

    // ---------- Documentos ----------

    private async loadDocumentos(): Promise<void> {
        const grid = document.querySelector<HTMLElement>('[data-documentos-grid]');
        if (!grid) return;

        grid.querySelectorAll('.card').forEach((tarjeta) => tarjeta.remove());

        try {
            const params = new URLSearchParams();
            params.set('skip', String(this.pagina * PAGE_SIZE));
            params.set('limit', String(PAGE_SIZE));
            if (this.categoriaActiva) params.set('categoria_id', this.categoriaActiva);
            if (this.busqueda) params.set('search', this.busqueda);

            const response = await fetch(`${API_URL}/index/documentos?${params.toString()}`);
            if (!response.ok) throw new Error(`Error HTTP ${response.status}`);

            const data: PaginatedDocumentos = await response.json();
            this.total = data.total;

            this.renderDocumentos(data.items);
            this.renderPaginacion();
            this.actualizarResumen();
        } catch (err: unknown) {
            console.error('Error al cargar documentos:', err);
            const vacio = grid.querySelector<HTMLElement>('[data-empty-state]');
            if (vacio) {
                vacio.hidden = false;
                vacio.textContent = 'No se pudieron cargar los expedientes. Intenta de nuevo más tarde.';
            }
        }
    }

    private renderDocumentos(items: Documento[]): void {
        const grid = document.querySelector<HTMLElement>('[data-documentos-grid]');
        if (!grid) return;

        const vacio = grid.querySelector<HTMLElement>('[data-empty-state]');

        if (items.length === 0) {
            if (vacio) {
                vacio.textContent = 'Ningún expediente coincide con la búsqueda o categoría seleccionada.';
                vacio.hidden = false;
            }
            return;
        }

        if (vacio) vacio.hidden = true;

        const tarjetas = items.map((doc) => this.renderTarjeta(doc)).join('');
        grid.insertAdjacentHTML('afterbegin', tarjetas);
    }

    private renderTarjeta(doc: Documento): string {
        const extension = (doc.file_name.split('.').pop() ?? '').toLowerCase();
        const titulo = doc.file_name.replace(/\.[a-z0-9]+$/i, '').replaceAll('_', ' ');
        const categoria = this.categoriaNombre(doc.categoria_id);
        const acento = this.categoriaAcento(doc.categoria_id);
        const fecha = new Date(doc.created_at).toLocaleDateString('es-CL', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
        const archivoUrl = `${API_URL}/index/document/${doc.uuid}/download`;

        return `
          <article class="card acento-${acento}${doc.activo ? '' : ' is-inactive'}">
            <div class="card__top">
              <span class="card__ext">${EXTENSION_LABEL[extension] ?? extension.toUpperCase()}</span>
            </div>

            <h3 class="card__title">${titulo}</h3>
            <p class="card__desc">${doc.descripcion}</p>

            <div class="card__tagrow">
              <span class="tag card__tag">${categoria}</span>
            </div>

            <dl class="card__meta">
              <div>
                <dt>Categoría</dt>
                <dd>${categoria}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>${fecha}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>${doc.activo ? 'Vigente' : 'Archivado'}</dd>
              </div>
            </dl>

            <div class="card__actions">
              <button type="button" class="card__action card__action--primary" data-accion="visualizar" data-uuid="${doc.uuid}" data-file-name="${doc.file_name}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>
                Visualizar
              </button>
              <a class="card__action" href="${archivoUrl}" download="${doc.file_name}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Descargar
              </a>
            </div>

            <span class="card__stamp" aria-hidden="true">${doc.activo ? 'Vigente' : 'Archivado'}</span>
          </article>`;
    }

    // ---------- Paginación ----------

    private renderPaginacion(): void {
        const nav = document.querySelector<HTMLElement>('[data-paginacion]');
        if (!nav) return;

        const totalPaginas = Math.max(1, Math.ceil(this.total / PAGE_SIZE));

        if (totalPaginas <= 1) {
            nav.innerHTML = '';
            return;
        }

        const botones: string[] = [];

        botones.push(
            `<button type="button" class="pagination__btn" data-pagina="${this.pagina - 1}" ${this.pagina === 0 ? 'disabled' : ''} aria-label="Página anterior">‹</button>`
        );

        for (let i = 0; i < totalPaginas; i++) {
            botones.push(
                `<button type="button" class="pagination__btn ${i === this.pagina ? 'is-active' : ''}" data-pagina="${i}">${i + 1}</button>`
            );
        }

        botones.push(
            `<button type="button" class="pagination__btn" data-pagina="${this.pagina + 1}" ${this.pagina >= totalPaginas - 1 ? 'disabled' : ''} aria-label="Página siguiente">›</button>`
        );

        nav.innerHTML = botones.join('');

        nav.querySelectorAll<HTMLButtonElement>('[data-pagina]').forEach((boton) => {
            boton.addEventListener('click', () => {
                const nuevaPagina = Number(boton.dataset.pagina);
                if (Number.isNaN(nuevaPagina) || nuevaPagina < 0 || nuevaPagina > totalPaginas - 1) return;
                if (nuevaPagina === this.pagina) return;

                this.pagina = nuevaPagina;
                this.loadDocumentos();
                document.querySelector('[data-documentos-grid]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    // ---------- Resumen de resultados ----------

    private actualizarResumen(): void {
        const countEl = document.querySelector('[data-result-count]');
        const scopeEl = document.querySelector('[data-result-scope]');
        const resultline = document.querySelector('.resultline');
        const heading = document.querySelector('[data-page-heading]');
        const eyebrow = document.querySelector('[data-page-eyebrow]');

        const nombreCategoria = this.categoriaActiva ? this.categoriaNombre(this.categoriaActiva) : '';

        if (countEl) countEl.textContent = String(this.total);
        if (scopeEl) scopeEl.textContent = nombreCategoria ? `en ${nombreCategoria}` : 'en el archivo';
        if (resultline) resultline.toggleAttribute('data-filtered', Boolean(nombreCategoria));
        if (heading) heading.textContent = nombreCategoria || 'Todos los expedientes';
        if (eyebrow) eyebrow.textContent = nombreCategoria || 'Vista general';
    }
}

document.addEventListener('DOMContentLoaded', () => { new ExpedientesManager().init(); });
