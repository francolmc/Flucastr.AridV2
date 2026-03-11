import { logger } from '../utils/logger.js';

/**
 * Resultado del análisis de comandos en un skill
 */
export interface SkillCommandAnalysis {
  needsExecution: boolean;
  commands: string[];
  requiresCredentials: string[];
  estimatedDuration: 'fast' | 'medium' | 'slow';  // Para decidir si usar background executor
}

/**
 * SkillCommandDetector - Analiza skills para detectar comandos y dependencias
 *
 * Responsabilidades:
 * - Parsear SKILL.md para identificar comandos
 * - Detectar credenciales requeridas
 * - Estimar duración de ejecución
 * - Validar seguridad de comandos antes de ejecutar
 *
 * Patrón de detección:
 * - Busca secciones ## COMANDOS o ### Usage en el skill
 * - Busca bloques de código ```bash o ```shell
 * - Busca referencias a variables de entorno: ${VAR_NAME} o $VAR_NAME
 * - Identifica patrones de larga duración: sleep, wait, curl (sin timeout), etc
 */
export class SkillCommandDetector {
  /**
   * Analiza un skill para detectar comandos que necesita ejecutar
   * @param skillContent Contenido markdown del skill (body sin frontmatter)
   * @returns Análisis completo del skill
   */
  analyzeSkill(skillContent: string): SkillCommandAnalysis {
    const analysis: SkillCommandAnalysis = {
      needsExecution: false,
      commands: [],
      requiresCredentials: [],
      estimatedDuration: 'fast'
    };

    // Buscar secciones de comandos
    const hasCommands = this.extractCommands(skillContent, analysis);
    
    // Buscar credenciales requeridas
    this.extractCredentialRequirements(skillContent, analysis);

    // Estimar duración basada en patrones de comandos
    if (hasCommands) {
      analysis.estimatedDuration = this.estimateDuration(analysis.commands);
      analysis.needsExecution = true;
    }

    logger.debug('Skill command analysis', {
      needsExecution: analysis.needsExecution,
      commandCount: analysis.commands.length,
      credentialsRequired: analysis.requiresCredentials,
      estimatedDuration: analysis.estimatedDuration
    });

    return analysis;
  }

  /**
   * Extrae comandos de bloques de código en el skill
   * Busca patrones: ```bash...```, ```shell...```, o menciones directas de cli
   */
  private extractCommands(content: string, analysis: SkillCommandAnalysis): boolean {
    // Regex para encontrar bloques de código bash/shell
    const commandBlockRegex = /```(?:bash|shell)\n([\s\S]*?)```/gi;
    let match;
    let foundCommands = false;

    while ((match = commandBlockRegex.exec(content)) !== null) {
      const blockContent = match[1];
      
      // Dividir por línea y extraer solo comandos válidos (no comments)
      const lines = blockContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      for (const line of lines) {
        // Saltar aliases, exports, etc
        if (!line.startsWith('alias') && !line.startsWith('export')) {
          analysis.commands.push(line);
          foundCommands = true;
        }
      }
    }

    // También buscar referencias explícitas a comandos en secciones ## COMANDOS o ### Ejemplo
    const commandSectionRegex = /#+\s*(?:COMANDOS?|USAGE|EJEMPLO|EJEMPLO?S)\s*\n([\s\S]*?)(?=##|$)/gi;
    while ((match = commandSectionRegex.exec(content)) !== null) {
      const sectionContent = match[1];
      
      // Buscar líneas que empiezan con $ (prompt bash)
      const bashCommandRegex = /^\$\s+(.+?)(?:\n|$)/gm;
      let cmdMatch;
      
      while ((cmdMatch = bashCommandRegex.exec(sectionContent)) !== null) {
        const cmd = cmdMatch[1].trim();
        if (cmd && !analysis.commands.includes(cmd)) {
          analysis.commands.push(cmd);
          foundCommands = true;
        }
      }
    }

    return foundCommands;
  }

