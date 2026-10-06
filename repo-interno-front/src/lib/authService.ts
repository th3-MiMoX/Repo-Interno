const API_URL = import.meta.env.PUBLIC_API_URL
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const PROFILE_CACHE_KEY = 'user_profile';

export interface JwtPayload {
    sub: string;
    es_admin: boolean;
    type: string;
    iat: number;
    exp:  number;
}

export interface UserProfile {
    uuid: string;
    username: string | null;
    nombre: string;
    apellido: string;
    es_admin: boolean;
    activo: boolean;
}

export function saveTokens(access_token:string, refresh_token:string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
}

export function getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void { 
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
    return getAccessToken() != null;
}

export function parseJwtPayload(token: string): JwtPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');

        const jsonString = atob(base64);
        return JSON.parse(jsonString) as JwtPayload;
    } catch {
        return null;
    }
}

export function isTokenExpired(token: string): boolean {
    const payload = parseJwtPayload(token);
    if (!payload) return true;

    const now = Date.now() / 1000;
    return payload.exp < now + 30;
}

export function logout(): void {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
        // Best-effort: revoca el refresh token en el servidor para que no pueda
        // seguir usándose tras el logout. `keepalive` evita que la petición se
        // cancele por la navegación que viene justo después; si falla (backend
        // caído, sin red) el logout local igual debe completarse.
        fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
            keepalive: true,
        }).catch(() => {});
    }

    clearTokens();
    clearProfileCache();
    window.location.href = "/";
}

export async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
        return null;
    }

    try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
            clearTokens();
            return null;
        }

        const data = await response.json();
        localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        return data.access_token;
    } catch (error) {
        console.error('Error al refrescar token: ', error);
        clearTokens();
        return null;
    }
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const accessToken = getAccessToken();

    if (!accessToken) {
        logout();
        throw new Error('No Autenticado');
    }

    const fullUrl = url.startsWith('http') ? url: `${API_URL}${url}`;
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);

    let response = await fetch(fullUrl, {...options, headers});

    if (response.status == 401) {
        const newToken = await refreshAccessToken();

        if (newToken) {
            headers.set('Authorization', `Bearer ${newToken}`);
            response = await fetch(fullUrl, {...options, headers});
        } else {
            logout();
            throw new Error('Sesión expirada. Inicia sesión nuevamente');
        }
    }

    return response;
}

// ==================== PERFIL DE USUARIO ====================
export function clearProfileCache(): void {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
}

export async function getUserProfile(forceRefresh = false): Promise<UserProfile | null> {
    // 1. Intentar leer del caché
    if (!forceRefresh) {
        const cached = sessionStorage.getItem(PROFILE_CACHE_KEY);
        if (cached) {
            try {
                return JSON.parse(cached) as UserProfile;
            } catch {
                // Caché corrupto — continuar al fetch
                clearProfileCache();
            }
        }
    }

    // 2. Consultar al backend
    try {
        const response = await authFetch('/users/me');
        if (!response.ok) {
            return null;
        }

        const profile: UserProfile = await response.json();

        // 3. Guardar en caché
        sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
        return profile;
    } catch (error){
        console.error('Error al obtener perfil:', error);
        return null;
    }
}