import { logout } from './authService';

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('[data-denied-logout]')?.addEventListener('click', () => {
        logout();
    });
});
