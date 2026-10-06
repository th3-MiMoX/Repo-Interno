import { requireAuth } from './authGuard';
import { authFetch, getUserProfile, type UserProfile } from './authService';
import { UploadDocumentModal } from './uploadDocumentModal';
import { EditDocumentModal } from './editDocumentModal';
import { CreateCategoryModal } from './createCategoryModal';
import { RegisterUserModal } from './registerUserModal';
import { getEditUserModal, type EditUserModal } from './editUserModal';
import { getDocumentPreviewModal } from './documentPreviewModal';
import { fetchCategorias, type CategoriaOption } from './categorias';

interface Usuario {
  uuid: string;
  username: string | null;
  nombre: string;
  apellido: string;
  es_admin: boolean;
  activo: boolean;
  updated_at: string;
}

interface CategoriaResponse {
    uuid: string;
    nombre: string;
}

interface UserDocumentResponse {
    uuid: string;
    file_name: string;
    categoria: CategoriaResponse | null;
    descripcion: string;
    activo: boolean;
    created_at: string;
    updated_at: string;
}

const ACENTOS_CATEGORIA = ['terracotta', 'brass', 'sage', 'slate'];

class DashboardManager {
    private profile: UserProfile | null = null;
    private usuarios: Usuario[] = [];
    private documentos: UserDocumentResponse[] = [];
    private editModal: EditDocumentModal | null = null;
    private editUserModal: EditUserModal | null = null;

    async init(): Promise<void> {
        await requireAuth();
        this.profile = await getUserProfile();
        if (!this.profile) {
            console.error('No se pudo obtener el perfil del usuario');
            return;
        }

        this.aplicarRestriccionesAdmin();
        this.initTabs();

        new UploadDocumentModal('modal-documento', '[data-abrir-modal-documento]').init();

        this.editModal = new EditDocumentModal('modal-editar-documento');
        this.editModal.init();

        // Refresca la tabla sin recargar la página cuando se sube o edita un documento.
        document.addEventListener('documento:subido', () => { this.loadDocuments(); });
        document.addEventListener('documento:actualizado', () => { this.loadDocuments(); });

        this.initAccionesTabla();
        await this.loadDocuments();

        if (this.profile?.es_admin) {
            new RegisterUserModal('modal-usuario', '[data-abrir-modal-usuario]').init();
            this.editUserModal = getEditUserModal();
            this.initAccionesTablaUsuarios();

            document.addEventListener('usuario:creado', () => { this.loadUsuarios(); });
            document.addEventListener('usuario:actualizado', () => { this.loadUsuarios(); });
            await this.loadUsuarios();

            new CreateCategoryModal('modal-categoria', '[data-abrir-modal-categoria]').init();
            document.addEventListener('categoria:creada', () => { this.loadCategoriasLista(); });
            await this.loadCategoriasLista();
        }
    }

    // ---------- Restricciones por rol ----------

    private aplicarRestriccionesAdmin(): void {
        if (this.profile?.es_admin) return;

        // Un colaborador sin permisos de administrador nunca debe recibir ni
        // el marcado ni los datos de las secciones administrativas.
        document.querySelectorAll('[data-admin-only]').forEach((el) => el.remove());
    }

    // ---------- Pestañas ----------

    private initTabs(): void {
        const botones = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'));
        const paneles = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'));

        botones.forEach((boton) => {
            boton.addEventListener('click', () => {
                botones.forEach((b) => b.classList.toggle('is-active', b === boton));
                paneles.forEach((panel) => {
                    panel.hidden = panel.dataset.panel !== boton.dataset.tab;
                });
            });
        });
    }

    // ---------- Documentos ----------

    private initAccionesTabla(): void {
        const cuerpo = document.querySelector<HTMLElement>('[data-documentos-body]');
        if (!cuerpo) return;

        // Delegación de eventos: las filas se reemplazan por completo en cada
        // render, así que un solo listener en el tbody evita tener que
        // re-adjuntar listeners individuales por fila.
        cuerpo.addEventListener('click', (e) => {
            const boton = (e.target as HTMLElement).closest<HTMLElement>('[data-accion]');
            if (!boton) return;

            const uuid = boton.dataset.uuid;
            if (!uuid) return;

            if (boton.dataset.accion === 'visualizar') this.abrirVisualizacion(uuid);
            if (boton.dataset.accion === 'editar') this.abrirEdicion(uuid);
            if (boton.dataset.accion === 'eliminar') this.deleteDocument(uuid);
        });
    }

