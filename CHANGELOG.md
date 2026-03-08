# Changelog

All notable changes to AridV2 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-08

### Added - Fase 2: Sistema de Memoria Dinámica

- **MemoryStore**: Sistema de almacenamiento y gestión de memorias
  - CRUD completo para memorias del usuario
  - Ordenamiento automático por importancia
  - Filtrado por categoría (fact, preference, project, context)
  - Tracking de accesos (lastAccessed, accessCount)
  - Búsqueda por contenido

- **MemoryExtractor**: Extracción automática de memorias usando LLM
  - Análisis inteligente de conversaciones
  - System prompt en español optimizado
  - Categorización automática
  - Score de importancia (0.0-1.0)
  - Prevención de duplicados

- **SystemPromptBuilder Enhancement**: Soporte para memorias en system prompt
  - Sección "CONOCIMIENTO SOBRE [USUARIO]"
  - Top 10 memorias por importancia
  - Organización por categorías
  - Prompt total <800 tokens

- **Brain Integration**: Integración completa del sistema de memoria
  - Obtención de memorias antes de generar respuesta
  - Inclusión de memorias en system prompt
  - Extracción automática después de cada mensaje
  - Logging detallado

- **Telegram Command `/memories`**: Inspección de memorias guardadas
  - Visualización por categorías
  - Formato Markdown
  - Contador total

- **Tests**: Suite de tests para MemoryStore
  - 10 tests unitarios
  - Cobertura completa de funcionalidad

### Changed

- System prompt ahora incluye memoria de largo plazo
- Mensaje de `/start` actualizado con nuevo comando
- README.md actualizado con documentación de Fase 2

### Performance

- Costo por mensaje: ~$0.0012 (vs $0.001 en Fase 1)
- Incremento: +20% por funcionalidad de memoria
- System prompt con memorias: <800 tokens

## [0.1.0] - 2026-03-07

### Added - Fase 1: Núcleo Conversacional

- **Multi-Provider LLM**: Soporte para Anthropic Claude, Google Gemini, y Ollama
- **Hybrid Mode**: Selección automática de modelo según complejidad
- **Intent Analysis**: Análisis de intención usando LLM (no keywords)
- **JSON Storage**: Sistema de persistencia sin dependencias nativas
- **Conversation Management**: Historial de últimos 40 mensajes
- **Profile System**: Perfiles personalizables por usuario
- **Token Tracking**: Seguimiento real de uso de tokens
- **Prompt Caching**: Optimización de costos en Anthropic (72% ahorro)
- **Onboarding**: Flujo inicial de 4 preguntas
- **Telegram Bot**: Interfaz completa con comandos
  - `/start` - Bienvenida
  - `/reset` - Limpiar historial
  - `/profile` - Ver perfil
  - `/stats` - Estadísticas de tokens

### Technical Details

- TypeScript 5.9
- Node.js 22+
- JSON-based storage (no external DB)
- ~2,200 líneas de código
- Sistema minimalista y extensible
