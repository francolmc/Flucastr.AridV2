import { logger } from '../utils/logger.js';
import { SkillCommandDetector } from './skill-command-detector.js';

/**
 * SkillTemplateGenerator - Genera templates de SKILL.md automáticamente (Fase 9)
 *
 * Responsabilidades:
 * - Convertir descripción natural del usuario en SKILL.md estructurado
 * - Extraer keywords y metadata de la descripción
 * - Detectar credenciales necesarias analizando el contenido
 * - Generar YAML frontmatter correcto
 * - Crear estructura markdown base
 *
 * Ejemplo:
 * Input: "Quiero un skill para crear issues en GitHub"
 * Output: YAML frontmatter con name, description, keywords
 *         Instructions con pasos para crear issues
 *         Detección automática de GITHUB_TOKEN como credential
 */
export class SkillTemplateGenerator {
  private readonly commandDetector: SkillCommandDetector;

  constructor() {
    this.commandDetector = new SkillCommandDetector();
    logger.info('SkillTemplateGenerator initialized');
  }

  /**
   * Genera template de skill a partir de descripción del usuario
   * Incluye: name, frontmatter, instructions, y credenciales sugeridas
   */
  async generateFromDescription(
    description: string,
    conversationContext?: string
  ): Promise<{
    skillName: string;
    frontmatter: string;
    instructions: string;
    suggestedCredentials: string[];
  }> {
    logger.info('Generating skill from description', {
      descriptionLength: description.length,
      hasContext: !!conversationContext,
    });

    // Paso 1: Extraer name y keywords
    const { skillName, keywords } = this.extractMetadata(description);

    // Paso 2: Generar descripción formal
    const formalDescription = this.generateDescription(description);

    // Paso 3: Generar instrucciones base
    const instructions = this.generateInstructions(description, conversationContext);

    // Paso 4: Detectar credenciales necesarias
    const suggestedCredentials = this.detectRequiredCredentials(description, instructions);

    // Paso 5: Generar YAML frontmatter
    const frontmatter = this.generateFrontmatter(skillName, formalDescription, keywords, suggestedCredentials);

    logger.info('Skill template generated', {
      skillName,
      keywordCount: keywords.length,
      credentialCount: suggestedCredentials.length,
      frontmatterLength: frontmatter.length,
      instructionsLength: instructions.length,
    });

    return {
      skillName,
      frontmatter,
      instructions,
      suggestedCredentials,
    };
  }

  /**
   * Extrae nombre del skill y keywords de la descripción
   * Genera skill-name-like en lugar de nombre largo
   */
  private extractMetadata(description: string): { skillName: string; keywords: string[] } {
    const lowerDesc = description.toLowerCase();

    // Intentar extraer nombre de patrones comunes
    let skillName = 'new-skill';

    // Patrones: "skill para [cosa]", "skill que [acción]"
    const nameMatch = description.match(/(?:para|que|de)\s+(.+?)(?:\.|,|$)/i);
    if (nameMatch) {
      const candidate = nameMatch[1].trim();
      skillName = this.normalizeSkillName(candidate);
    }

    // Extraer keywords relevantes
    const keywords: string[] = [];

    // Keywords automáticas basadas en patrones de ejemplo
    // Este mapeo es extensible: agregar más patrones según tipos de skills que crezcas
    const keywordPatterns: { [key: string]: string[] } = {
      github: ['github', 'repos', 'issues', 'github-api', 'repository'],
      docker: ['docker', 'containers', 'images', 'docker-compose'],
      api: ['api', 'rest', 'http', 'request', 'endpoint'],
      python: ['python', 'script', 'data', 'automation'],
      bash: ['bash', 'shell', 'script', 'command', 'cli'],
      email: ['email', 'gmail', 'smtp', 'mail', 'enviar'],
      file: ['archivo', 'file', 'crear', 'write', 'read'],
      database: ['database', 'sql', 'db', 'query', 'datos'],
      web: ['web', 'scrape', 'crawl', 'html', 'navegador'],
      deploy: ['deploy', 'desplegar', 'producción', 'servidor', 'release'],
    };

    for (const [pattern, kws] of Object.entries(keywordPatterns)) {
      if (lowerDesc.includes(pattern)) {
        keywords.push(...kws);
      }
    }

    // Deduplicar y limitar a 5 keywords
    const uniqueKeywords = [...new Set(keywords)].slice(0, 5);

    return {
      skillName,
      keywords: uniqueKeywords.length > 0 ? uniqueKeywords : ['custom', 'automation'],
    };
  }