    private abrirEdicion(uuid: string): void {
        const doc = this.documentos.find((d) => d.uuid === uuid);
        if (!doc || !this.editModal) return;
        this.editModal.open(doc);
    }

    private async abrirVisualizacion(uuid: string): Promise<void> {
        const doc = this.documentos.find((d) => d.uuid === uuid);
        if (!doc) return;

        try {
            // A diferencia de los expedientes públicos, aquí el archivo puede
            // estar archivado y la ruta exige el token de sesión, así que no
            // se puede usar la URL directamente en un <iframe>/<a>: hay que
            // pedirlo con authFetch y convertirlo en un blob: local.
            const response = await authFetch(`/dashboard/documents/${uuid}/download`);
            if (!response.ok) throw new Error(`Error HTTP ${response.status}`);

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            getDocumentPreviewModal().open({
                fileName: doc.file_name,
                url,
                revocar: true,
            });
        } catch (error) {
            console.error('Error al previsualizar el documento:', error);
            window.alert('No se pudo cargar el archivo para previsualizarlo.');
        }
    }

    private async loadDocuments(): Promise<void> {
        const cuerpo = document.querySelector<HTMLElement>('[data-documentos-body]');
        if (!cuerpo) return;

        cuerpo.innerHTML = `<tr><td colspan="5" class="table-empty">Cargando documentos…</td></tr>`;

        try {
            const response = await authFetch('/dashboard/documents/me');

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.detail ?? `Error ${response.status}`);
            }

