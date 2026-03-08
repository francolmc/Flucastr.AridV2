/**
 * Markdown to Telegram MarkdownV2 Translator
 *
 * Convierte Markdown estándar del LLM a formato MarkdownV2 de Telegram
 * Basado en el translator de Flucastr.Arid, adaptado para AridV2
 *
 * MarkdownV2 especificación:
 * - Caracteres especiales que deben escaparse: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * - Formato: *bold* _italic_ __underline__ ~strikethrough~ `code` ```pre```
 * - Los caracteres dentro de `code` y ```pre``` solo necesitan escapar ` y \
 */

interface ConversionState {
  text: string;
  codeBlocks: string[];
  inlineCode: string[];
  boldMatches: string[];
  italicMatches: string[];
  strikeMatches: string[];
}

export class MarkdownTranslator {
  /**
   * Traduce Markdown estándar a MarkdownV2 de Telegram
   *
   * Pipeline de conversión:
   * 1. Extraer y preservar bloques de código
   * 2. Convertir headings (# → negritas)
   * 3. Convertir listas (- * + → • viñetas)
   * 4. Convertir separadores (--- → ━━━)
   * 5. Convertir formato (**bold**, *italic*, `code`)
   * 6. Escapar caracteres especiales
   * 7. Restaurar código
   */
  static translateToTelegram(markdown: string): string {
    try {
      const state: ConversionState = {
        text: markdown,
        codeBlocks: [],
        inlineCode: [],
        boldMatches: [],
        italicMatches: [],
        strikeMatches: [],
      };

      // 1. Extraer código (para no procesarlo)
      this.extractCode(state);

      // 2. Convertir tablas
      this.convertTables(state);

      // 3. Convertir headings
      this.convertHeadings(state);

      // 4. Convertir listas
      this.convertLists(state);

      // 5. Convertir separadores
      this.convertSeparators(state);

      // 6. Convertir formato
      this.convertFormatting(state);

      // 7. Escapar caracteres especiales
      this.escapeSpecialChars(state);

      // 8. Restaurar código (con escape interior)
      this.restoreCode(state);

      return state.text;
    } catch (error) {
      // Fallback silencioso: retornar texto original si algo falla
      return markdown;
    }
  }

