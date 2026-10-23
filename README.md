# Hyra Docker Manager

Hyra Docker Manager es una aplicación de escritorio construida con **Next.js + Electron** para la gestión, monitorización y conexión a instancias y entornos de Docker, con un módulo integrado de **Planner** que genera planes técnicos a partir de tickets de Jira usando modelos de IA.

## 🚀 Tecnologías Principales

- **Frontend**: Next.js 16 (App Router), React, Tailwind CSS v4.
- **UI Components**: Shadcn UI, Lucide React.
- **Escritorio**: Electron 36.
- **Terminal y Conectividad**: xterm.js, ssh2, sftp.
- **Integraciones**: Atlassian Jira/Confluence, GitHub, Bitbucket.
- **IA**: Anthropic Claude, OpenAI GPT, Google Gemini, MiniMax.
- **Base de Datos**: MySQL (mysql2).

## 📁 Estructura del Proyecto

```text
hyra-docker-manager/
├── app/                        # Rutas y vistas de Next.js (App Router)
│   ├── actions/                # Acciones de servidor (Server Actions)
│   ├── api/                    # Endpoints del API de Next.js
│   │   ├── ssh/                # SSH (conectar, exec, shell, status, docker-stats)
│   │   └── planner/            # generate, preview, search, models
│   ├── instancias/             # Rutas para gestión de instancias
│   ├── login/                  # Vistas de autenticación
│   ├── planner/                # Página del módulo Planner
│   ├── layout.tsx              # Layout principal de la aplicación
│   └── page.tsx                # Dashboard
├── components/
│   ├── ui/                     # Componentes Shadcn (button, input)
│   ├── planner/                # Componentes del módulo Planner
│   │   ├── PlannerForm.tsx     # Layout de dos columnas + estado
│   │   ├── PlannerSettingsDialog.tsx # Dialog de credenciales y repos
│   │   ├── GeneratePlanDialog.tsx    # Dialog pre-generación
│   │   ├── ModelSelector.tsx        # Dropdown de modelos con estado de conexión
│   │   ├── IssuePreview.tsx     # Vista previa del issue
│   │   └── PlanOutput.tsx       # Render del plan en markdown
│   └── panels/                 # Paneles principales (Detalle, SSH, SQL, etc.)
├── electron/
│   ├── main.mjs                # Proceso principal de Electron
│   └── preload.mjs             # Script de precarga (ipcRenderer)
├── lib/
│   ├── jira-client.ts          # Cliente Jira (issues, ADF → texto, adjuntos)
│   ├── confluence-client.ts    # Cliente Confluence (páginas)
│   ├── attachment-reader.ts    # Lector de adjuntos (texto, PDF, imágenes)
│   ├── repo-client.ts          # Lector de repositorios (local, GitHub, Bitbucket)
│   ├── prompt-builder.ts       # Construye el prompt para el modelo de IA
│   ├── ai-router.ts            # Enruta a Claude / GPT / Gemini / MiniMax
│   ├── planner-settings.ts     # Persistencia en localStorage (credenciales, repos)
│   ├── git-*.ts                # Interfaz y utilidades para Git
│   ├── mysql-*.ts              # Cliente y gestión de consultas MySQL
│   ├── sftp-*.ts               # Gestión y transferencia de archivos por SFTP
│   ├── ssh-*.ts                # Cliente SSH y terminal integrado (xterm)
│   └── types.ts                # Definiciones de tipos de TypeScript
├── public/                     # Archivos estáticos y recursos visuales
├── scripts/                    # Scripts de compilación, versionado y empaquetado
├── .env.example                # Plantilla de variables de entorno
└── package.json                # Dependencias y scripts de Node.js
```

## 🛠️ Requisitos Previos

