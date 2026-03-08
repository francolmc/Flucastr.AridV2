/**
 * Onboarding Questions
 * Simple 2-3 questions for initial setup
 */

export interface OnboardingQuestion {
  id: string;
  question: string;
  hint?: string;
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: 'userName',
    question: '¡Hola! Soy tu asistente conversacional. ¿Cómo te llamas?',
    hint: 'Puedes compartir tu nombre o apodo preferido.'
  },
  {
    id: 'agentName',
    question: '¿Cómo quieres que me llame? (Mi nombre)',
    hint: 'Por ejemplo: Arid, Claude, Asistente, etc. Por defecto soy "Arid".'
  },
  {
    id: 'personality',
    question: '¿Cómo prefieres que hable conmigo? Describe tu personalidad ideal para un asistente.',
    hint: 'Ejemplos: "casual y amigable, como un colega", "profesional pero con humor", "directo y eficiente", "como un mentor paciente", etc.'
  },
  {
    id: 'interests',
    question: '¿Hay algo en particular sobre lo que te gustaría hablar o algún tema que te interese? (Opcional - puedes saltar con "omitir")',
    hint: 'Esto me ayudará a personalizar nuestras conversaciones.'
  }
];

export function parseAgentTone(answer: string): string {
  const normalized = answer.toLowerCase().trim();

  // Check for number
  if (normalized === '1' || normalized.includes('casual')) {
    return 'casual';
  }
  if (normalized === '2' || normalized.includes('formal')) {
    return 'formal';
  }
  if (normalized === '3' || normalized.includes('divertido') || normalized.includes('humor')) {
    return 'divertido';
  }

  // Default to casual
  return 'casual';
}

export function isSkipAnswer(answer: string): boolean {
  const normalized = answer.toLowerCase().trim();
  return normalized === 'omitir' || normalized === 'skip' || normalized === 'saltar' || normalized === 'pasar';
}
