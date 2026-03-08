# Flucastr.AridV2

**AridV2** es un asistente conversacional minimalista construido desde cero con enfoque en simplicidad, extensibilidad y eficiencia.

## 🎯 Características

### Fase 1 ✅ (Completada)

- ✅ **Conversación Natural:** Chat inteligente en español
- ✅ **Multi-Provider LLM:** Soporte para Anthropic Claude, Google Gemini, y Ollama
- ✅ **Hybrid Mode:** Usa modelos diferentes según la complejidad (Gemini para chat simple, Claude para razonamiento)
- ✅ **Intent Analysis:** Análisis inteligente de intención usando LLM (no keywords)
- ✅ **Memoria Simple:** Historial de últimos 40 mensajes
- ✅ **Token Tracking:** Seguimiento real de uso de tokens
- ✅ **Prompt Caching:** Optimización de costos con cache de system prompt (72% ahorro)
- ✅ **Onboarding:** Configuración inicial minimalista (2-3 preguntas)
- ✅ **Interfaz Telegram:** Bot completo con comandos

### Fase 2 ✅ (Completada)

- ✅ **Memoria Dinámica:** Sistema de aprendizaje continuo sobre el usuario
- ✅ **Extracción Automática:** LLM analiza conversaciones y extrae información relevante
- ✅ **Categorización Inteligente:** Memorias organizadas por tipo (hechos, preferencias, proyectos, contexto)
- ✅ **Personalización:** System prompt incluye conocimiento acumulado del usuario
- ✅ **Comando /memories:** Inspeccionar memorias guardadas

## 🏗️ Arquitectura

```
AridV2
├── Brain (Cerebro)       - Orquestación de conversación
│   ├── IntentAnalyzer    - Análisis de intención con LLM
│   ├── MemoryExtractor   - Extracción automática de memorias
│   └── SystemPromptBuilder - Construcción de prompts con contexto
├── Senses (Sentidos)     - Inputs (Telegram)
├── Hands (Manos)         - Tools (vacío en Fase 1)
├── LLM Layer            - Multi-provider abstraction
├── Storage              - JSON-based (historial, perfiles, tokens, memorias)
│   ├── ConversationStore - Últimos 40 mensajes
│   ├── ProfileStore      - Perfil del usuario
│   └── MemoryStore       - Memorias de largo plazo
└── Onboarding           - Setup inicial
```

## 📦 Instalación

```bash
# Clonar repositorio
git clone <repo-url>
cd Flucastr.AridV2

# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus API keys

# Compilar
pnpm build

# Ejecutar
pnpm start
```

## 🚀 Desarrollo

```bash
# Modo desarrollo (hot reload)
pnpm dev

# Verificar tipos
pnpm type-check

# Ejecutar tests
pnpm test

# Test coverage
pnpm test:coverage
```

## 🔧 Configuración

### Variables de Entorno

- `TELEGRAM_BOT_TOKEN`: Token del bot de Telegram
- `TELEGRAM_ALLOWED_USER_IDS`: IDs de usuarios permitidos (separados por coma)
- `LLM_MODE`: `hybrid` o `single`
- `LLM_PROVIDER_CONVERSATION`: Proveedor para conversación (gemini)
- `LLM_PROVIDER_REASONING`: Proveedor para razonamiento (anthropic)
- `ANTHROPIC_API_KEY`: API key de Anthropic
- `GEMINI_API_KEY`: API key de Google Gemini
- `OLLAMA_BASE_URL`: URL de Ollama (opcional)

### Modos de Operación

**Hybrid Mode (Recomendado):**
- Usa Gemini para conversación casual (rápido y económico)
- Usa Claude para razonamiento profundo (preciso)
- Análisis de intención automático

**Single Mode:**
- Usa el mismo proveedor para todo
- Configurar `LLM_PROVIDER_CONVERSATION`

## 📱 Comandos de Telegram

- `/start` - Mensaje de bienvenida
- `/reset` - Limpiar historial de conversación
- `/profile` - Ver perfil del usuario
- `/memories` - Ver memorias guardadas sobre ti
- `/stats` - Ver estadísticas de uso de tokens

## 🧠 Sistema de Memoria Dinámica (Fase 2)

AridV2 ahora aprende continuamente sobre ti mientras conversas:

### ¿Cómo funciona?

1. **Extracción Automática:** Después de cada respuesta, un LLM analiza la conversación reciente (últimos 6 mensajes) y extrae información relevante
2. **Categorización:** Las memorias se clasifican en:
   - **Hechos (fact):** Información factual sobre ti (ej: "Es desarrollador fullstack")
   - **Preferencias (preference):** Gustos y estilos (ej: "Prefiere código con ejemplos")
   - **Proyectos (project):** Trabajos actuales (ej: "Está desarrollando AridV2")
   - **Contexto (context):** Información contextual relevante (ej: "Trabaja desde casa")
3. **Priorización:** Cada memoria tiene un score de importancia (0.0-1.0)
4. **Uso en Conversación:** Las 10 memorias más importantes se incluyen en el system prompt

### Ejemplos de uso

**Conversación inicial:**
```
Usuario: Estoy trabajando en un proyecto de IA, un asistente conversacional
Asistente: ¡Interesante! Cuéntame más sobre tu proyecto
[Se guarda memoria: "Está trabajando en un asistente conversacional de IA"]
```

**Sesión posterior (días después):**
```
Usuario: Hola
Asistente: ¡Hola! ¿Cómo va el desarrollo de tu asistente de IA?
[El asistente recuerda el proyecto gracias a la memoria guardada]
```

### Ver tus memorias

Usa el comando `/memories` para inspeccionar qué ha aprendido el asistente sobre ti:

```
📝 Memorias sobre ti

Hechos:
• Es desarrollador fullstack
• Usa principalmente TypeScript y React

Preferencias:
• Prefiere explicaciones con ejemplos de código

Proyectos:
• Está desarrollando AridV2, un asistente conversacional

Total: 4 memorias
```

### Privacidad

- Las memorias se almacenan localmente en tu servidor
- Puedes inspeccionar todas las memorias con `/memories`
- Las memorias se usan exclusivamente para personalizar tus conversaciones

## 🏛️ Estructura del Proyecto

```
src/
├── brain/               # Core de conversación
│   ├── brain.ts        # Orquestador principal
│   ├── intent-analyzer.ts   # Análisis de intención con LLM
│   ├── system-prompt.ts     # Construcción de system prompt
│   └── token-tracker.ts     # Tracking de tokens
├── senses/telegram/    # Interfaz Telegram
├── hands/              # Tools (vacío en Fase 1)
├── llm/                # Multi-provider LLM
├── storage/            # Persistencia SQLite
├── onboarding/         # Setup inicial
├── config/             # Configuración
├── utils/              # Utilidades
└── index.ts            # Entry point
```

## 🎓 Lecciones Aprendidas de V1

AridV2 incorpora mejoras basadas en V1:

✅ **Sin keywords hardcodeados** - Intent analysis usa LLM puro
✅ **System prompt en español** - Evita mezcla inglés/español
✅ **Token tracking real** - Registra tokens reales de respuestas LLM
✅ **Prompt caching** - Ahorro del 72% en system prompt
✅ **Modelos actuales** - Usa modelos soportados (claude-sonnet-4-6)
✅ **Núcleo minimalista** - Solo lo esencial para conversación funcional

## 📊 Métricas

- **Líneas de código:** ~2,000 (vs 8,000 en V1)
- **System prompt:** <500 tokens (vs 800 en V1)
- **Memoria:** 40 mensajes (simple, sin compresión)
- **Costo estimado:** ~$0.001/mensaje (hybrid mode)

## 🛣️ Roadmap

### Fase 1 (Actual)
- ✅ Conversación pura con multi-provider LLM
- ✅ Memoria simple (40 mensajes)
- ✅ Intent analysis con LLM
- ✅ Onboarding minimalista
- ✅ Interfaz Telegram

### Fase 2 (Futuro)
- 🔜 Herramientas básicas (filesystem, shell, search)
- 🔜 Sistema de skills

### Fase 3 (Futuro)
- 🔜 Compresión de memoria
- 🔜 Memoria semántica

### Fase 4 (Futuro)
- 🔜 Capabilities avanzadas (calendar, automation, learning)

## 📝 Licencia

MIT

## 🙏 Créditos

Desarrollado como reescritura minimalista de Flucastr.Arid V1.