- [Node.js](https://nodejs.org/) (v20 o superior).
- Un gestor de paquetes (`npm`, `pnpm` o `yarn`).

## 📦 Instalación

1. Clona el repositorio e instala las dependencias:

```bash
npm install
# o con pnpm
pnpm install
```

2. Configura las variables de entorno si es necesario:

```bash
cp .env.example .env.local
```

## 💻 Desarrollo

```bash
npm run dev          # Solo Next.js en navegador
npm run desktop      # Next.js + ventana de Electron (desarrollo)
```

## 🏗️ Construcción y Empaquetado

```bash
npm run desktop:build   # Instalador de Windows (incrementa versión patch)
npm run desktop:pack    # Ejecutable sin instalador
```

> Los archivos compilados se generan en `release/`.

## 📜 Scripts Disponibles

- `npm run lint`: Ejecuta ESLint.
- `npm run bump-version`: Actualiza la versión en `package.json`.
- `npm run start`: Inicia Next.js en modo producción (solo web).

---

## 🤖 Módulo Planner

Genera planes técnicos con estimación de horas a partir de tickets de Jira. Usa IA para leer la descripción del ticket, documentación de Confluence vinculada, archivos adjuntos y código fuente de los repositorios configurados.

### Configuración

Todas las credenciales se guardan **localmente en el navegador** (localStorage), no en el servidor. Configúralas desde la pestaña **Planner → Ajustes**:

#### 1. Atlassian (Jira + Confluence)

- **URL base**: `https://tu-empresa.atlassian.net`
- **Email**: el de tu cuenta de Atlassian
- **API Token**: generarlo en [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

> Importante: Jira Cloud migró el endpoint de búsqueda. La app usa la nueva API `/rest/api/3/search/jql` con POST y body JSON. El JQL siempre incluye `assignee = currentUser()` y `updated > -30d` para cumplir con las restricciones de queries ilimitadas.

#### 2. Repositorios de código

Hay 3 formas de configurar un repositorio. La **ruta local** es la más rápida porque no requiere API ni autenticación.

| Tipo | Cuándo usarlo |
|---|---|
| **Local** | Tienes el repo clonado en tu máquina. No necesita internet ni token. |
| **GitHub** | Repo remoto en GitHub. Necesitas token solo si es privado. |
| **Bitbucket** | Repo remoto en Bitbucket Cloud. Necesitas App Password si es privado. |

Campos:
- **Nombre**: alias para identificar el repo (ej: `unidrogas · ERP`).
- **URL** *(opcional si usas ruta local)*: `https://bitbucket.org/tiresia/repo` o `https://github.com/org/repo`.
- **Ruta local** *(opcional)*: `C:\Users\...\repos\repo`.
- **Branch**: rama a inspeccionar (default: `main`).
- **Token** *(opcional)*: token de GitHub o App Password de Bitbucket para repos privados.

##### Repositorios starter

Al abrir la app por primera vez, se pre-cargan 8 repos starter apuntando a rutas locales comunes en Tiresia. Si ya tenías configuración guardada, no se sobreescribe.

| Nombre | Ruta |
|---|---|
| `unidrogas · ERP` | `repositoriosGIT\unidrogas\erp` |
| `unidrogas · POS` | `repositoriosGIT\unidrogas\pos` |
| `api_rappi` | `repositoriosGIT\api_rappi` |
| `api_zubale` | `repositoriosGIT\api_zubale` |
| `documentacion` | `repositoriosGIT\documentacion` |
| `generico` | `repositoriosGIT\generico` |
| `maiaweb` | `repositoriosGIT\maiaweb` |
| `tupedidoenlinea` | `repositoriosGIT\tupedidoenlinea` |

Para resetear: `localStorage.removeItem('hyra_planner_settings')` en la consola del navegador y recargar.

#### 3. APIs de IA

Configura las claves de los proveedores que quieras usar:

- **Anthropic (Claude)**: `sk-ant-...` — modelos: Sonnet 4, Haiku 3.5
- **OpenAI (ChatGPT)**: `sk-...` — modelos: GPT-4o, GPT-4o Mini
- **Google Gemini**: `AIza...` — modelos: 2.0 Flash, 1.5 Pro
- **MiniMax**: `mm-...` — modelos: M3 8B, M2 7B, M1 7B

El selector de modelos consulta cada API con la clave configurada y muestra solo los modelos disponibles. Los optgroups indican el estado de conexión: **conectado** / **sin clave** / **error**.

### Flujo de uso

1. **Abrir Planner** en la barra de navegación.
2. La lista izquierda carga automáticamente las tareas de Jira asignadas a ti (máximo 25, actualizadas en los últimos 30 días).
3. **Filtrar** la lista con la barra de búsqueda (filtra en tiempo real sin volver a consultar).
4. **Seleccionar una tarea** de la lista — se carga la vista previa a la derecha (descripción, adjuntos, páginas de Confluence vinculadas).
5. **Click en "✦ Generar plan"** — se abre el dialog de configuración:
   - Marcar los repositorios que el planner debe revisar
   - Agregar enlaces adicionales (Confluence, PRs, docs externas)
6. **Confirmar** — el plan se genera con:
   - Pasos técnicos separados por frontend/backend cuando aplica
   - Estimación de horas por paso (perfil mid-level)
   - Total estimado
   - Riesgos y ambigüedades
   - Referencias a archivos concretos del código

### Endpoints del API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/planner/generate` | Genera el plan completo (Jira + Confluence + adjuntos + repos + links + IA) |
| POST | `/api/planner/preview` | Vista previa del ticket (sin IA) |
| POST | `/api/planner/search` | Búsqueda de issues (`assignee = currentUser() AND updated > -30d`) |
| POST | `/api/planner/models` | Lista los modelos disponibles por proveedor |

### Stack referenciado en los prompts

El planner conoce el stack del proyecto MAIA ERP de Tiresia:

- **Frontend**: Angular + Ignite UI (Maia Web)
- **Backend**: Perl CGI + MariaDB (ERP Desktop)
- **Frontend secundario**: Next.js + TypeScript (Hyra, herramienta interna)

---

## 🐳 Gestión de Docker

### Paneles principales

- **Detalle**: información de la instancia, estado de Docker, métricas CPU/memoria en vivo (vía `docker stats --no-stream`).
- **SSH / Consola**: terminal interactiva con xterm.js, conexión por ssh2.
- **SQL**: editor y ejecutor de consultas MySQL.
- **Archivos**: navegador SFTP con descarga de archivos.
- **Git**: integración con repositorios del servidor.
- **Hosts**: gestión de hosts.
- **Planner**: ver sección arriba.

### Endpoints SSH

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/ssh/connect` | Establece conexión SSH con la instancia |
| POST | `/api/ssh/disconnect` | Cierra la conexión |
| POST | `/api/ssh/exec` | Ejecuta un comando y devuelve el resultado |
| GET | `/api/ssh/status` | Estado de la conexión |
| POST | `/api/ssh/docker-stats` | Métricas en vivo de Docker |
| WebSocket | `/api/ssh/shell/stream` | Stream de shell interactivo (xterm) |