  /**
   * Extraer bloques de código y código inline
   * Reemplaza con placeholders seguros (sin caracteres especiales)
   */
  private static extractCode(state: ConversionState): void {
    // Extraer bloques ```code```
    state.text = state.text.replace(/```[\s\S]*?```/g, (match) => {
      state.codeBlocks.push(match);
      return `CodeBlockMarker${state.codeBlocks.length - 1}End`;
    });

    // Extraer inline `code`
    state.text = state.text.replace(/`([^`]+)`/g, (match) => {
      state.inlineCode.push(match);
      return `InlineCodeMarker${state.inlineCode.length - 1}End`;
    });
  }

  /**
   * Convertir tablas Markdown a formato legible para Telegram
   * Telegram MarkdownV2 no soporta tablas, así que las convierte a un formato de texto legible
   *
   * Tabla original:
   * | Header 1 | Header 2 |
   * |---|---|
   * | Row 1 Col 1 | Row 1 Col 2 |
   *
   * Convertida a:
   * *Header 1* | *Header 2*
   * ─────────────────────────
   * Row 1 Col 1 | Row 1 Col 2
   */
  private static convertTables(state: ConversionState): void {
    // Detectar tablas: líneas que empiezan y terminan con |
    const lines = state.text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      // Verificar si es una línea de tabla (empieza y termina con |)
      if (line.startsWith('|') && line.endsWith('|')) {
        // Verificar si la siguiente línea es el separador de tabla
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        if (this.isTableSeparator(nextLine)) {
          // Encontramos una tabla
          const tableStartIndex = i;
          let tableEndIndex = i + 1; // Incluye la línea de separador

          // Encontrar el final de la tabla
          while (tableEndIndex < lines.length) {
            const checkLine = lines[tableEndIndex + 1]?.trim() || '';
            if (checkLine.startsWith('|') && checkLine.endsWith('|')) {
              tableEndIndex++;
            } else {
              break;
            }
          }

          // Convertir la tabla
          const tableLines = lines.slice(tableStartIndex, tableEndIndex + 1);
          const convertedTable = this.convertTableToText(tableLines);

          // Reemplazar las líneas de la tabla
          lines.splice(tableStartIndex, tableEndIndex - tableStartIndex + 1, ...convertedTable);
          i = tableStartIndex + convertedTable.length;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }

    state.text = lines.join('\n');
  }

  /**
   * Verificar si una línea es un separador de tabla (|---|---|---|)
   */
  private static isTableSeparator(line: string): boolean {
    if (!line.startsWith('|') || !line.endsWith('|')) return false;

    const cells = line
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0);

    // Todos los segmentos deben ser guiones con opcionalmente :
    return cells.every(cell => /^:?-+:?$/.test(cell));
  }

  /**
   * Convertir líneas de tabla a formato de lista (columna: valor)
   * Cada fila se convierte en una lista de items "- Columna: valor"
   * Las filas se separan por líneas en blanco
   */
  private static convertTableToText(tableLines: string[]): string[] {
    if (tableLines.length < 2) return tableLines;

    // Parsear header
    const headerLine = tableLines[0];
    const headerCells = this.parseTableRow(headerLine);

    // Parsear filas (saltando la línea de separador en índice 1)
    const rows: string[][] = [];
    for (let i = 2; i < tableLines.length; i++) {
      const row = this.parseTableRow(tableLines[i]);
      if (row.length > 0) {
        rows.push(row);
      }
    }

    if (headerCells.length === 0) return tableLines;

    const result: string[] = [];

    // Convertir cada fila a formato de lista
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];

      // Crear lista de "columna: valor"
      for (let colIndex = 0; colIndex < headerCells.length; colIndex++) {
        const columnName = headerCells[colIndex];
        const columnValue = row[colIndex] || '';
        // Nombres de columna en bold: *Columna:*
        result.push(`- *${columnName}:* ${columnValue}`);
      }

      // Agregar salto de línea entre filas (excepto después de la última)
      if (rowIndex < rows.length - 1) {
        result.push('');
        result.push('');
      }
    }

    return result;
  }

  /**
   * Parsear una fila de tabla (separada por |)
   */
  private static parseTableRow(line: string): string[] {
    return line
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0); // Eliminar celdas vacías
  }

  /**
   * Convertir listas con formato "- Columna: valor" a "- *Columna:* valor"
   * con saltos de línea entre grupos de items
   * Detecta grupos por repetición de la primera columna
   */
  private static convertColumnValueLists(state: ConversionState): void {
    const lines = state.text.split('\n');
    const result: string[] = [];
    const columnValueItems: Array<{ columnName: string; formatted: string }> = [];
    let firstColumnName: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detectar línea con formato "- Columna: valor" o "- *Columna:* valor"
      if (line.startsWith('- ') && line.includes(':')) {
        // Limpiar línea de asteriscos que el LLM pudo haber agregado
        const cleanedLine = line.replace(/\*/g, '').trim();

        const match = cleanedLine.match(/^-\s+([^:]+):\s*(.*)$/);
        if (match) {
          const columnName = match[1].trim();
          const columnValue = match[2].trim();

          // Si es la primera columna y ya vimos esta columna antes, agregar salto de línea
          if (firstColumnName === columnName && columnValueItems.length > 0) {
            // Agregar grupo anterior
            result.push(...columnValueItems.map(item => item.formatted));
            result.push('');
            result.push('');
            columnValueItems.length = 0;
            firstColumnName = columnName;
          }

          // Si es primer item del grupo, guardar nombre de primera columna
          if (columnValueItems.length === 0) {
            firstColumnName = columnName;
          }

          // Formatear con nombre en bold (sin espacios extras)
          const formatted = `- *${columnName}:* ${columnValue}`;
          columnValueItems.push({ columnName, formatted });
          continue;
        }
      }

      // Si encontramos una línea que no es item y tenemos items pendientes
      if (columnValueItems.length > 0 && line !== '') {
        result.push(...columnValueItems.map(item => item.formatted));
        columnValueItems.length = 0;
        firstColumnName = null;
      }

      // Agregar línea normal
      if (line !== '') {
        result.push(line);
      }
    }

    // Agregar último grupo si existe
    if (columnValueItems.length > 0) {
      result.push(...columnValueItems.map(item => item.formatted));
    }

    state.text = result.join('\n');
  }

  /**
   * Convertir headings a negritas
   * # Título → *Título*
   * ## Subtítulo → *Subtítulo*
   * ### Sub → *Sub*
   */
  private static convertHeadings(state: ConversionState): void {
    // ### → *texto*
    state.text = state.text.replace(/^###\s+(.+)$/gm, '*$1*\n');
    // ## → *texto*
    state.text = state.text.replace(/^##\s+(.+)$/gm, '*$1*\n');
    // # → *texto*
    state.text = state.text.replace(/^#\s+(.+)$/gm, '*$1*\n');
  }

  /**
   * Convertir listas a viñetas unicode
   * - item → • item
   * * item → • item
   * + item → • item
   */
  private static convertLists(state: ConversionState): void {
    // Reemplazar -, *, + al inicio de línea con •
    state.text = state.text.replace(/^[\s]*[-*+]\s+/gm, '• ');
  }

  /**
   * Convertir separadores
   * --- → ━━━━━━━━━━━━━━━━
   * ___ → ━━━━━━━━━━━━━━━━
   * *** → ━━━━━━━━━━━━━━━━
   */
  private static convertSeparators(state: ConversionState): void {
    state.text = state.text.replace(/^---+$/gm, '━━━━━━━━━━━━━━━━');
    state.text = state.text.replace(/^___+$/gm, '━━━━━━━━━━━━━━━━');
    state.text = state.text.replace(/^\*\*\*+$/gm, '━━━━━━━━━━━━━━━━');
  }

  /**
   * Convertir formato de markdown a Telegram
   * **bold** → placeholder (sin caracteres especiales)
   * *italic* → placeholder (sin caracteres especiales)
   * ~~strikethrough~~ → placeholder (sin caracteres especiales)
   *
   * Usamos placeholders seguros (solo letras y números) que no se escaparán
   */
  private static convertFormatting(state: ConversionState): void {
    // **bold** → placeholder (debe ser primero para no confundir con *italic*)
    state.text = state.text.replace(/\*\*(.+?)\*\*/g, (match, content) => {
      state.boldMatches.push(content);
      return `BoldMarker${state.boldMatches.length - 1}End`;
    });

    // *italic* → placeholder
    state.text = state.text.replace(/\*(.+?)\*/g, (match, content) => {
      state.italicMatches.push(content);
      return `ItalicMarker${state.italicMatches.length - 1}End`;
    });

    // ~~strikethrough~~ → placeholder
    state.text = state.text.replace(/~~(.+?)~~/g, (match, content) => {
      state.strikeMatches.push(content);
      return `StrikeMarker${state.strikeMatches.length - 1}End`;
    });
  }

  /**
   * Escapar caracteres especiales de MarkdownV2
   * Caracteres a escapar: _ * [ ] ( ) ~ ` > # + - = | { } . !
   *
   * Restaura también los placeholders de formato después del escape
   */
  private static escapeSpecialChars(state: ConversionState): void {
    const specialChars = [
      '\\', // Debe ser el primero
      '_',
      '*',
      '[',
      ']',
      '(',
      ')',
      '~',
      '`',
      '>',
      '#',
      '+',
      '-',
      '=',
      '|',
      '{',
      '}',
      '.',
      '!',
    ];

    // Escapar cada carácter especial
    for (const char of specialChars) {
      const regex = new RegExp(`\\${char}`, 'g');
      state.text = state.text.replace(regex, `\\${char}`);
    }

    // Restaurar formato bold (los placeholders no se escaparon)
    state.boldMatches.forEach((content: string, i: number) => {
      const escapedContent = this.escapeContentForFormatting(content);
      state.text = state.text.replace(`BoldMarker${i}End`, `*${escapedContent}*`);
    });

    // Restaurar formato italic
    state.italicMatches.forEach((content: string, i: number) => {
      const escapedContent = this.escapeContentForFormatting(content);
      state.text = state.text.replace(`ItalicMarker${i}End`, `_${escapedContent}_`);
    });

    // Restaurar formato strikethrough
    state.strikeMatches.forEach((content: string, i: number) => {
      const escapedContent = this.escapeContentForFormatting(content);
      state.text = state.text.replace(`StrikeMarker${i}End`, `~${escapedContent}~`);
    });
  }

