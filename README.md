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

### Fase 3 ✅ (Completada)

- ✅ **Contexto Temporal:** Conciencia de fecha, hora y momento del día (mañana/tarde/noche)
- ✅ **Contexto Espacial:** Conocimiento de ubicación del usuario (ciudad, país, timezone)
- ✅ **Respuestas Contextuales:** Adaptación automática al contexto temporal y geográfico
- ✅ **Timezone Support:** Soporte completo para zonas horarias IANA (40+ países)
- ✅ **Onboarding de Ubicación:** Pregunta opcional sobre ciudad y país
- ✅ **Sin Dependencias:** Usa Intl.DateTimeFormat nativo de JavaScript

### Fase 4 ✅ (Completada)

- ✅ **Formato MarkdownV2:** Respuestas visuales con formato en Telegram
- ✅ **MarkdownTranslator:** Conversión segura Markdown → MarkdownV2
- ✅ **Headings, listas, código:** Soporte completo de formato
- ✅ **Fallback automático:** A texto plano si falla el formato

### Fase 5 ✅ (Completada)

- ✅ **Transcripción de Audio:** Mensajes de voz mediante Whisper
- ✅ **WhisperService:** Integración con servicio Whisper ASR
- ✅ **Fallback robusto:** Intenta dos endpoints (/asr y /v1/audio/transcriptions)
- ✅ **Manejo de errores:** Mensajes claros cuando Whisper no está disponible
- ✅ **Indicadores visuales:** 🎙 grabando → ✏️ escribiendo
- ✅ **Limpieza automática:** Archivos temporales eliminados después de transcripción

## 🏗️ Arquitectura

```
AridV2
├── Brain (Cerebro)       - Orquestación de conversación
│   ├── IntentAnalyzer    - Análisis de intención con LLM
│   ├── MemoryExtractor   - Extracción automática de memorias
│   └── SystemPromptBuilder - Construcción de prompts con contexto
├── Context               - Contexto temporal y espacial
│   ├── ContextProvider   - Obtención de contexto temporal/espacial
│   └── TimezoneUtils     - Utilidades de timezone y formateo
├── Senses (Sentidos)     - Inputs (Telegram)
├── Hands (Manos)         - Tools (vacío en Fase 1-3)
├── LLM Layer            - Multi-provider abstraction
├── Storage              - JSON-based (historial, perfiles, tokens, memorias)
│   ├── ConversationStore - Últimos 40 mensajes
│   ├── ProfileStore      - Perfil del usuario (+ ubicación)
│   └── MemoryStore       - Memorias de largo plazo
└── Onboarding           - Setup inicial (5 preguntas)
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
- `WHISPER_URL`: URL del servicio Whisper (default: http://localhost:9000)
- `WHISPER_MODEL`: Modelo Whisper (default: base)
- `WHISPER_LANGUAGE`: Idioma de transcripción (default: es)

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

## 🌍⏰ Sistema de Contexto Temporal y Espacial (Fase 3)

AridV2 ahora tiene conciencia de **cuándo** y **dónde** estás para conversaciones más naturales y conectadas.

### ¿Qué incluye?

**Contexto Temporal:**
- Fecha y hora actual según tu zona horaria
- Momento del día (mañana/tarde/noche)
- Día de la semana

**Contexto Espacial:**
- Tu ciudad y país
- Zona horaria IANA (ej: "America/Argentina/Buenos_Aires")

### Impacto en las conversaciones

**Antes (sin contexto):**
```
Usuario: "Tengo hambre"
Asistente: "¿Qué te gustaría comer?"
```

**Después (con contexto):**
```
Usuario: "Tengo hambre"
Asistente: "Son las 12:30, ¿quieres que te sugiera algo para almorzar?"

Usuario: "¿Qué hago hoy?"
Asistente: "Es viernes por la tarde en Buenos Aires, ¿tienes planes para el fin de semana?"
```

### Configuración de ubicación

Durante el onboarding, se te preguntará opcionalmente:
```
¿En qué ciudad y país te encuentras?
Ejemplo: Buenos Aires, Argentina
```

El sistema derivará automáticamente tu zona horaria y usará esta información para:
- Adaptar respuestas al momento del día
- Hacer referencias temporales naturales
- Considerar tu contexto geográfico

### Soporte de Timezones

Soporta 40+ países con sus zonas horarias principales:
- América Latina: Argentina, México, Chile, Colombia, Perú, etc.
- Europa: España, Francia, Italia, Alemania, UK, etc.
- Otros: Brasil, USA, etc.

Fallback a UTC si no se reconoce el país.

## 🎙️ Sistema de Transcripción de Audio (Fase 5)

AridV2 ahora acepta **mensajes de voz** que transcribe automáticamente usando Whisper.

### ¿Cómo funciona?

1. **Envía mensaje de voz:** Graba y envía un mensaje de voz por Telegram
2. **Indicador visual:** Verás el indicador "🎙 grabando..."
3. **Transcripción automática:** Whisper transcribe el audio a texto
4. **Procesamiento:** El texto se procesa como un mensaje normal
5. **Respuesta:** Recibes la respuesta formateada

### Configuración de Whisper

AridV2 requiere un servicio Whisper corriendo en Docker:

```bash
# Docker Compose (recomendado)
services:
  whisper:
    image: onerahmet/openai-whisper-asr-webservice:latest
    container_name: whisper
    restart: always
    ports:
      - "9000:9000"
    environment:
      - ASR_MODEL=base  # tiny, base, small, medium, large
      - ASR_ENGINE=faster_whisper

