# 🚀 Guía de Instalación y Actualización - Arid

## 📋 Tabla de Contenidos

1. [Requisitos del Sistema](#requisitos-del-sistema)
2. [Instalación Inicial](#instalación-inicial)
3. [Configuración](#configuración)
4. [Primer Arranque](#primer-arranque)
5. [Actualizaciones](#actualizaciones)
6. [Mantenimiento](#mantenimiento)
7. [Troubleshooting](#troubleshooting)

---

## 🔧 Requisitos del Sistema

### Requisitos Mínimos

- **Sistema Operativo:** Linux, macOS, o Windows con WSL2
- **Node.js:** >= 18.0.0 (recomendado: 20.x LTS)
- **pnpm:** >= 8.0.0
- **Git:** Para clonación y actualizaciones
- **Espacio en Disco:** 500 MB mínimo (1 GB recomendado)
- **RAM:** 512 MB mínimo (1 GB recomendado)

### Verificar Requisitos

```bash
# Verificar Node.js
node --version
# Debe mostrar v18.x.x o superior

# Verificar pnpm
pnpm --version
# Debe mostrar 8.x.x o superior

# Verificar Git
git --version
```

### Instalar Requisitos Faltantes

**Node.js:**
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS
brew install node@20
```

**pnpm:**
```bash
# Instalar globalmente
npm install -g pnpm

# Verificar
pnpm --version
```

---

## 📦 Instalación Inicial

### Método 1: Script Automático (Recomendado)

Este es el método más simple y seguro.

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/Flucastr.AridV2.git
cd Flucastr.AridV2

# 2. Ejecutar el script de instalación
./install.sh
```

El script automáticamente:
- ✅ Verifica Node.js >= 18
- ✅ Verifica pnpm instalado
- ✅ Crea directorios necesarios (`data/`, `workspace/`, `uploads/`)
- ✅ Copia `.env.example` → `.env`
- ✅ Instala dependencias con `pnpm install`
- ✅ Compila TypeScript con `npm run build`
- ✅ Muestra instrucciones de siguiente paso

**Output esperado:**
```
🤖 AridV2 - Installation Script
======================================

📋 Checking prerequisites...
✓ Node.js v20.11.0
✓ pnpm 8.15.1
✓ Git 2.43.0

📁 Setting up directories...
✓ Directories created

⚙️  Creating configuration...
✓ .env created from template

📦 Installing dependencies...
✓ Dependencies installed

🔨 Building project...
✓ Build completed

======================================
✓ Installation completed successfully!
======================================

📖 Next steps:

1️⃣  Edit your configuration:
   vim .env

2️⃣  Start the bot:
   pnpm start

3️⃣  Or use development mode:
   pnpm dev
```

### Método 2: Manual

Si prefieres hacer la instalación paso por paso:

```bash
# 1. Clonar repositorio
git clone https://github.com/tu-usuario/Flucastr.AridV2.git
cd Flucastr.AridV2

# 2. Crear directorios
mkdir -p data/backups
mkdir -p workspace/logs
mkdir -p workspace/skills
mkdir -p uploads

# 3. Configurar variables de entorno
cp .env.example .env
nano .env  # Editar con tus API keys

# 4. Instalar dependencias
pnpm install

# 5. Compilar TypeScript
npm run build

# 6. Iniciar
pnpm start
```

---

## ⚙️ Configuración

### Archivo .env

Después de la instalación, debes configurar `.env` con tus credenciales.

#### Telegram (OBLIGATORIO)

```bash
# 1. Crear bot con @BotFather en Telegram
# 2. Escribe /newbot y sigue las instrucciones
# 3. Copia el token que te da
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklmNOpqrstUVwxyz

# 4. Obtener tu User ID (usa @userinfobot en Telegram)
# 5. Envía cualquier mensaje para obtener tu ID
TELEGRAM_ALLOWED_USER_IDS=987654321

# Si son múltiples usuarios, separa con comas:
TELEGRAM_ALLOWED_USER_IDS=987654321,123456789
```

#### LLM Providers

**Opción A: Hybrid Mode (Recomendado)**
```bash
LLM_MODE=hybrid
LLM_PROVIDER_CONVERSATION=gemini
LLM_PROVIDER_REASONING=anthropic

# Gemini para conversaciones casuales (más barato)
GEMINI_API_KEY=AIzaSyD...
GEMINI_MODEL=gemini-2.0-flash-exp

# Claude para razonamiento profundo (más preciso)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

**Opción B: Single Provider**
```bash
LLM_MODE=single

# Opción 1: Solo Claude
LLM_PROVIDER_CONVERSATION=anthropic
LLM_PROVIDER_REASONING=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Opción 2: Solo Gemini
LLM_PROVIDER_CONVERSATION=gemini
LLM_PROVIDER_REASONING=gemini
GEMINI_API_KEY=AIzaSyD...
GEMINI_MODEL=gemini-2.0-flash-exp

# Opción 3: Ollama (local, gratis)
LLM_PROVIDER_CONVERSATION=ollama
LLM_PROVIDER_REASONING=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

#### Storage y Workspace

```bash
STORE_PATH=./data/store.json
WORKSPACE_PATH=./workspace
```

#### Dónde Obtener API Keys

**Gemini (Gratis):**
1. Ve a https://aistudio.google.com/app/apikeys
2. Crea una API key
3. Copia el valor

**Anthropic (Requiere pago):**
1. Ve a https://console.anthropic.com/
2. Crea una cuenta
3. Genera una API key
4. Copia el valor

**Telegram Bot:**
1. Busca `@BotFather` en Telegram
2. Envía `/newbot`
3. Sigue las instrucciones
4. Copia el token

**Telegram User ID:**
1. Busca `@userinfobot` en Telegram
2. Envía cualquier mensaje
3. Bot te mostrará tu User ID

---

## 🎬 Primer Arranque

### Iniciar el Bot

```bash
# Modo producción
pnpm start

# Modo desarrollo (con hot reload)
pnpm dev
```

### Output Esperado

```
[INFO] Brain initialized
[INFO] Store loaded from file
[INFO] Checking store integrity...
[INFO] Store integrity check passed
[INFO] Running pending migrations...
[INFO] Starting autonomous task daemon...
[INFO] ✅ Telegram bot started successfully
```

### Primer Mensaje en Telegram

1. Abre Telegram y busca tu bot
2. Envía: `/start`
3. El bot te guiará por el onboarding:
   - Tu nombre
   - Tono del asistente (casual/profesional/técnico)
   - Tus intereses

### Verificar Funcionamiento

```
Usuario: hola
Arid: ¡Hola! ¿En qué puedo ayudarte?

Usuario: /help
Arid: [muestra todos los comandos disponibles]

Usuario: /stats
Arid: [muestra estadísticas del sistema]

Usuario: /daemon
Arid: [muestra estado del daemon autónomo]
```

---

## 🔄 Actualizaciones

### Actualizar desde Telegram (Recomendado)

```
Usuario: /update
Arid: 🔄 Iniciando actualización de Arid...
      💾 Creando backup automático...
      ✅ Backup creado: store-2026-03-13-140523.json
      📥 Descargando cambios desde repositorio...
      🔨 Compilando código...
      ✅ Actualización completada
      🔄 Reiniciando en 3 segundos...
```

**El proceso automáticamente:**
1. ✅ Crea backup de tus datos
2. ✅ Ejecuta `git pull origin main`
3. ✅ Instala nuevas dependencias si hay
4. ✅ Compila el código TypeScript actualizado
5. ✅ Reinicia el bot automáticamente

**Si algo falla:**
```
Usuario: /restore list
Arid: [muestra backups disponibles]

Usuario: /restore store-2026-03-13-140523
Arid: ✅ Backup restaurado
      🔄 Reiniciando...
```

### Actualizar Manualmente

```bash
# 1. Detener el bot
Ctrl+C

# 2. Crear backup manual
cp data/store.json data/store.backup.$(date +%Y%m%d-%H%M%S).json

# 3. Actualizar código
git pull origin main

# 4. Instalar nuevas dependencias (si las hay)
pnpm install

# 5. Recompilar
npm run build

# 6. Reiniciar
pnpm start
```

### Ver Versión Actual

```
Usuario: /version
Arid: 🤖 Versión de Arid
      
      Versión actual: v0.8.0
      Modo: Producción
      
      Para actualizar:
      /update
```

### Cambios entre Versiones

```bash
# Ver commits desde tu versión actual
git log --oneline HEAD..origin/main

# Ver detalles de cambios
git log --stat HEAD..origin/main
```

---

## 🛠️ Mantenimiento

### Backups

#### Backup Manual

```
Usuario: /backup
Arid: 💾 Backup Creado
      
      Archivo: store-2026-03-13-150234.json
      Tamaño: 2.4 MB
      Fecha: 13/03/2026 15:02:34
      
      Puedes restaurar este backup con:
      /restore store-2026-03-13-150234
```

#### Backup Automático

Los backups se crean automáticamente:
- ✅ Antes de cada actualización
- ✅ Se mantienen los últimos 7 backups
- ✅ Se eliminan automáticamente los más antiguos

#### Ver Backups Disponibles

```
Usuario: /restore list
Arid: 📋 Backups Disponibles
      
      1. store-2026-03-13-150234.json
         13/03/2026 15:02:34 (2.4 MB)
      
      2. store-2026-03-13-140523.json
         13/03/2026 14:05:23 (2.3 MB)
      
      3. store-2026-03-12-180145.json
         12/03/2026 18:01:45 (2.2 MB)
      
      Para restaurar:
      /restore {nombre_del_backup}
```

#### Restaurar desde Backup

```
Usuario: /restore store-2026-03-13-140523
Arid: ⚠️ Confirmación
      
      Restaurarás: store-2026-03-13-140523.json
      Datos actuales se perderán.
      
      Continuando...
      ✅ Backup restaurado
      🔄 Reiniciando en 3 segundos...
```

### Limpieza de Datos

#### Ver Tamaño del Store

```bash
# Ver tamaño del archivo de datos
du -h data/store.json

# Ver uso total del workspace
du -sh data/ workspace/ uploads/
```

#### Limpiar Datos Antiguos

```bash
# Limpiar conversaciones antiguas (manual)
# El sistema ya mantiene solo últimos 40 mensajes por usuario

# Comprimir archivos de log antiguos
find workspace/logs/ -name "*.log" -mtime +30 -exec gzip {} \;

# Limpiar uploads antiguos (> 90 días)
find uploads/ -type f -mtime +90 -delete

# Limpiar backups manuales antiguos
find data/ -name "store.backup.*.json" -mtime +30 -delete
```

### Monitoreo

#### Ver Estado del Sistema

```
Usuario: /daemon
Arid: ⚙️ Estado del Daemon Autónomo
      
      Daemon: ✅ Activo
      Intervalo de chequeo: 10s
      
      Tarea actual: Ninguna
      
      Cola de tareas:
      • Pendientes: 2
      • En ejecución: 0
      • Completadas: 15
      • Fallidas: 0
```

#### Ver Estadísticas

```
Usuario: /stats
Arid: 📊 Estadísticas de Uso
      
      Conversaciones: 127 mensajes
      Skills activos: 5
      Memorias: 8 recordatorios
      Proyectos: 2 activos
      
      Tokens consumidos:
      • Entrada: 45.2K
      • Salida: 32.1K
```

### Logs

```bash
# Ver logs en tiempo real
tail -f workspace/logs/bot.log

# Ver errores
grep ERROR workspace/logs/bot.log

# Ver logs de skills específicos
cat workspace/logs/skills.log
```

---

## 🆘 Troubleshooting

### Bot no Inicia

**Error: Node.js version too old**
```bash
# Actualizar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Error: pnpm not found**
```bash
npm install -g pnpm
```

**Error: TypeScript compilation failed**
```bash
# Limpiar y recompilar
rm -rf dist/
npm run build
```

### Bot se Detiene Inesperadamente

**Verificar logs:**
```bash
tail -50 workspace/logs/bot.log
```

**Errores comunes:**

1. **Out of Memory**
   ```bash
   # Aumentar memoria de Node.js
   NODE_OPTIONS="--max-old-space-size=2048" pnpm start
   ```

2. **Store corrupto**
   ```
   Usuario: /restore list
   # Restaurar desde backup más reciente
   ```

3. **API keys inválidas**
   ```bash
   # Verificar .env
   cat .env | grep API_KEY
   # Actualizar keys si es necesario
   ```

### Comandos no Funcionan

**Verificar permisos del usuario:**
```bash
# En .env, verificar que tu User ID está en la lista
grep TELEGRAM_ALLOWED_USER_IDS .env
```

**Reiniciar bot:**
```bash
# Detener
Ctrl+C

# Reiniciar
pnpm start
```

### Actualización Falla

**Restaurar desde backup:**
```
Usuario: /restore list
Usuario: /restore store-2026-03-13-140523
```

**O manualmente:**
```bash
# Copiar backup más reciente
cp data/backups/store-2026-03-13-140523.json data/store.json

# Reiniciar bot
pnpm start
```

### Store Crece Demasiado

**Verificar tamaño:**
```bash
du -h data/store.json
```

**Si > 50 MB:**
```bash
# Archivar conversaciones antiguas
cp data/store.json data/archive-$(date +%Y%m%d).json

# Limpiar manualmente (opcional)
# Editar data/store.json y eliminar conversaciones muy antiguas
```

### Skills no Funcionan

**Verificar skills cargados:**
```
Usuario: /stats
# Debe mostrar skills activos
```

**Revisar sintaxis del SKILL.md:**
```bash
# Ver estructura
cat workspace/skills/mi-skill/SKILL.md

# Verificar frontmatter (debe tener ---)
head -10 workspace/skills/mi-skill/SKILL.md
```

**Activar skill manualmente:**
```
Usuario: activa mi-skill
```

---

## 📚 Recursos Adicionales

- **Guía de Skills:** `SKILLS_GUIDE.md` - Cómo crear skills efectivos
- **Quick Start:** `QUICKSTART.md` - Inicio rápido
- **Storage Info:** `STORAGE.md` - Información sobre almacenamiento
- **Examples:** Revisar `workspace/skills/` para ejemplos

---

## 🆘 Soporte

**Desde Telegram:**
```
Usuario: ayuda
Arid: [te guiará interactivamente]
```

**Logs del sistema:**
```bash
workspace/logs/bot.log       # Logs generales
workspace/logs/skills.log    # Logs de skills
workspace/logs/errors.log    # Solo errores
```

---

**¡Disfruta de Arid! 🤖✨**
