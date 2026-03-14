# 📂 Guía: Cómo Funcionan los Paths en Workspace

## Configuración

En `.env`:
```bash
TOOLS_WORKSPACE_PATH=./
```

Esto significa que **el directorio raíz para todas las operaciones de herramientas es el directorio del proyecto**, no solo workspace.

## Estructura

```
Flucastr.AridV2/           ← DIRECTORIO RAÍZ para herramientas
├── src/
├── workspace/             ← Carpeta con datos del usuario
│   ├── PROFILE.md
│   ├── documentos/
│   ├── logs/
│   ├── skills/
│   └── uploads/
├── .env
└── package.json
```

## Cómo Usar Paths

### ✅ CORRECTO

Todos los paths son **relativos al directorio del proyecto** y los datos del usuario están en `workspace/`:

| Usuario dice | Path a usar | Resuelve a |
|-------------|------------|-----------|
| "muéstrame workspace" | `"workspace"` | `./workspace/` |
| "qué hay en documentos" | `"workspace/documentos"` | `./workspace/documentos/` |
| "lee PROFILE.md" | `"workspace/PROFILE.md"` | `./workspace/PROFILE.md` |
| "muéstrame skills"| `"workspace/skills"` | `./workspace/skills/` |
| "crea archivo en documentos" | `"workspace/documentos/archivo.txt"` | `./workspace/documentos/archivo.txt` |

### ❌ INCORRECTO

NO omitas `workspace/` cuando el usuario se refiere a sus datos:

| Usuario dice | ❌ NO usar | ¿Por qué? |
|-------------|-----------|----------|
| "lee mi perfil" | `"PROFILE.md"` | Falta prefijo: debe ser `"workspace/PROFILE.md"` |
| "qué hay en skills" | `"skills"` | Falta prefijo: debe ser `"workspace/skills"` |

## Regla Simple

**Datos del usuario = siempre usa prefijo `workspace/`**  
**Archivos del proyecto = usa path directo (ej: `src/`, `package.json`)**

## Ejemplos Prácticos

### Listar contenido de workspace
```typescript
// Usuario: "muéstrame workspace"
list_files("workspace")
```

### Listar contenido de skills
```typescript
// Usuario: "qué hay en skills"
list_files("workspace/skills")
```

### Leer PROFILE.md
```typescript
// Usuario: "lee mi perfil"
read_file("workspace/PROFILE.md")
```

### Crear archivo en documentos
```typescript
// Usuario: "crea un archivo notas.txt en documentos"
write_file("workspace/documentos/notas.txt", "contenido...")
```

### Listar archivos de un usuario en uploads
```typescript
// Usuario: "qué archivos he subido"
list_files("workspace/uploads/416985247")  // ID del usuario
```

## Por Qué Esta Configuración

Esta configuración (`TOOLS_WORKSPACE_PATH=./`) permite:
1. **Flexibilidad**: El modelo puede acceder tanto a archivos del usuario (workspace/) como del proyecto (src/, package.json)
2. **Desarrollo**: Útil para cuando el modelo necesita editar código o leer configuración del proyecto
3. **Versatilidad**: Un solo directorio raíz para todas las operaciones

## Troubleshooting

### Error: "Path está fuera del directorio raíz permitido"

**Causa**: Estás intentando acceder a paths fuera del proyecto (ej: /etc/passwd).

**Solución**: Usa paths relativos al proyecto:
- ✅ `"workspace/PROFILE.md"` 
- ✅ `"src/index.ts"`
- ❌ `"/etc/passwd"`
- ❌ `"../../outside-project/file.txt"`

### El modelo no encuentra archivos en workspace

**Causa**: Olvidaste incluir `workspace/` en el path.

**Solución**: Asegúrate de incluir el prefijo para datos de usuario:
- ❌ `read_file("PROFILE.md")`
- ✅ `read_file("workspace/PROFILE.md")`

## Configuración Alternativa

Si prefieres que el modelo SOLO tenga acceso a workspace (más restrictivo), cambia en `.env`:

```bash
# Para limitar acceso solo a workspace/
TOOLS_WORKSPACE_PATH=./workspace

# Entonces NO deberías usar prefijo workspace/:
list_files(".")                    # ✅ Lista workspace/
read_file("PROFILE.md")           # ✅ Lee workspace/PROFILE.md
list_files("skills")              # ✅ Lista workspace/skills/
```

**Ventajas de TOOLS_WORKSPACE_PATH=./workspace**:
- Más seguro: el modelo no puede acceder a src/, node_modules/, etc
- Más claro: todo es relativo a workspace, que contiene solo datos de usuario
- Más limpio: no necesitas prefijo "workspace/" en tus paths

**Desventajas**:
- El modelo no puede leer/editar código del proyecto
- No puede leer package.json, .env, etc
