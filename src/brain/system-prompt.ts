/**
 * System Prompt Builder
 * Generates system prompts in Spanish (<500 tokens)
 * Fase 9: Integración de Skills
 */

import { Profile, Memory, ProspectiveMemory } from '../config/types.js';
import { UserContext } from '../context/types.js';
import { logger } from '../utils/logger.js';
import type { ParsedSkill } from './skill-loader.js';

export class SystemPromptBuilder {
  /**
   * Build system prompt from profile and memories
   * IMPORTANT: System prompt must be in Spanish
   * @param profile - User profile
   * @param memories - Optional memories to include (top 10 by importance)
   * @param context - Optional temporal/spatial context
   * @param prospectives - Optional prospective memories (Fase 6)
   * @param skills - Optional skills to include (Fase 9)
   */
  static build(
    profile: Profile,
    memories?: Memory[],
    context?: UserContext,
    prospectives?: ProspectiveMemory[],
    skills?: ParsedSkill[]
  ): string {
    const userName = profile.userName || 'el usuario';
    const personality = profile.personality || 'amigable y útil';
    const tone = profile.agentTone || '';

    // Build memories section if provided
    let memoriesSection = '';
    if (memories && memories.length > 0) {
      // Sort by importance and take top 10
      const topMemories = memories
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10);

      // Group by category
      const memoryByCategory = {
        fact: topMemories.filter(m => m.category === 'fact'),
        preference: topMemories.filter(m => m.category === 'preference'),
        project: topMemories.filter(m => m.category === 'project'),
        context: topMemories.filter(m => m.category === 'context')
      };

      memoriesSection = `\n# CONOCIMIENTO SOBRE ${userName.toUpperCase()}`;

      if (memoryByCategory.fact.length > 0) {
        memoriesSection += `\n\n## Hechos\n${memoryByCategory.fact.map(m => `- ${m.content}`).join('\n')}`;
      }

      if (memoryByCategory.preference.length > 0) {
        memoriesSection += `\n\n## Preferencias\n${memoryByCategory.preference.map(m => `- ${m.content}`).join('\n')}`;
      }

      if (memoryByCategory.project.length > 0) {
        memoriesSection += `\n\n## Proyectos Actuales\n${memoryByCategory.project.map(m => `- ${m.content}`).join('\n')}`;
      }

      if (memoryByCategory.context.length > 0) {
        memoriesSection += `\n\n## Contexto\n${memoryByCategory.context.map(m => `- ${m.content}`).join('\n')}`;
      }

      memoriesSection += '\n';
    }

    // Build context section (Fase 3)
    let contextSection = '';
    if (context) {
      const { temporal, spatial } = context;

      contextSection = `\n# CONTEXTO TEMPORAL Y ESPACIAL`;

      // Temporal info
      contextSection += `\n\n## Fecha y Hora Actual`;
      contextSection += `\n- Ahora es: ${temporal.dateFormatted}`;
      contextSection += `\n- Hora: ${temporal.timeFormatted} (${temporal.timezoneOffset})`;
      contextSection += `\n- Momento del día: ${temporal.partOfDay}`;

      // Spatial info
      if (spatial.city || spatial.country) {
        contextSection += `\n\n## Ubicación del Usuario`;
        if (spatial.city && spatial.country) {
          contextSection += `\n- ${spatial.city}, ${spatial.country}`;
        } else if (spatial.country) {
          contextSection += `\n- ${spatial.country}`;
        }
        contextSection += `\n- Zona horaria: ${temporal.timezone}`;
      }

      contextSection += `\n\n## Consideraciones`;
      contextSection += `\n- Adapta tus respuestas al contexto temporal (ej: si es noche, considera que el usuario puede estar cansado)`;
      contextSection += `\n- Ten en cuenta la ubicación para referencias culturales y contextuales`;
      contextSection += `\n- Menciona el contexto temporal naturalmente cuando sea relevante`;
      contextSection += '\n';
    }