# Iniciar servicio
docker-compose up -d whisper
```

### Manejo de errores

Si Whisper no está disponible, recibirás un mensaje claro:
```
[Audio recibido - Whisper no disponible. Inicia el servicio en http://localhost:9000]
```

### Ventajas

- ✅ **Manos libres:** Habla en lugar de escribir
- ✅ **Natural:** Más rápido para conversaciones largas
- ✅ **Accesible:** Mejor experiencia para usuarios con limitaciones de escritura
- ✅ **Robusto:** Fallback entre endpoints si uno falla

## 🏛️ Estructura del Proyecto

```
src/
├── brain/               # Core de conversación
│   ├── brain.ts        # Orquestador principal
│   ├── intent-analyzer.ts   # Análisis de intención con LLM
│   ├── memory-extractor.ts  # Extracción de memorias
│   ├── system-prompt.ts     # Construcción de system prompt
│   └── token-tracker.ts     # Tracking de tokens
├── context/            # Contexto temporal/espacial
│   ├── context-provider.ts  # Proveedor de contexto
│   ├── timezone-utils.ts    # Utilidades de timezone
│   └── types.ts             # Interfaces
├── transcription/      # Transcripción de audio
│   └── whisper.service.ts   # Servicio Whisper
├── senses/telegram/    # Interfaz Telegram
│   ├── bot.ts          # Setup del bot
│   ├── handlers.ts     # Handlers (text + voice)
│   ├── formatter.ts    # Formateo MarkdownV2
│   └── markdown-translator.ts  # Traductor Markdown
├── hands/              # Tools (vacío en Fases 1-5)
├── llm/                # Multi-provider LLM
├── storage/            # Persistencia JSON
│   ├── conversation.store.ts
│   ├── profile.store.ts
│   ├── memory.store.ts
│   └── onboarding.store.ts
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

**Fase 5 (Actual):**
- **Líneas de código:** ~4,100 (vs 8,000 en V1)
- **System prompt:** <800 tokens (base + memorias + contexto)
- **Memoria:** 40 mensajes + memorias de largo plazo
- **Costo estimado:** ~$0.00125/mensaje (hybrid mode, sin cambio)
- **Módulos:** 7 (brain, context, transcription, llm, storage, senses, onboarding)
- **Archivos fuente:** 30

**Evolución de costos:**
- Fase 1: ~$0.001/mensaje (conversación básica)
- Fase 2: ~$0.0012/mensaje (+20% por memorias)
- Fase 3: ~$0.00125/mensaje (+4% por contexto temporal/espacial)
- Fase 4: ~$0.00125/mensaje (sin cambio, mejora UX)
- Fase 5: ~$0.00125/mensaje (sin cambio, Whisper es gratis/local)

## 🛣️ Roadmap

### Fase 1 ✅ (Completada)
- ✅ Conversación pura con multi-provider LLM
- ✅ Memoria simple (40 mensajes)
- ✅ Intent analysis con LLM
- ✅ Onboarding minimalista
- ✅ Interfaz Telegram

### Fase 2 ✅ (Completada)
- ✅ Sistema de memoria dinámica
- ✅ Extracción automática de memorias
- ✅ Categorización inteligente
- ✅ Comando /memories

### Fase 3 ✅ (Completada)
- ✅ Contexto temporal (fecha, hora, momento del día)
- ✅ Contexto espacial (ubicación, timezone)
- ✅ Respuestas contextuales adaptativas
- ✅ Soporte de timezones IANA

### Fase 4 ✅ (Completada)
- ✅ Formato MarkdownV2 para Telegram
- ✅ Traductor seguro de Markdown
- ✅ Fallback automático a texto plano

### Fase 5 ✅ (Completada)
- ✅ Transcripción de audio con Whisper
- ✅ Manejo robusto de mensajes de voz
- ✅ Indicadores visuales y UX mejorada

### Fase 6 (Futuro)
- 🔜 Herramientas básicas (filesystem, shell, search)
- 🔜 Sistema de skills

### Fase 7 (Futuro)
- 🔜 Compresión de memoria
- 🔜 Memoria semántica con embeddings

### Fase 8 (Futuro)
- 🔜 Capabilities avanzadas (calendar, automation, learning)

## 📝 Licencia

MIT

## 🙏 Créditos

Desarrollado como reescritura minimalista de Flucastr.Arid V1.
