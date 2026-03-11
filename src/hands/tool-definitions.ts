/**
 * Tool Definitions for LLM Tool Use
 * Define todas las herramientas disponibles para que el LLM las use
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Herramientas disponibles para el LLM
 */
export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    name: 'execute_command',
    description: 'Ejecuta un comando shell en el workspace. Útil para operaciones de sistema, git, npm, curl, APIs, etc. Retorna la salida del comando.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'El comando shell a ejecutar (ej: "curl -s https://api.github.com/user", "ls -la", "git status")'
        },
        description: {
          type: 'string',
          description: 'Descripción breve de qué hace el comando (opcional)'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Lee el contenido completo de un archivo del workspace.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Ruta relativa del archivo a leer (relativo al workspace)'
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'write_file',
    description: 'Escribe o sobrescribe un archivo en el workspace.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Ruta relativa del archivo a escribir'
        },
        content: {
          type: 'string',
          description: 'Contenido completo del archivo'
        }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'web_search',
    description: 'Busca información en internet usando Tavily API. Retorna resultados relevantes.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Consulta de búsqueda'
        },
        max_results: {
          type: 'number',
          description: 'Número máximo de resultados (default: 5)'
        }
      },
      required: ['query']
    }
  }
];
