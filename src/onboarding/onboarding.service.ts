/**
 * Onboarding Service
 * Manages the onboarding flow for new users
 */

import { OnboardingStore } from '../storage/onboarding.store.js';
import { ProfileStore } from '../storage/profile.store.js';
import { ONBOARDING_QUESTIONS, parseAgentTone, isSkipAnswer } from './questions.js';
import { logger } from '../utils/logger.js';
import { OnboardingError } from '../utils/errors.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export class OnboardingService {
  private onboardingStore: OnboardingStore;
  private profileStore: ProfileStore;
  private workspacePath: string;

  constructor(workspacePath: string = './workspace') {
    this.onboardingStore = new OnboardingStore();
    this.profileStore = new ProfileStore();
    this.workspacePath = workspacePath;
  }

  /**
   * Check if user needs onboarding
   */
  needsOnboarding(userId: string): boolean {
    const state = this.onboardingStore.getState(userId);
    return !state || !state.isCompleted;
  }

  /**
   * Start onboarding for a new user
   */
  startOnboarding(userId: string): string {
    try {
      // Initialize onboarding state
      this.onboardingStore.initializeOnboarding(userId);

      // Return first question
      const firstQuestion = ONBOARDING_QUESTIONS[0];
      logger.info('Onboarding started', { userId });

      return `${firstQuestion.question}\n\n${firstQuestion.hint || ''}`;
    } catch (error) {
      logger.error('Failed to start onboarding', error);
      throw new OnboardingError(`Failed to start onboarding: ${error}`);
    }
  }

  /**
   * Handle onboarding message from user
   */
  async handleMessage(userId: string, message: string): Promise<{
    isComplete: boolean;
    response: string;
  }> {
    try {
      // Get current state
      let state = this.onboardingStore.getState(userId);

      // Initialize if needed
      if (!state) {
        const response = this.startOnboarding(userId);
        return { isComplete: false, response };
      }

      // Already completed
      if (state.isCompleted) {
        return {
          isComplete: true,
          response: '¡El proceso de configuración ya está completo! Puedes empezar a chatear conmigo.'
        };
      }

      // Process answer for current step
      const currentQuestion = ONBOARDING_QUESTIONS[state.currentStep];
      const answers = state.answers || {};

      // Save answer
      answers[currentQuestion.id] = message.trim();

      // Move to next step
      const nextStep = state.currentStep + 1;
      const isLastQuestion = nextStep >= ONBOARDING_QUESTIONS.length;

      if (isLastQuestion) {
        // Complete onboarding
        await this.completeOnboarding(userId, answers);

        return {
          isComplete: true,
          response: '¡Perfecto! Ya estamos listos. Puedes empezar a chatear conmigo sobre lo que quieras. 🎉'
        };
      } else {
        // Update state and ask next question
        this.onboardingStore.updateState(userId, {
          currentStep: nextStep,
          answers
        });

        const nextQuestion = ONBOARDING_QUESTIONS[nextStep];
        return {
          isComplete: false,
          response: `${nextQuestion.question}\n\n${nextQuestion.hint || ''}`
        };
      }
    } catch (error) {
      logger.error('Failed to handle onboarding message', error);
      throw new OnboardingError(`Failed to handle onboarding message: ${error}`);
    }
  }

  /**
   * Complete onboarding and create user profile
   */
  private async completeOnboarding(userId: string, answers: Record<string, string>): Promise<void> {
    try {
      // Parse answers
      const userName = answers.userName || undefined;
      const agentName = answers.agentName?.trim() || 'Arid';
      const personality = answers.personality?.trim() || 'amigable y útil';
      const interests = !isSkipAnswer(answers.interests || '') ? answers.interests : undefined;

      // Parse location (Fase 3)
      const location = answers.location?.trim() || '';
      let city: string | undefined;
      let country: string | undefined;
      let timezone: string | undefined;

      if (location && !isSkipAnswer(location)) {
        const parsed = this.parseLocation(location);
        city = parsed.city;
        country = parsed.country;
        timezone = parsed.timezone;
      }

      // Create/update profile
      this.profileStore.updateProfile({
        userId,
        agentName,
        personality,
        userName,
        preferences: interests,
        city,
        country,
        timezone
      });

      // Update PROFILE.md file in workspace
      this.updateProfileMdFile(agentName, userName, personality, interests, city, country);

      // Mark onboarding as completed
      this.onboardingStore.markCompleted(userId);

      logger.info('Onboarding completed', {
        userId,
        userName,
        agentName,
        personality,
        hasInterests: !!interests,
        city,
        country,
        timezone
      });
    } catch (error) {
      logger.error('Failed to complete onboarding', error);
      throw new OnboardingError(`Failed to complete onboarding: ${error}`);
    }
  }

  /**
   * Parse location string into city, country and derive timezone
   */
  private parseLocation(location: string): { city?: string; country?: string; timezone?: string } {
    // Expected format: "Ciudad, País" (e.g., "Buenos Aires, Argentina")
    const parts = location.split(',').map(p => p.trim());

    if (parts.length >= 2) {
      const city = parts[0];
      const country = parts[1];
      const timezone = this.deriveTimezone(country);

      return { city, country, timezone };
    }

    // If only one part, assume it's the country
    if (parts.length === 1) {
      const country = parts[0];
      const timezone = this.deriveTimezone(country);

      return { country, timezone };
    }

    return {};
  }

  /**
   * Derive timezone from country name
   * Simple mapping for common Spanish-speaking countries
   */
  private deriveTimezone(country: string): string {
    const timezoneMap: Record<string, string> = {
      'Argentina': 'America/Argentina/Buenos_Aires',
      'España': 'Europe/Madrid',
      'Spain': 'Europe/Madrid',
      'México': 'America/Mexico_City',
      'Mexico': 'America/Mexico_City',
      'Chile': 'America/Santiago',
      'Colombia': 'America/Bogota',
      'Perú': 'America/Lima',
      'Peru': 'America/Lima',
      'Venezuela': 'America/Caracas',
      'Uruguay': 'America/Montevideo',
      'Paraguay': 'America/Asuncion',
      'Bolivia': 'America/La_Paz',
      'Ecuador': 'America/Guayaquil',
      'Costa Rica': 'America/Costa_Rica',
      'Panamá': 'America/Panama',
      'Panama': 'America/Panama',
      'Guatemala': 'America/Guatemala',
      'Honduras': 'America/Tegucigalpa',
      'El Salvador': 'America/El_Salvador',
      'Nicaragua': 'America/Managua',
      'Cuba': 'America/Havana',
      'República Dominicana': 'America/Santo_Domingo',
      'Dominican Republic': 'America/Santo_Domingo',
      'Puerto Rico': 'America/Puerto_Rico',
      'Estados Unidos': 'America/New_York',
      'United States': 'America/New_York',
      'USA': 'America/New_York',
      'Brasil': 'America/Sao_Paulo',
      'Brazil': 'America/Sao_Paulo',
      'Portugal': 'Europe/Lisbon',
      'Francia': 'Europe/Paris',
      'France': 'Europe/Paris',
      'Italia': 'Europe/Rome',
      'Italy': 'Europe/Rome',
      'Alemania': 'Europe/Berlin',
      'Germany': 'Europe/Berlin',
      'Reino Unido': 'Europe/London',
      'United Kingdom': 'Europe/London',
      'UK': 'Europe/London',
    };

    return timezoneMap[country] || 'UTC';
  }

  /**
   * Update PROFILE.md file with onboarding results
   */
  private updateProfileMdFile(agentName: string, userName?: string, personality?: string, interests?: string, city?: string, country?: string): void {
    try {
      // Ensure workspace directory exists
      mkdirSync(this.workspacePath, { recursive: true });

      const profileMdPath = join(this.workspacePath, 'PROFILE.md');

      const locationInfo = city && country ? `${city}, ${country}` : country || '(No configurado)';

      const profileContent = `# Perfil del Agente ${agentName}

## Identidad

**Nombre:** ${agentName}
**Rol:** Asistente conversacional inteligente
**Personalidad:** ${personality || 'amigable y útil'}

## Usuario

- **Nombre:** ${userName || '(No configurado)'}
- **Ubicación:** ${locationInfo}
- **Intereses:** ${interests || '(No configurados)'}

## Cómo Hablo

${personality || 'Soy amigable, útil y conversacional.'}

## Personalización

Puedes editar este archivo para personalizar el comportamiento de ${agentName}. Los cambios se reflejarán en la próxima conversación.

### Cambiar Personalidad

Edita la sección "Cómo Hablo" para describir cómo quieres que interactúe ${agentName} contigo.

Ejemplos:
- "Formal y profesional, sin rodeos"
- "Casual como un amigo, con bromas ocasionales"
- "Como un mentor paciente que enseña paso a paso"
- "Directo y eficiente, al punto"
- "Empático y considerado, mostrando comprensión"

### Capacidades Actuales (Fase 1)

- ✅ Conversación natural en español
- ✅ Memoria reciente (últimos 40 mensajes)
- ✅ Multi-provider LLM (Anthropic, Gemini, Ollama)
- ✅ Análisis inteligente de intención

### Limitaciones

- ❌ No acceso a herramientas externas (filesystem, terminal, etc)
- ❌ No acceso a información en tiempo real
- ❌ No puede ejecutar código
- ❌ No tiene memoria semántica (solo historial)

---

**Última actualización:** ${new Date().toISOString()}
**Estado:** Configuración completada
`;

      writeFileSync(profileMdPath, profileContent, 'utf-8');
      logger.info('PROFILE.md updated', { path: profileMdPath, agentName });
    } catch (error) {
      logger.error('Failed to update PROFILE.md', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Get current onboarding progress
   */
  getProgress(userId: string): {
    currentStep: number;
    totalSteps: number;
    isCompleted: boolean;
  } {
    const state = this.onboardingStore.getState(userId);
    return {
      currentStep: state?.currentStep || 0,
      totalSteps: ONBOARDING_QUESTIONS.length,
      isCompleted: state?.isCompleted || false
    };
  }

  /**
   * Reset onboarding for a user (for testing or re-configuration)
   */
  resetOnboarding(userId: string): void {
    try {
      this.onboardingStore.updateState(userId, {
        isCompleted: false,
        currentStep: 0,
        answers: {}
      });

      logger.info('Onboarding reset', { userId });
    } catch (error) {
      logger.error('Failed to reset onboarding', error);
      throw new OnboardingError(`Failed to reset onboarding: ${error}`);
    }
  }
}
