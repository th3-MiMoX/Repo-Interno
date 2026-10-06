# Repo Interno — Repositorio Documental Interno

Sistema web full-stack para **publicar, clasificar, buscar y descargar documentación interna** de una organización (actas, resoluciones, informes, etc.), con control de acceso por roles. Pensado como un archivo documental de consulta y auditoría: cada expediente conserva su categoría, autor, fecha y estado de vigencia.

> Proyecto de portafolio. Backend en **FastAPI** + frontend en **Astro**, con autenticación JWT (access + refresh token con revocación en logout).

---

## Funcionalidades

**Consulta pública (sin sesión)**
- Listado de expedientes en tarjetas, con paginación.
- Búsqueda por nombre/descripción y filtro por categoría.
- Visualización y descarga de documentos vigentes (PDF, DOCX, XLSX).

**Usuarios autenticados (Colaborador)**
- Inicio de sesión con renovación silenciosa de sesión (refresh token).
- Subir documentos, y editar o eliminar los propios.
- Historial personal de documentos en el panel.
- Edición del propio perfil.

**Administradores**
- Alta, edición y activación/desactivación de cuentas de usuario (el registro público está deshabilitado a propósito: las cuentas las asigna un administrador).
- Gestión de categorías de documentos.

---

## Tecnologías

| Capa | Tecnologías |
| --- | --- |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic Settings, PyJWT, Argon2 (hash de contraseñas), Uvicorn |
| **Base de datos** | MySQL (vía PyMySQL), IDs en `BINARY(16)` (UUID) |
| **Frontend** | Astro 7, TypeScript, CSS propio (sin framework de UI) |
| **Gestión de paquetes** | `uv` (backend), `pnpm` (frontend) |

---

## Arquitectura y decisiones destacadas

```
┌────────────────────┐   fetch + Bearer JWT   ┌──────────────────────┐      ┌─────────┐
│  Astro (frontend)  │ ─────────────────────▶ │  FastAPI (backend)   │ ───▶ │  MySQL  │
│  páginas + TS libs │ ◀───────────────────── │  routers por dominio │      └─────────┘
└────────────────────┘                        └──────────┬───────────┘
                                                         ▼
                                              Sistema de archivos (documentos)
```

- **Autenticación JWT con dos tokens**: access token de corta duración (configurable) y refresh token con `jti`. Al cerrar sesión, el `jti` se guarda en la tabla `revoked_refresh_token` y `/auth/refresh` rechaza tokens revocados, de modo que el logout invalida la sesión también en el servidor.
- **Autorización por rol** tanto en la API (dependencias `get_current_user` / `get_current_active_admin`) como en el frontend (`authGuard`, secciones `data-admin-only`).
- **Contraseñas** con Argon2id y re-hash automático cuando cambian los parámetros.
- **Subida de archivos segura**: validación cruzada de `Content-Type` y extensión, límite de tamaño y nombres generados en disco (nunca el que envía el cliente) para evitar path traversal.
- **Migraciones versionadas** con Alembic.
- **Configuración por variables de entorno** validadas con Pydantic Settings; ningún secreto vive en el código.
- Diseño visual propio de "archivo documental" (tipografías Fraunces / Newsreader / IBM Plex Mono, paleta papel + tinta + sellos), incluida una página `/unauthorized` temática.

---

## Estructura del repositorio

```
.
├── repo-interno-api/            # Backend FastAPI
│   ├── main.py                  # Punto de entrada, CORS y routers
│   ├── auth/                    # Login, refresh, logout, JWT, dependencias de auth
│   ├── dashboard/               # Documentos y categorías (usuarios autenticados)
│   ├── index/                   # Endpoints públicos de consulta/descarga
│   ├── user/                    # Perfil y administración de usuarios
│   ├── database/                # Modelos, conexión y configuración
│   ├── schemas/                 # Esquemas Pydantic
│   ├── alembic/                 # Migraciones
│   └── .env.example
└── repo-interno-front/          # Frontend Astro
    ├── src/pages/               # index, login, dashboard, unauthorized
    ├── src/components/          # Header, Sidebar, modales, buscador…
    ├── src/lib/                 # Lógica TS (auth, dashboard, index…)
    ├── src/styles/              # CSS por vista
    └── .env.example
```

---

## Puesta en marcha local

### Requisitos
- Python ≥ 3.12 y [`uv`](https://docs.astral.sh/uv/)
- Node ≥ 22.12 y [`pnpm`](https://pnpm.io/)
- MySQL en ejecución

### 1. Backend

```bash
cd repo-interno-api
cp .env.example .env        # completa credenciales de MySQL y genera los secretos JWT
uv sync
uv run alembic upgrade head # crea las tablas
uv run python main.py       # http://localhost:8000  (docs interactivas en /docs)
```

> `POST /auth/register` exige un administrador autenticado, por lo que **el primer administrador debe crearse directamente en la base de datos**. Por ejemplo, desde `repo-interno-api`:
>
> ```bash
> uv run python -c "
> from database.connect_db import SessionLocaL
> from database.models import Usuario
> from auth.security import hash_password
> db = SessionLocaL()
> db.add(Usuario(username='admin0001', nombre='Admin', apellido='Inicial',
>                password=hash_password('CambiaEsto123!'), es_admin=True))
> db.commit()
> "
> ```
> Cambia la contraseña después de iniciar sesión por primera vez.

### 2. Frontend

```bash
cd repo-interno-front
cp .env.example .env        # PUBLIC_API_URL=http://localhost:8000
pnpm install
pnpm dev                    # http://localhost:4321
```

---

## Principales endpoints de la API

| Área | Método y ruta | Acceso |
| --- | --- | --- |
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout` | Público |
| Auth | `POST /auth/register` | Admin |
| Público | `GET /index/categorias`, `/index/documentos` | Público |
| Público | `GET /index/document/{uuid}/download` | Público (solo vigentes) |
| Panel | `GET/POST /dashboard/documents`, `GET /dashboard/documents/me` | Autenticado |
| Panel | `PATCH/DELETE /dashboard/documents/{uuid}`, `GET …/{uuid}/download` | Autenticado (propietario) |
| Panel | `GET/POST /dashboard/categories`, `PATCH/DELETE` de categoría | Admin (escritura) |
| Panel | `GET /dashboard/users` | Admin |
| Usuarios | `GET /users/me`, `PATCH /users/me/{uuid}` | Autenticado |
| Usuarios | `PATCH /users/edit-user/{uuid}` | Admin |

La documentación interactiva completa (OpenAPI) está disponible en `http://localhost:8000/docs` con el backend corriendo.

---

## Seguridad y datos sensibles

El repositorio **no incluye** archivos `.env`, secretos, documentos subidos ni entornos virtuales (ver `.gitignore`). Usa los `.env.example` como plantilla y genera tus propios secretos JWT.

---

Por **Th3-MiMoX**.