            this.documentos = await response.json();
            this.renderDocumentos();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'No se pudieron cargar tus documentos.';
            console.error(err);
            cuerpo.innerHTML = `<tr><td colspan="5" class="table-empty table-empty--error">${msg}</td></tr>`;
            this.updateTotal(0);
        }
    }

    private renderDocumentos(): void {
        const cuerpo = document.querySelector<HTMLElement>('[data-documentos-body]');
        if (!cuerpo) return;

        if (this.documentos.length === 0) {
            cuerpo.innerHTML = `<tr><td colspan="5" class="table-empty">Todavía no has subido ningún documento.</td></tr>`;
            this.updateTotal(0);
            return;
        }

        cuerpo.innerHTML = this.documentos.map((doc) => this.renderRow(doc)).join('');
        this.updateTotal(this.documentos.length);
    }

    private renderRow(doc: UserDocumentResponse): string {
        const categoria = doc.categoria?.nombre ?? 'Sin categoría';
        const fecha = new Date(doc.created_at).toLocaleDateString('es-CL', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });

        return `
          <tr>
            <td>${doc.file_name}</td>
            <td>${categoria}</td>
            <td>${fecha}</td>
            <td><span class="status status--${doc.activo ? 'activo' : 'inactivo'}">${doc.activo ? 'Vigente' : 'Archivado'}</span></td>
            <td class="table-actions">
              <button type="button" class="icon-btn" data-accion="visualizar" data-uuid="${doc.uuid}" aria-label="Visualizar documento">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>
              </button>
              <button type="button" class="icon-btn" data-accion="editar" data-uuid="${doc.uuid}" aria-label="Editar documento">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button type="button" class="icon-btn icon-btn--danger" data-accion="eliminar" data-uuid="${doc.uuid}" aria-label="Eliminar documento">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </td>
          </tr>`;
    }

    private updateTotal(count: number): void {
        const contador = document.querySelector('[data-documentos-total]');
        if (contador) contador.textContent = String(count);
    }

    private async deleteDocument(uuid: string): Promise<void> {
        const doc = this.documentos.find((d) => d.uuid === uuid);
        const confirmado = window.confirm(
            `¿Eliminar "${doc?.file_name ?? 'este documento'}"? Esta acción no se puede deshacer.`
        );
        if (!confirmado) return;

        try {
            const response = await authFetch(`/dashboard/documents/${uuid}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const detail = errorData?.detail;
                throw new Error(typeof detail === 'string' ? detail : `Error ${response.status}`);
            }

            await this.loadDocuments();
        } catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : 'Error inesperado al eliminar el documento.';
            console.error('Error al eliminar documento:', error);
            window.alert(message);
        }
    }

    // ---------- Usuarios (solo administrador) ----------

    private initAccionesTablaUsuarios(): void {
        const cuerpo = document.querySelector<HTMLElement>('[data-usuarios-body]');
        if (!cuerpo) return;

        cuerpo.addEventListener('click', (e) => {
            const boton = (e.target as HTMLElement).closest<HTMLElement>('[data-accion]');
            if (!boton) return;

            const uuid = boton.dataset.uuid;
            if (!uuid) return;

            if (boton.dataset.accion === 'editar') this.abrirEdicionUsuario(uuid);
        });
    }

    private abrirEdicionUsuario(uuid: string): void {
        const usuario = this.usuarios.find((u) => u.uuid === uuid);
        if (!usuario || !this.editUserModal) return;

        this.editUserModal.open(usuario);
    }

    private async loadUsuarios(): Promise<void> {
        const cuerpo = document.querySelector<HTMLElement>('[data-usuarios-body]');
        if (!cuerpo) return;

        cuerpo.innerHTML = `<tr><td colspan="5" class="table-empty">Cargando usuarios…</td></tr>`;

        try {
            const response = await authFetch('/dashboard/users');

            if (!response.ok) {
                const error = await response.json().catch(() => null);
                throw new Error(error?.detail ?? `Error HTTP ${response.status}`);
            }

            this.usuarios = await response.json();
            this.renderUsuarios();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'No se pudieron cargar los usuarios.';
            console.error(err);
            cuerpo.innerHTML = `<tr><td colspan="5" class="table-empty table-empty--error">${msg}</td></tr>`;
            this.updateUsuariosTotal(0);
        }
    }

    private formatoFecha(iso: string): string {
        return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    private renderUsuarios(): void {
        const cuerpo = document.querySelector<HTMLElement>('[data-usuarios-body]');
        if (!cuerpo) return;

        if (this.usuarios.length === 0) {
            cuerpo.innerHTML = `<tr><td colspan="5" class="table-empty">No hay usuarios registrados.</td></tr>`;
            this.updateUsuariosTotal(0);
            return;
        }

        cuerpo.innerHTML = this.usuarios.map((u) => this.renderUsuarioRow(u)).join('');
        this.updateUsuariosTotal(this.usuarios.length);
    }

    private renderUsuarioRow(u: Usuario): string {
        return `
                       
            <tr>
                <td>
                    <div class="userline">
                        <p class="userline__nombre">${u.nombre} ${u.apellido}</p>
                        <p class="userline__username">@${u.username ?? '—'}</p>
                    </div>
                </td>
                <td><span class="tag tag--${u.es_admin ? 'admin' : 'colab'}">${u.es_admin ? 'Administrador' : 'Colaborador'}</span></td>
                <td><span class="status status--${u.activo ? 'activo' : 'inactivo'}">${u.activo ? 'Activo' : 'Desactivado'}</span></td>
                <td>${this.formatoFecha(u.updated_at)}</td>
                <td class="table-actions">
                    <button type="button" class="icon-btn" data-accion="editar" data-uuid="${u.uuid}" aria-label="Editar usuario">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </td>
            </tr>`;
            
    }

    private updateUsuariosTotal(count: number): void {
        const contador = document.querySelector('[data-usuarios-total]');
        if (contador) contador.textContent = String(count);
    }

    // ---------- Categorías (solo administrador) ----------

    private async loadCategoriasLista(): Promise<void> {
        const lista = document.querySelector<HTMLElement>('[data-categorias-lista]');
        if (!lista) return;

        lista.innerHTML = `<li class="table-empty">Cargando categorías…</li>`;

        try {
            const categorias = await fetchCategorias();
            this.renderCategorias(categorias);
        } catch (error) {
            console.error('Error al cargar categorías:', error);
            lista.innerHTML = `<li class="table-empty table-empty--error">No se pudieron cargar las categorías.</li>`;
            this.updateCategoriasTotal(0);
        }
    }

    private renderCategorias(categorias: CategoriaOption[]): void {
        const lista = document.querySelector<HTMLElement>('[data-categorias-lista]');
        if (!lista) return;

        if (categorias.length === 0) {
            lista.innerHTML = `<li class="table-empty">Todavía no hay categorías registradas.</li>`;
            this.updateCategoriasTotal(0);
            return;
        }

        lista.innerHTML = categorias
            .map((c, i) => {
                const acento = ACENTOS_CATEGORIA[i % ACENTOS_CATEGORIA.length];
                return `<li class="category-chip category-chip--${acento}">${c.nombre}</li>`;
            })
            .join('');
        this.updateCategoriasTotal(categorias.length);
    }

    private updateCategoriasTotal(count: number): void {
        const contador = document.querySelector('[data-categorias-total]');
        if (contador) contador.textContent = String(count);
    }
}

document.addEventListener('DOMContentLoaded', () => { new DashboardManager().init(); });