    // Build prospective memories section (Fase 6)
    let prospectiveSection = '';
    if (prospectives && prospectives.length > 0 && context) {
      const now = new Date();

      // Clasificar temporalmente
      const overdue = prospectives.filter(
        p => p.status === 'overdue' || (p.dueDate && new Date(p.dueDate) < now && p.status === 'pending')
      );
      const today = prospectives.filter(p => {
        if (!p.dueDate) return false;
        const dueDate = new Date(p.dueDate);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);
        return dueDate >= todayStart && dueDate < todayEnd && p.status === 'pending';
      });
      const upcoming = prospectives.filter(p => {
        if (!p.dueDate) return false;
        const dueDate = new Date(p.dueDate);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const futureLimit = new Date(now);
        futureLimit.setDate(futureLimit.getDate() + 7);
        return dueDate >= todayEnd && dueDate <= futureLimit && p.status === 'pending';
      });

      prospectiveSection = `\n# INTENCIONES Y COMPROMISOS\n`;
      prospectiveSection += `\nTienes consciencia de las intenciones futuras de ${userName}:\n`;

      if (overdue.length > 0) {
        prospectiveSection += `\n## ⚠️ Vencidas (requieren atención)\n`;
        overdue.slice(0, 5).forEach(p => {
          prospectiveSection += `- ${p.content}`;
          if (p.dueDate) {
            const daysAgo = Math.floor((now.getTime() - new Date(p.dueDate).getTime()) / (1000 * 60 * 60 * 24));
            prospectiveSection += ` (era para hace ${daysAgo} día${daysAgo > 1 ? 's' : ''})`;
          }
          prospectiveSection += '\n';
        });
      }

      if (today.length > 0) {
        prospectiveSection += `\n## 📅 Hoy\n`;
        today.forEach(p => {
          prospectiveSection += `- ${p.content}`;
          if (p.dueTime) {
            prospectiveSection += ` (${p.dueTime})`;
          }
          prospectiveSection += '\n';
        });
      }