  /**
   * Escapar contenido dentro de formato (bold, italic, etc.)
   * Solo necesitamos escapar ciertos caracteres dentro del formato
   */
  private static escapeContentForFormatting(content: string): string {
    return content
      .replace(/\\/g, '\\\\')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
  }

  /**
   * Restaurar bloques de código con escape apropiado
   * Dentro de código solo necesitamos escapar \ y `
   */
  private static restoreCode(state: ConversionState): void {
    // Restaurar bloques de código
    state.codeBlocks.forEach((block, i) => {
      // Extraer lenguaje y contenido
      const match = block.match(/```(\w+)?\n?([\s\S]*?)```/);
      if (match) {
        const lang = match[1] || '';
        const code = match[2];
        // Escapar solo \ y ` dentro de código
        const escapedCode = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
        const formatted = lang ? `\`\`\`${lang}\n${escapedCode}\`\`\`` : `\`\`\`\n${escapedCode}\`\`\``;
        state.text = state.text.replace(`CodeBlockMarker${i}End`, formatted);
      }
    });

    // Restaurar código inline
    state.inlineCode.forEach((code, i) => {
      // Extraer contenido sin los backticks
      const content = code.substring(1, code.length - 1);
      // Escapar solo \ y ` dentro de código
      const escapedContent = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
      state.text = state.text.replace(`InlineCodeMarker${i}End`, `\`${escapedContent}\``);
    });
  }
}
