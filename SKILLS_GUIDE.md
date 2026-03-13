# 🎯 Guía para Crear Skills en Arid

## ¿Qué es un Skill?

Un **skill** es una capacidad especializada que extiende las funciones de Arid. Piensa en skills como "plugins" que le enseñan al asistente nuevas habilidades: consultar APIs, procesar datos, automatizar tareas, integrarse con servicios externos, etc.

---

## 📁 Estructura de un Skill

Los skills viven en: `workspace/skills/{nombre-del-skill}/SKILL.md`

```
workspace/skills/
├── github-integration/
│   └── SKILL.md
├── crypto-expert/
│   └── SKILL.md
└── mi-nuevo-skill/
    └── SKILL.md
```

---

## 📝 Anatomía de un SKILL.md

### Estructura Base

```markdown
---
name: nombre-del-skill
description: Descripción breve de qué hace
keywords:
  - palabra clave 1
  - palabra clave 2
  - palabra clave 3
version: "1.0.0"
author: Tu Nombre
category: automation|data|integration|utility
required-env: []
---

# Nombre del Skill

## Descripción
Descripción detallada de qué hace el skill y cuándo usarlo.

## Capacidades
- Capacidad 1: Explicación
- Capacidad 2: Explicación

## Comandos Disponibles
- `comando1 [parámetros]` - Descripción
- `comando2 [parámetros]` - Descripción

## Ejemplos de Uso
\`\`\`
Usuario: [ejemplo de petición]
Arid: [respuesta esperada]
\`\`\`

## Notas Técnicas
- Límites
- Consideraciones
- Best practices
```

---

## 🎨 Frontmatter: Metadatos del Skill

### `name` (requerido)
Identificador único del skill. Usa kebab-case.

```yaml
name: github-integration
```

### `description` (requerido)
Descripción breve (1-2 líneas) de qué hace el skill.

```yaml
description: Gestiona repositorios, issues y pull requests de GitHub
```

### `keywords` (requerido)
Palabras clave que activan el skill. Mínimo 3 palabras clave.

```yaml
keywords:
  - github
  - repositorio
  - pull request
  - issue
  - commit
```

**Tips para buenos keywords:**
- ✅ Incluye sinónimos: "repository", "repositorio", "repo"
- ✅ Incluye términos técnicos: "PR", "merge", "fork"
- ✅ Incluye acciones: "crear issue", "revisar código"
- ❌ Evita palabras genéricas: "hacer", "obtener"

### `version` (recomendado)
Versionado semántico del skill.

```yaml
version: "1.0.0"
```

### `author` (opcional)
Quién creó el skill.

```yaml
author: Franco García
```

### `category` (recomendado)
Categoría del skill. Valores sugeridos:
- `automation` - Automatización de tareas
- `data` - Procesamiento de datos
- `integration` - Integración con servicios externos
- `utility` - Utilidades generales
- `monitoring` - Monitoreo de sistemas

```yaml
category: integration
```

### `required-env` (si aplica)
Variables de entorno necesarias para que funcione el skill.

```yaml
required-env:
  - GITHUB_TOKEN
  - GITHUB_USERNAME
```

---

## 🔥 Secciones del Contenido

### 1. Descripción Detallada

Explica **qué hace** el skill y **cuándo usarlo**.

```markdown
## Descripción
Este skill permite interactuar con la API de GitHub para gestionar
repositorios, issues, pull requests y proyectos. Ideal para equipos
que quieren automatizar workflows de desarrollo.

**Cuándo usar este skill:**
- Cuando necesites crear o actualizar issues
- Para revisar PRs pendientes
- Para obtener estadísticas de repositorios
- Para automatizar releases
```

### 2. Capacidades

Lista clara de **qué puede hacer** el skill.

```markdown
## Capacidades
- **Gestión de Issues**: Crear, listar, actualizar y cerrar issues
- **Pull Requests**: Revisar PRs pendientes, mergear, comentar
- **Repositorios**: Obtener info, estadísticas, commits recientes
- **Proyectos**: Crear y gestionar GitHub Projects
```

### 3. Comandos Disponibles

Especifica la **sintaxis exacta** de los comandos.

```markdown
## Comandos Disponibles

### Issues
- `crear issue [título]` - Crea un nuevo issue
- `listar issues [repo]` - Lista issues abiertos
- `cerrar issue #[número]` - Cierra un issue específico

