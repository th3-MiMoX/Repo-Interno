import {
    getAccessToken,
    parseJwtPayload,
    isTokenExpired,
    refreshAccessToken,
    logout,
    type JwtPayload,
} from './authService';

export async function requireAuth(...allowedRoles:string[]): Promise<JwtPayload> {
    let token = getAccessToken();
    if (!token) {
        window.location.href="/";
        throw new Error("No autenticado");
    }

    if (isTokenExpired(token)) {
        const newToken = await refreshAccessToken();
        if (!newToken) {
            logout();
            throw new Error("Sesión expira");
        }
        token = newToken;
    }

    const payload = parseJwtPayload(token);
    if (!payload) {
        logout();
        throw new Error("Token invalido");
    }

    const hasRole = checkRole(payload, allowedRoles);
    if (!hasRole) {
        window.location.href = "/unauthorized";
        throw new Error("Acceso denegado: rol insuficiente");
    }

    return payload;
}

function checkRole(payload: JwtPayload, allowedRoles: string[]): boolean {
    if (allowedRoles.length === 0) {
        return true;
    }

    const userRole = payload.es_admin ? 'admin' : 'colaborador';
    return allowedRoles.includes(userRole);
}