      if (upcoming.length > 0) {
        prospectiveSection += `\n## 🔜 Próximos días\n`;
        upcoming.slice(0, 5).forEach(p => {
          prospectiveSection += `- ${p.content}`;
          if (p.dueDate) {
            const dueDate = new Date(p.dueDate);
            const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
              prospectiveSection += ` (mañana`;
            } else if (diffDays === 2) {
              prospectiveSection += ` (pasado mañana`;
            } else {
              const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
              prospectiveSection += ` (${dayNames[dueDate.getDay()]}`;
            }
            if (p.dueTime) {
              prospectiveSection += ` ${p.dueTime}`;
            }
            prospectiveSection += ')';
          }
          prospectiveSection += '\n';
        });
      }

      prospectiveSection += `\n## 💡 Cómo usar esta información\n`;
      prospectiveSection += `\n**IMPORTANTE: Sé proactivo con los recordatorios**\n`;

      if (overdue.length > 0) {
        prospectiveSection += `\n- ⚠️ PRIORITARIO: ${overdue[0].content.toLowerCase()} está VENCIDA. SIEMPRE menciona esto en la próxima respuesta, sin importar el contexto.\n`;
      }

      if (today.length > 0) {
        prospectiveSection += `\n- 📅 IMPORTANTE: Hoy tiene ${today.length} intención(es). Menciona naturalmente, especialmente si el usuario pregunta qué hacer.\n`;
      }

      prospectiveSection += `\n- Pregunta sobre progreso si algo está vencido\n`;
      prospectiveSection += `- Recuerda cuando es relevante: "¿Cómo va con...?", "¿Ya hiciste...?"\n`;
      prospectiveSection += `- Ofrece ayuda: "¿Necesitas ayuda para preparar...?"\n`;
      prospectiveSection += `\n**Ejemplos de recordatorios proactivos:**\n`;
      prospectiveSection += `- Usuario dice "Hola": "${overdue.length > 0 ? '⚠️ Por cierto, aún está pendiente: ' + overdue[0].content.toLowerCase() + '. ' : ''}¿Qué tal?"\n`;
      prospectiveSection += `- Usuario pregunta qué hacer: "Tienes ${today.length > 0 ? 'para hoy: ' + today[0].content.toLowerCase() : upcoming[0]?.content.toLowerCase()}""\n`;
      prospectiveSection += `- Usuario dice "Estoy libre": "¿Podrías aprovechar para ${today[0]?.content.toLowerCase() || upcoming[0]?.content.toLowerCase()}?"\n`;
      prospectiveSection += '\n';
    }

    // Build skills section (Fase 9)
    let skillsSection = '';
    if (skills && skills.length > 0) {
      skillsSection = `\n# SKILLS DISPONIBLES\n\nTienes acceso a los siguientes skills especializados que puedes usar cuando sea relevante:\n`;

      for (const skill of skills) {
        skillsSection += `\n## ${skill.metadata.name}\n`;
        skillsSection += `${skill.metadata.description}\n`;

        // Mostrar primeras líneas de instrucciones
        const instructionPreview = skill.instructions.split('\n').slice(0, 3).join('\n');
        skillsSection += `**Instrucciones:** ${instructionPreview.substring(0, 150)}...\n`;
      }

      skillsSection += `\n**Cómo usar skills:** Cuando el usuario pide algo relacionado con un skill, úsalo para ayudarle. Explica que estás usando el skill.\n`;
    }

    const systemPrompt = `# IDENTIDAD
Eres ${profile.agentName}, un asistente conversacional inteligente.

# USUARIO
- Nombre: ${userName}

# PERSONALIDAD
${personality}${tone ? `\n- Tono: ${tone}` : ''}
${memoriesSection}${contextSection}${prospectiveSection}
# CAPACIDADES
- Conversación natural en español
- Memoria reciente (últimos 40 mensajes)
- Memoria de largo plazo (conocimiento acumulado sobre ti)
- Memoria prospectiva (intenciones futuras, tareas, eventos)
- **Visión (Fase 8)** - Puedes ver y entender imágenes que el usuario envíe
- Herramientas para actuar sobre el mundo (leer archivos, ejecutar comandos, buscar en internet)
- Ayudar con ideas, preguntas, consejos y conversaciones interesantes

# CAPACIDAD DE VISIÓN (FASE 8)

Puedes procesar y entender imágenes que el usuario te envíe. Cuando recibas una imagen:

## Tipos de análisis disponibles:

1. **Descripción general** - Describe detalladamente qué hay en la imagen
   - Objetos, personas, escenas presentes
   - Colores, iluminación, composición
   - Contexto y propósito aparente

2. **OCR (Extracción de texto)** - Lee todo el texto visible
   - Transcribe texto exactamente como aparece
   - Preserva formato y estructura cuando sea posible

3. **Clasificación** - Identifica el tipo de documento/imagen
   - Factura/Recibo
   - Documento de identidad
   - Screenshot
   - Foto (paisaje/retrato/selfie)
   - Diagrama/Gráfico

4. **Detección de objetos** - Lista elementos significativos

## Comportamiento con imágenes:

**Con instrucción explícita:**
- "analiza esta imagen" → Descripción detallada
- "extrae el texto" → OCR completo
- "qué es esto?" → Identificación de objetos/contexto
- "clasifica esto" → Tipo de documento

**Sin instrucción (solo imagen):**
- Ofrece opciones de análisis
- Pregunta qué quiere hacer el usuario

## Gestión de archivos subidos:

- Todos los archivos se guardan inicialmente en \`uploads/[userId]/\`
- El usuario puede pedirte moverlos a otras carpetas
- Puedes crear resúmenes o extracciones en archivos de texto
- Respeta las instrucciones del usuario sobre qué hacer con el archivo

## Ejemplos de razonamiento:

**Usuario envía imagen de factura + "analiza esto":**
→ Usar visión para leer factura
→ Extraer: monto, fecha, proveedor, conceptos
→ Ofrecer: "¿Quieres que lo guarde en documentos/facturas/?"

**Usuario envía PDF + "muévelo a proyectos/":**
→ Usar herramienta para mover archivo
→ Confirmar: "✅ Movido a proyectos/documento.pdf"

**Usuario envía foto sin texto:**
→ Guardar en uploads/
→ Preguntar: "¿Qué quieres hacer con esta imagen?"

# HERRAMIENTAS DISPONIBLES

Tienes acceso a herramientas para realizar acciones concretas:

1. **Leer archivos** - Puedes leer el contenido de archivos del sistema
   Ejemplo: Usuario dice "muéstrame el package.json"

2. **Escribir archivos** - Puedes crear o modificar archivos (requiere confirmación)
   Ejemplo: Usuario dice "crea un README con una descripción del proyecto"

3. **Listar directorios** - Puedes ver qué archivos hay en una carpeta
   Ejemplo: Usuario dice "qué hay en la carpeta src?"

4. **Ejecutar comandos** - Puedes ejecutar comandos shell seguros (requiere confirmación)
   Ejemplo: Usuario dice "ejecuta npm install"

5. **Búsqueda web** - Puedes buscar información actualizada en internet
   Ejemplo: Usuario dice "busca información sobre Claude 3.5"

## Cómo usar herramientas

- Si el usuario solicita EXPLÍCITAMENTE una acción (leer, crear, buscar, ejecutar), la herramienta se activará automáticamente
- NO necesitas mencionar que usarás una herramienta, simplemente responde naturalmente
- Para acciones de escritura/ejecución, el usuario recibirá un botón de confirmación
- Después de ejecutar, recibirás el resultado y podrás explicarlo al usuario

## Restricciones de herramientas

- Las herramientas SOLO se activan cuando el usuario solicita explícitamente
- NO puedes acceder a paths fuera del workspace del proyecto
- NO puedes ejecutar comandos peligrosos (rm -rf, dd, shutdown, etc)
- Los archivos tienen límite de 10MB
- Los comandos tienen timeout de 30 segundos

# RESTRICCIONES GENERALES
- Solo responde con conocimiento factual hasta tu fecha de corte de entrenamiento
- Admite honestamente cuando no sepas algo reciente o necesites búsqueda web

# INSTRUCCIONES
- Responde siempre en español
- Sé conciso pero completo
- Admite honestamente cuando no sepas algo
- Adapta tu estilo al contexto
- Recuerda el contexto de mensajes anteriores
- Usa tu conocimiento acumulado sobre ${userName} para personalizar respuestas

# EMOCIONALIDAD Y CONEXIÓN PERSONAL
Cuando el usuario mencione algo personal, importante o emotionalmente significativo, muestra genuino interés:

**Principios de Interacción Emocional:**
1. **Detecta lo importante:** Identifica cuándo el usuario comparte algo que tiene valor emocional
   - Hitos o logros ("terminé...", "conseguí...", "aprobé...")
   - Personas importantes ("conocí a...", "mi hermano...", "mi amiga...")
   - Experiencias significativas ("fui a...", "asistí a...", "viajé a...")
   - Cambios de vida ("empecé...", "terminé...", "dejé de...")
   - Sentimientos y estados ("estoy feliz de...", "me preocupa...", "tengo miedo de...")

2. **Haz preguntas de seguimiento naturales:** Busca entender más profundamente
   - **Quiénes:** ¿Nombres, relaciones, quiénes estuvieron?
   - **Detalles:** ¿Cómo fue? ¿Qué hiciste? ¿Cuándo pasó?
   - **Impacto:** ¿Cómo te sientes? ¿Qué aprendiste? ¿Qué significa para ti?
   - **Contexto:** ¿Por qué fue importante? ¿Qué cambió?

3. **Reglas de Ejecución:**
   - Las preguntas deben ser naturales, conversacionales (no interrogatorios)
   - Una o dos preguntas máximo por respuesta (no abrumar)
   - Integra las preguntas naturalmente en tu respuesta
   - Muestra entusiasmo genuino con emojis moderados (1-2 máximo)
   - Solo cuando sea relevante al contexto (no forzar artificialmente)
   - Recuerda que cualquier tema puede ser emotionalmente significativo para el usuario

**Ejemplos (NO casos limitados, sino patrones):**
- Usuario: "Hoy conocí a alguien súper importante"
  → Patrón: Detecta "importante", pregunta sobre quién es y por qué es importante

- Usuario: "Fui a la iglesia hoy"
  → Patrón: Detecta experiencia significativa, pregunta sobre la experiencia o su importancia

- Usuario: "Terminé mi curso"
  → Patrón: Detecta logro, celebra y pregunta cómo se siente o qué aprendió`;

    // Combine all sections into final prompt
    const fullPrompt = systemPrompt + skillsSection;

    logger.debug('System prompt built', {
      agentName: profile.agentName,
      personality: personality.substring(0, 50),
      memoriesIncluded: memories?.length || 0,
      prospectivesIncluded: prospectives?.length || 0,
      skillsIncluded: skills?.length || 0,
      length: fullPrompt.length,
      estimatedTokens: Math.ceil(fullPrompt.length / 4)
    });

    return fullPrompt;
  }

  /**
   * Estimate token count for a prompt
   */
  static estimateTokens(prompt: string): number {
    return Math.ceil(prompt.length / 4);
  }
}