### Pull Requests
- `listar prs` - Muestra PRs pendientes de revisión
- `mergear pr #[número]` - Mergea un PR aprobado
```

### 4. Credenciales (si aplica)

Si el skill necesita credenciales, documéntalas claramente.

```markdown
## Credenciales Requeridas

### `GITHUB_TOKEN`
**Descripción:** Personal Access Token de GitHub con permisos de repo

**Cómo obtenerlo:**
1. Ve a GitHub → Settings → Developer settings
2. Personal access tokens → Generate new token
3. Selecciona scopes: `repo`, `read:project`, `write:discussion`
4. Copia el token generado

**Almacenamiento:**
Arid te pedirá el token la primera vez que uses el skill.
Se almacena encriptado localmente.
```

### 5. Ejemplos de Uso

Proporciona **ejemplos reales** de conversaciones.

```markdown
## Ejemplos de Uso

**Ejemplo 1: Crear Issue**
\`\`\`
Usuario: Crea un issue llamado "Fix login bug" en el repo backend
Arid: ✅ Issue #142 creado en backend
      Título: Fix login bug
      URL: https://github.com/user/backend/issues/142
\`\`\`

**Ejemplo 2: Revisar PRs**
\`\`\`
Usuario: ¿Hay PRs pendientes de revisión?
Arid: 📋 Tienes 3 PRs pendientes:
      
      #89 - Refactor auth module (por @alice)
      #90 - Add tests for API (por @bob)
      #91 - Update dependencies (por @charlie)
\`\`\`
```

### 6. Notas Técnicas

Documenta limitaciones y consideraciones importantes.

```markdown
## Notas Técnicas

**Límites de Rate:**
- GitHub API: 5,000 requests/hora con token
- Sin token: 60 requests/hora

**Consideraciones:**
- Los webhooks NO están implementados (solo polling)
- Repos privados requieren token con permisos adecuados

**Performance:**
- Caché de 5 minutos para stats de repos
- Actualización automática cada 15 minutos en background
```

---

## 🚀 Cómo Crear tu Primer Skill

### Paso 1: Crea la Estructura

```bash
mkdir -p workspace/skills/mi-skill
cd workspace/skills/mi-skill
touch SKILL.md
```

### Paso 2: Define el Frontmatter

```yaml
---
name: mi-skill
description: Descripción corta de qué hace
keywords:
  - keyword1
  - keyword2
  - keyword3
version: "1.0.0"
category: utility
---
```

### Paso 3: Documenta las Capacidades

```markdown
# Mi Skill

## Descripción
Este skill hace X, Y y Z. Es útil cuando necesitas [caso de uso].

## Capacidades
- Capacidad 1
- Capacidad 2
- Capacidad 3
```

### Paso 4: Agrega Comandos y Ejemplos

```markdown
## Comandos Disponibles
- `comando1` - Hace esto
- `comando2 [parámetro]` - Hace aquello

## Ejemplos de Uso
\`\`\`
Usuario: comando1
Arid: [respuesta esperada]
\`\`\`
```

### Paso 5: Prueba el Skill

1. Prueba los keywords desde Telegram:
   ```
   Usuario: keyword1
   Arid: [debería detectar el skill]
   ```

2. Ejecuta comandos:
   ```
   Usuario: comando1
   ```

---

## 💡 Best Practices

### ✅ DO: Hacer

1. **Keywords Específicos**
   ```yaml
   ✅ BIEN: [github, repositorio, pull request, issue, commit]
   ❌ MAL: [hacer, obtener, ver]
   ```

2. **Comandos Claros**
   ```markdown
   ✅ BIEN: `crear issue [título]`
   ❌ MAL: `issue nuevo`
   ```

3. **Ejemplos Reales**
   ```markdown
   ✅ BIEN: Muestra conversaciones completas con outputs
   ❌ MAL: "Usa el comando X"
   ```

4. **Documentar Límites**
   ```markdown
   ✅ BIEN: "Rate limit: 100 requests/min"
   ❌ MAL: Asumir que no hay límites
   ```

5. **Categoría Apropiada**
   ```yaml
   ✅ BIEN: category: integration
   ❌ MAL: category: useful
   ```

### ❌ DON'T: Evitar

1. **No usar keywords genéricos**
   - Evita: "hacer", "ver", "obtener"
   - Usa: términos técnicos específicos del dominio

