import {
    isAuthenticated,
    getUserProfile,
    logout,
    type UserProfile,
} from './authService';
import { getEditUserModal, type EditUserModal } from './editUserModal';

class HeaderManager {
    private profile: UserProfile | null = null;
    private logoutButton: HTMLElement | null = null;
    private dataUser: HTMLElement | null = null;
    private userAvatar: HTMLSpanElement | null = null;
    private profileButton: HTMLButtonElement | null = null;
    private editUserModal: EditUserModal | null = null;

    async init(): Promise<void> {
        this.logoutButton = document.getElementById('data-logout');
        this.logoutButton?.addEventListener('click', () => this.handleLogoutClick());

        this.dataUser = document.querySelector('[data-user]');
        this.userAvatar = document.querySelector('[data-user-avatar]');
        this.profileButton = document.querySelector('[data-abrir-editar-perfil]');

        if (!isAuthenticated()) {
            this.hideUserBlock();
            return;
        }

        await this.loadUserInfo();
    }

    private hideUserBlock(): void {
        if (this.userAvatar && this.dataUser) {
            this.dataUser.hidden = true
            this.userAvatar.style.setProperty('display', 'none', 'important');
        }
        this.profileButton?.style.setProperty('display', 'none', 'important');
    }

    private async loadUserInfo(): Promise<void> {
        this.profile = await getUserProfile();

        if (!this.profile) {
            // No se pudo obtener el perfil (backend no disponible, sesión
            // inválida, etc.) — no dejamos el bloque con los placeholders.
            this.hideUserBlock();
            return;
        }

        this.renderUserInfo();
        this.initEditarPerfil();
    }

    private renderUserInfo(): void {
        if (!this.profile) return;

        const nombreEl = document.querySelector('[data-user-name]');
        const rolEl = document.querySelector('[data-user-role]');
        const avatarEl = document.querySelector('[data-user-avatar]');

        if (nombreEl) nombreEl.textContent = `${this.profile.nombre} ${this.profile.apellido}`;
        if (rolEl) rolEl.textContent = this.profile.es_admin ? 'Administrador' : 'Colaborador';
        if (avatarEl) avatarEl.textContent = this.iniciales(this.profile.nombre, this.profile.apellido);
    }

    /** Se ejecuta una sola vez tras la primera carga del perfil. */
    private initEditarPerfil(): void {
        this.editUserModal = getEditUserModal();

        this.profileButton?.addEventListener('click', () => {
            if (!this.profile) return;
            this.editUserModal?.open({
                uuid: this.profile.uuid,
                username: this.profile.username,
                nombre: this.profile.nombre,
                apellido: this.profile.apellido,
                es_admin: this.profile.es_admin,
                activo: this.profile.activo,
            });
        });

        document.addEventListener('usuario:actualizado', (e) => {
            const actualizado = (e as CustomEvent).detail;
            if (!actualizado || actualizado.uuid !== this.profile?.uuid) return;

            this.profile = { ...this.profile, ...actualizado };
            this.renderUserInfo();
        });
    }

    private iniciales(nombre: string, apellido: string): string {
        return `${nombre[0] ?? ''}${apellido[0] ?? ''}`.toUpperCase();
    }

    private handleLogoutClick(): void {
        if (isAuthenticated()) {
            logout();
        } else {
            window.location.href = '/login';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { new HeaderManager().init(); });
