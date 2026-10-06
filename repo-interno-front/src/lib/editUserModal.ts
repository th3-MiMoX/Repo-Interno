import { authFetch, clearProfileCache, getUserProfile } from './authService';

export interface EditableUser {
    uuid: string;
    username: string | null;
    nombre: string;
    apellido: string;
    es_admin: boolean;
    activo: boolean;
}

/**
 * Modal de "Editar usuario", compartido entre dos contextos, según el rol de
 * quien lo abre (no de a quién edita):
 * - Un administrador: ve rol/estado editables y un solo campo para
 *   restablecer la contraseña de la cuenta (propia o de otra persona), y
 *   guarda vía `PATCH /users/edit-user/{uuid}`.
 * - Un usuario sin permisos: ve rol/estado solo informativos (deshabilitados)
 *   y, si quiere cambiar su propia contraseña, debe indicar la actual, la
 *   nueva y su confirmación; guarda vía `PATCH /users/me/{uuid}`.
 * Vive una sola vez dentro de <Header/>, presente en toda página autenticada,
 * y se abre tanto desde ahí (autoedición) como desde la tabla de usuarios
 * del panel (edición por un administrador).
 */
export class EditUserModal {
    private modal: HTMLDialogElement;
    private form: HTMLFormElement;
    private submitButton: HTMLButtonElement;
    private erroresList: HTMLElement;
    private camposAdmin: HTMLElement;
    private username: HTMLInputElement;
    private esAdminCheckbox: HTMLInputElement;
    private activoCheckbox: HTMLInputElement;
    private campoPasswordAutoedicion: HTMLElement;
    private campoPasswordAdmin: HTMLElement;
    private actorEsAdmin = false;
    private esUnoMismo = false;
    private targetUuid = '';

    constructor(modalId: string) {
        this.modal = document.getElementById(modalId) as HTMLDialogElement;
        this.form = this.modal.querySelector('[data-editar-usuario-form]') as HTMLFormElement;
        this.submitButton = this.modal.querySelector('[data-editar-usuario-submit]') as HTMLButtonElement;
        this.erroresList = this.modal.querySelector('[data-form-errores]') as HTMLElement;
        this.camposAdmin = this.modal.querySelector('[data-campos-admin]') as HTMLElement;
        this.username = this.form.querySelector('[name="username"]') as HTMLInputElement;
        this.esAdminCheckbox = this.form.querySelector('[name="es_admin"]') as HTMLInputElement;
        this.activoCheckbox = this.form.querySelector('[name="activo"]') as HTMLInputElement;
        this.campoPasswordAutoedicion = this.modal.querySelector('[data-campos-password-autoedicion]') as HTMLElement;
        this.campoPasswordAdmin = this.modal.querySelector('[data-campo-password-admin]') as HTMLElement;
    }

    init(): void {
        this.modal.querySelectorAll('[data-modal-cerrar]').forEach((boton) =>
            boton.addEventListener('click', () => this.modal.close())
        );

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    async open(usuario: EditableUser): Promise<void> {
        this.erroresList.innerHTML = '';
        this.targetUuid = usuario.uuid;

        const actor = await getUserProfile();
        this.actorEsAdmin = actor?.es_admin ?? false;
        this.esUnoMismo = actor?.uuid === usuario.uuid;

        (this.form.querySelector('[name="uuid"]') as HTMLInputElement).value = usuario.uuid;
        (this.form.querySelector('[name="username"]') as HTMLInputElement).value = usuario.username ?? '';
        (this.form.querySelector('[name="nombre"]') as HTMLInputElement).value = usuario.nombre;
        (this.form.querySelector('[name="apellido"]') as HTMLInputElement).value = usuario.apellido;

        this.esAdminCheckbox.checked = usuario.es_admin;
        this.activoCheckbox.checked = usuario.activo;
        this.username.disabled = !this.actorEsAdmin;
        this.esAdminCheckbox.disabled = !this.actorEsAdmin;
        this.activoCheckbox.disabled = !this.actorEsAdmin;

        (this.form.querySelector('[name="old_password"]') as HTMLInputElement).value = '';
        (this.form.querySelector('[name="new_password_self"]') as HTMLInputElement).value = '';
        (this.form.querySelector('[name="confirm_password"]') as HTMLInputElement).value = '';
        (this.form.querySelector('[name="new_password_admin"]') as HTMLInputElement).value = '';

        this.camposAdmin.hidden = !this.actorEsAdmin;
        this.campoPasswordAdmin.hidden = !this.actorEsAdmin;
        this.campoPasswordAutoedicion.hidden = this.actorEsAdmin;

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
        const apellido = (this.form.querySelector('[name="apellido"]') as HTMLInputElement).value.trim();
        
        const errores: string[] = [];

        if (!nombre) errores.push('El nombre es obligatorio.');
        if (!apellido) errores.push('El apellido es obligatorio.');
        
        const body: Record<string, unknown> = { nombre, apellido };
        let url: string;
        
        if (this.actorEsAdmin) {
            body.es_admin = this.esAdminCheckbox.checked;
            body.activo = this.activoCheckbox.checked;
            
            const username = (this.form.querySelector('[name="username"]') as HTMLInputElement).value.trim();
            const nuevaPassword = (this.form.querySelector('[name="new_password_admin"]') as HTMLInputElement).value;
            
            if (username) body.username = username;
            if (nuevaPassword) body.new_password = nuevaPassword;

            url = `/users/edit-user/${this.targetUuid}`;
        } else {

            const oldPassword = (this.form.querySelector('[name="old_password"]') as HTMLInputElement).value;
            const newPassword = (this.form.querySelector('[name="new_password_self"]') as HTMLInputElement).value;
            const confirmPassword = (this.form.querySelector('[name="confirm_password"]') as HTMLInputElement).value;

            const algunaPassword = oldPassword || newPassword || confirmPassword;
            if (algunaPassword) {
                if (!oldPassword || !newPassword || !confirmPassword) {
                    errores.push('Para cambiar tu contraseña completa los tres campos de contraseña.');
                } else if (newPassword !== confirmPassword) {
                    errores.push('La nueva contraseña y su confirmación no coinciden.');
                } else {
                    body.old_password = oldPassword;
                    body.new_password = newPassword;
                    body.confirm_password = confirmPassword;
                }
            }
            url = `/users/me/${this.targetUuid}`;
        }
        
        if (errores.length) {
            this.showErrors(errores);
            return;
        }
        this.showErrors([]);
        this.setLoading(true);

        try {
            const response = await authFetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                throw new Error(await this.parseErrorResponse(response));
            }

            const usuario = await response.json();
            this.modal.close();

            if (!this.actorEsAdmin) {
                // El perfil propio cambió: limpiar el caché para que el header
                // y cualquier otra vista lo recarguen con los datos frescos.
                clearProfileCache();
            }

            document.dispatchEvent(new CustomEvent('usuario:actualizado', { detail: usuario }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo actualizar el usuario.';
            this.showErrors([message]);
        } finally {
            this.setLoading(false);
        }
    }
}

let sharedInstance: EditUserModal | null = null;

/**
 * El modal vive una sola vez en el DOM (dentro de `<Header/>`), pero tanto
 * `header.ts` (autoedición) como `dashboard.ts` (edición por un
 * administrador) necesitan abrirlo. Este singleton evita instanciarlo dos
 * veces, lo que registraría los listeners de envío/cierre por duplicado.
 */
export function getEditUserModal(): EditUserModal {
    if (!sharedInstance) {
        sharedInstance = new EditUserModal('modal-editar-perfil');
        sharedInstance.init();
    }
    return sharedInstance;
}