2. **No asumir contexto**
   - Documenta TODO: parámetros, formatos, límites

3. **No olvidar error handling**
   ```markdown
   ## Manejo de Errores
   - API no disponible: [comportamiento]
   - Credenciales inválidas: [comportamiento]
   - Rate limit excedido: [comportamiento]
   ```

4. **No crear skills muy genéricos**
   - Mejor: Un skill para GitHub, otro para GitLab
   - Peor: Un skill para "gestión de repos" que hace todo

---

## 🎯 Aprovecha el Sistema Autónomo

### 1. Detección Automática

El skill puede ser **activado automáticamente** por patrones:

```markdown
## Triggers Automáticos
Este skill se activa automáticamente cuando:
- Mencionas uno de los keywords
- El usuario pregunta algo relacionado con tu dominio
```

### 2. Rutinas Programadas

Documenta cuándo el skill debe ejecutarse solo:

```markdown
## Ejecución Automática
- **Morning routine (9 AM)**: Resumen de PRs pendientes
- **Afternoon check (3 PM)**: Issues sin respuesta
- **Evening summary (6 PM)**: Actividad del día
```

### 3. Sugerencias Proactivas

El skill puede sugerir acciones:

```markdown
## Sugerencias Proactivas
El skill detecta y sugiere:
- "Hay 3 PRs listos para mergear"
- "Issue #45 ha sido comentado"
- "Dependencias desactualizadas disponibles"
```

---

## 📚 Ejemplos de Skills Existentes

### GitHub Integration
📍 `workspace/skills/github-intergration/SKILL.md`

**Lo que hace bien:**
- ✅ Keywords específicos del dominio
- ✅ Comandos claros con sintaxis exacta
- ✅ Ejemplos de conversaciones reales
- ✅ Gestión de credenciales documentada

### Crypto Expert
📍 `workspace/skills/crypto-expert/SKILL.md`

**Lo que hace bien:**
- ✅ Capacidades bien delimitadas
- ✅ Rate limits documentados
- ✅ Formatos de respuesta consistentes

### Home Assistant Control
📍 `workspace/skills/controlar-home-assistant/SKILL.md`

**Lo que hace bien:**
- ✅ Setup completo documentado
- ✅ Comandos de voz naturales
- ✅ Integración con dispositivos físicos

---

## 🔧 Debugging de Skills

### Ver Skills Disponibles
```
Usuario: /stats
Arid: [muestra skills cargados en el sistema]
```

### Activar Skill Manualmente
```
Usuario: activa github-integration
Arid: ✅ Skill github-integration activado
```

### Ver Logs del Skill
```bash
# Los logs están en:
tail -f workspace/logs/skills.log
```

### Errores Comunes

**1. Skill no se detecta**
```yaml
# Verifica keywords en frontmatter
keywords:
  - debe
  - tener
  - al-menos-tres  # ← Mínimo 3
```

**2. Credenciales no funcionan**
```markdown
# Documenta EXACTAMENTE el nombre esperado
required-env:
  - GITHUB_TOKEN
```

**3. Comandos no se reconocen**
```markdown
# Usa sintaxis clara y consistente
✅ BIEN: `crear issue [título]`
❌ MAL: Sintaxis ambigua o sin parámetros
```

---

## 🚀 Próximos Pasos

1. **Revisa un Skill Existente**
   ```bash
   cat workspace/skills/github-intergration/SKILL.md
   ```

2. **Crea tu Estructura**
   ```bash
   mkdir -p workspace/skills/mi-skill
   touch workspace/skills/mi-skill/SKILL.md
   ```

3. **Edita y Prueba**
   - Modifica el frontmatter
   - Documenta capacidades
   - Agrega ejemplos
   - Prueba desde Telegram

4. **Itera y Mejora**
   - Observa cómo Arid usa el skill
   - Ajusta keywords si no se activa bien
   - Mejora la documentación basándote en uso real

---

## 📖 Recursos Adicionales

- **Installation Guide**: `INSTALLATION.md` - Cómo instalar y actualizar Arid
- **Quick Start**: `QUICKSTART.md` - Inicio rápido
- **Storage Info**: `STORAGE.md` - Información sobre almacenamiento
- **Examples**: Revisa skills en `workspace/skills/`

---

**¡Disfruta creando skills! 🎉**
