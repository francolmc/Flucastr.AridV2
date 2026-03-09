/**
 * ImageAnalyzer - Analyzes images using Vision AI (Fase 8)
 */

import { readFile } from 'fs/promises';
import { LLMProvider } from '../llm/provider.interface.js';
import { LLMMessage } from '../config/types.js';
import { detectImageMimeType } from './mime-types.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export type ImageAnalysisType = 'describe' | 'ocr' | 'classify' | 'detect';

export interface ImageAnalysisResult {
  type: ImageAnalysisType;
  description?: string;
  extractedText?: string;
  classification?: string;
  confidence: number;
  metadata: {
    width?: number;
    height?: number;
    format: string;
  };
}

export class ImageAnalyzer {
  /**
   * Analyze an image using vision AI
   */
  async analyzeImage(
    imagePath: string,
    analysisType: ImageAnalysisType,
    llmProvider: LLMProvider,
    userPrompt?: string
  ): Promise<ImageAnalysisResult> {
    try {
      logger.info('Analyzing image', { imagePath, analysisType });

      // Read image file
      const imageBuffer = await readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);

      // Build prompt based on analysis type
      const prompt = userPrompt || this.buildPromptForAnalysis(analysisType);

      // Construct multimodal message
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ];

      // Call vision provider
      const response = await llmProvider.generateContent(messages);

      logger.info('Image analysis completed', {
        imagePath,
        analysisType,
        outputLength: response.content.length
      });

      // Build result
      const result: ImageAnalysisResult = {
        type: analysisType,
        confidence: 0.9, // Could be extracted from response if available
        metadata: {
          format: mimeType.split('/')[1]
        }
      };

      // Parse response based on analysis type
      if (analysisType === 'describe') {
        result.description = response.content;
      } else if (analysisType === 'ocr') {
        result.extractedText = response.content;
      } else if (analysisType === 'classify') {
        result.classification = response.content;
      } else if (analysisType === 'detect') {
        result.description = response.content;
      }

      return result;
    } catch (error) {
      logger.error('Failed to analyze image', error);
      throw new AppError(`Image analysis failed: ${error}`);
    }
  }

  /**
   * Build prompt for specific analysis type
   */
  private buildPromptForAnalysis(type: ImageAnalysisType): string {
    const prompts: Record<ImageAnalysisType, string> = {
      describe: `Describe this image in detail. Include:
- What objects/people/scenes are present
- Colors, lighting, composition
- Any text visible
- Overall context and purpose

Be thorough but concise.`,

      ocr: `Extract ALL text visible in this image.
Include:
- All readable text, exactly as written
- Preserve formatting and structure where possible
- If no text is visible, say "No text detected"

Output only the extracted text.`,

      classify: `Classify the type of this document/image. Examples:
- Receipt/Invoice
- ID Card/Passport
- Screenshot
- Photo (landscape/portrait/selfie)
- Diagram/Chart
- Other

Provide the classification and brief reasoning.`,

      detect: `Detect and list all significant objects in this image.
Format:
- Object 1: [description]
- Object 2: [description]
...

Focus on main elements, not background details.`
    };

    return prompts[type];
  }

  /**
   * Detect MIME type from file path (centralized)
   */
  private getMimeType(filePath: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    return detectImageMimeType(filePath);
  }
}