  /**
   * Extrae variables de entorno requeridas (credentials)
   * Busca patrones: ${VAR}, $VAR, o menciones explícitas en secciones de requisitos
   */
  private extractCredentialRequirements(content: string, analysis: SkillCommandAnalysis): void {
    const credSet = new Set<string>();

    // Búsqueda 1: Variables en comandos existentes
    for (const cmd of analysis.commands) {
      const varRegex = /\$\{?([A-Z_][A-Z0-9_]*)\}?/g;
      let match;
      while ((match = varRegex.exec(cmd)) !== null) {
        const varName = match[1];
        // Filtrar variables comunes del sistema
        if (!this.isSystemVariable(varName)) {
          credSet.add(varName);
        }
      }
    }

    // Búsqueda 2: Secciones explícitas de requisitos
    const requiresRegex = /#+\s*(?:REQUISITOS?|REQUIRED|DEPENDENCIAS?|CREDENCIALES?)\s*\n([\s\S]*?)(?=##|$)/gi;
    let match;
    while ((match = requiresRegex.exec(content)) !== null) {
      const sectionContent = match[1];
      
      // Buscar menciones de variables: GITHUB_TOKEN, API_KEY, etc
      const varMentionRegex = /\b([A-Z_][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD))\b/g;
      let varMatch;
      while ((varMatch = varMentionRegex.exec(sectionContent)) !== null) {
        credSet.add(varMatch[1]);
      }

      // También buscar "requires: VARIABLE" o "needs: VARIABLE"
      const explicitRegex = /(?:requires?|needs?):\s*([A-Z_][A-Z0-9_]*)/gi;
      while ((explicitRegex.exec(sectionContent)) !== null) {
        credSet.add(explicitRegex.exec(sectionContent)?.[1] || '');
      }
    }

    analysis.requiresCredentials = Array.from(credSet).filter(v => v);
  }

  /**
   * Estima duración de ejecución basada en comandos
   */
  private estimateDuration(commands: string[]): 'fast' | 'medium' | 'slow' {
    const slowPatterns = [
      /sleep\s+\d+/,        // sleep X segundos
      /wait/,               // wait commands
      /curl.*(?!.*-m|.*--max-time)/,  // curl sin timeout
      /apt-get install/,    // package installation
      /npm install/,        // npm install
      /docker/,             // docker commands
      /npm run build/,      // build commands
      /yarn install/,       // yarn install
      /docker-compose/,     // compose
      /git clone/,          // git clone (puede ser lento)
    ];

    const mediumPatterns = [
      /curl/,               // curl con timeout implícito
      /wget/,               // wget
      /tar/,                // tar extraction
      /git/,                // git commands generales
      /npm test/,           // test execution
      /python script/,      // python scripts
    ];

    const slowCount = commands.filter(cmd => 
      slowPatterns.some(p => p.test(cmd))
    ).length;

    const mediumCount = commands.filter(cmd => 
      mediumPatterns.some(p => p.test(cmd))
    ).length;

    if (slowCount > 0) {
      return 'slow';
    } else if (mediumCount > 0 || commands.length > 3) {
      return 'medium';
    }
    return 'fast';
  }

  /**
   * Identifica si es una variable del sistema (no una credential)
   */
  private isSystemVariable(varName: string): boolean {
    const systemVars = [
      'PATH', 'HOME', 'USER', 'SHELL', 'PWD', 'OLDPWD',
      'LANG', 'TERM', 'DISPLAY', 'HOSTNAME', 'LOGNAME',
      'EDITOR', 'VISUAL', 'PAGER', 'MAIL', 'TEMP', 'TMP',
      'TMPDIR', 'LD_LIBRARY_PATH', 'MANPATH', 'ARGV', 'ARGC'
    ];
    return systemVars.includes(varName);
  }

  /**
   * Valida si un comando es seguro para ejecutar
   * Retorna true si es seguro, false si está en la lista negra
   */
  isCommandSafe(command: string): boolean {
    const dangerousPatterns: RegExp[] = [
      /rm\s+-rf\s+\//,          // rm -rf /
      /dd\s+/,                  // dd commands
      /:(\(\)\{\}\[\])/,       // fork bombs
      /shutdown|halt|reboot|poweroff/,
      /mkfs/,                   // format filesystem
      /fdisk|parted/,           // partition modification
      /dev\/sda/,               // direct disk writes
    ];

    return !dangerousPatterns.some((p: RegExp) => p.test(command));
  }
}