  /**
   * Normaliza el nombre a formato skill-like (lowercase with hyphens)
   */
  private normalizeSkillName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') // Trim hyphens
      .substring(0, 30); // Límite de longitud
  }

  /**
   * Genera descripción formal a partir de la descripción del usuario
   */
  private generateDescription(userDescription: string): string {
    // Si el usuario ya dio una buena descripción, usarla
    if (userDescription.length > 50) {
      return userDescription.trim();
    }

    // Si es muy corta, expandir
    const patterns: { [key: string]: string } = {
      github: 'Integración con GitHub para gestionar repositorios, issues y pull requests',
      docker: 'Control de contenedores Docker y administración de imágenes',
      python: 'Ejecución de scripts Python con captura de output',
      bash: 'Ejecución de comandos bash/shell personalizados',
      api: 'Cliente para realizar peticiones HTTP a APIs REST',
      email: 'Envío de emails y gestión de correo electrónico',
      deploy: 'Despliegue y manejo de aplicaciones en producción',
    };

    for (const [pattern, description] of Object.entries(patterns)) {
      if (userDescription.toLowerCase().includes(pattern)) {
        return description;
      }
    }

    return `Skill personalizado: ${userDescription}`;
  }

  /**
   * Genera instrucciones base para el skill
   */
  private generateInstructions(userDescription: string, context?: string): string {
    const lowerDesc = userDescription.toLowerCase();

    let instructions = `# Instrucciones\n\n`;

    // Sección de uso
    instructions += `## Cuándo usar este skill\n\n`;
    instructions += `- ${userDescription}\n`;
    if (context) {
      instructions += `- Basado en contexto: ${context.substring(0, 100)}\n`;
    }
    instructions += `\n`;

    // Sección de prerrequisitos
    instructions += `## Prerrequisitos\n\n`;

    if (
      lowerDesc.includes('github') ||
      lowerDesc.includes('api') ||
      lowerDesc.includes('curl') ||
      lowerDesc.includes('request')
    ) {
      instructions += `- Acceso a API (puede requerir token de autenticación)\n`;
    }
    if (lowerDesc.includes('python')) {
      instructions += `- Python 3.8+ instalado\n`;
    }
    if (lowerDesc.includes('docker')) {
      instructions += `- Docker instalado y ejecutándose\n`;
    }
    if (lowerDesc.includes('bash') || lowerDesc.includes('command') || lowerDesc.includes('shell')) {
      instructions += `- Acceso a terminal/shell\n`;
    }

    instructions += `\n`;

    // Sección de uso
    instructions += `## Cómo usar\n\n`;
    instructions += `\`\`\`bash\n`;

    if (lowerDesc.includes('github')) {
      instructions += `# Ejemplo: Listar repositorios\n`;
      instructions += `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user/repos\n`;
    } else if (lowerDesc.includes('docker')) {
      instructions += `# Ejemplo: Listar contenedores\n`;
      instructions += `docker ps -a\n`;
    } else if (lowerDesc.includes('python')) {
      instructions += `# Ejemplo: Ejecutar script\n`;
      instructions += `python script.py\n`;
    } else {
      instructions += `# Comando de ejemplo (reemplazar según necesidad)\n`;
      instructions += `# [INSERTA COMANDO AQUÍ]\n`;
    }

    instructions += `\`\`\`\n\n`;

    // Sección de output esperado
    instructions += `## Output esperado\n\n`;
    instructions += `Dependiendo de la acción, podrás obtener:\n`;
    instructions += `- Datos en formato JSON/texto\n`;
    instructions += `- Confirmación de ejecución\n`;
    instructions += `- Resultados de búsqueda o listado\n\n`;

    // Sección de notas
    instructions += `## Notas importantes\n\n`;
    instructions += `- Siempre revisar los datos antes de ejecutar operaciones destructivas\n`;
    instructions += `- Mantener tokens/credentials seguros\n`;
    instructions += `- Respetar rate limits de APIs\n`;

    return instructions;
  }

  /**
   * Detecta credenciales necesarias analizando la descripción e instrucciones
   */
  private detectRequiredCredentials(description: string, instructions: string): string[] {
    const credentials = new Set<string>();
    const combined = `${description}\n${instructions}`.toLowerCase();

    // Mapeo de palabras clave a variables de entorno
    const credentialMappings: { [key: string]: string[] } = {
      github: ['GITHUB_TOKEN'],
      gitlab: ['GITLAB_TOKEN'],
      bitbucket: ['BITBUCKET_TOKEN'],
      api: ['API_KEY', 'API_TOKEN'],
      amazon: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
      aws: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
      azure: ['AZURE_SUBSCRIPTION_ID', 'AZURE_TENANT_ID'],
      gcp: ['GCP_PROJECT_ID', 'GCP_CREDENTIALS'],
      google: ['GOOGLE_API_KEY'],
      slack: ['SLACK_BOT_TOKEN', 'SLACK_WEBHOOK_URL'],
      telegram: ['TELEGRAM_BOT_TOKEN'],
      discord: ['DISCORD_BOT_TOKEN'],
      openai: ['OPENAI_API_KEY'],
      anthropic: ['ANTHROPIC_API_KEY'],
      database: ['DATABASE_URL', 'DB_PASSWORD'],
      sql: ['DATABASE_URL'],
      postgres: ['DATABASE_URL'],
      mysql: ['DB_HOST', 'DB_USER', 'DB_PASSWORD'],
      mongodb: ['MONGO_URI'],
      email: ['EMAIL_USER', 'EMAIL_PASSWORD', 'SMTP_PASSWORD'],
      smtp: ['SMTP_USER', 'SMTP_PASSWORD', 'SMTP_HOST'],
      ssh: ['SSH_KEY', 'SSH_PASSWORD'],
    };

    for (const [keyword, creds] of Object.entries(credentialMappings)) {
      if (combined.includes(keyword)) {
        creds.forEach((c) => credentials.add(c));
      }
    }

    // También buscar referencias directas a variables ($VARIABLE o ${VARIABLE})
    const varRegex = /\$\{?([A-Z_][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD))\}?/g;
    let match;
    while ((match = varRegex.exec(combined)) !== null) {
      credentials.add(match[1]);
    }

    return Array.from(credentials).slice(0, 5); // Límite de 5 credenciales
  }

  /**
   * Genera YAML frontmatter correcto para el skill
   */
  private generateFrontmatter(
    skillName: string,
    description: string,
    keywords: string[],
    credentials: string[]
  ): string {
    let frontmatter = `---\n`;
    frontmatter += `name: "${skillName}"\n`;
    frontmatter += `description: "${description}"\n`;
    frontmatter += `keywords: [${keywords.map((k) => `"${k}"`).join(', ')}]\n`;

    if (credentials.length > 0) {
      frontmatter += `required-env: [${credentials.map((c) => `"${c}"`).join(', ')}]\n`;
    }

    frontmatter += `version: "1.0.0"\n`;
    frontmatter += `author: "user-generated"\n`;
    frontmatter += `---`;

    return frontmatter;
  }
}
