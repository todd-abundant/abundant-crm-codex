import OpenAI from 'openai';

type LlmConfig = {
  client: OpenAI;
  model: string;
  isAnthropic: boolean;
};

/**
 * Creates an OpenAI-compatible client configured for Claude Data Partner.
 *
 * - If ANTHROPIC_API_KEY is set, routes through Anthropic's OpenAI-compatible endpoint
 *   using claude-sonnet-4-6 (or CLAUDE_DATA_PARTNER_MODEL override).
 * - Otherwise falls back to the project's existing OPENAI_API_KEY.
 */
function createLlmConfig(): LlmConfig {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (anthropicKey) {
    const client = new OpenAI({
      apiKey: anthropicKey,
      baseURL: 'https://api.anthropic.com/v1',
      defaultHeaders: {
        'anthropic-version': '2023-06-01',
      },
    });
    const model = process.env.CLAUDE_DATA_PARTNER_MODEL || 'claude-sonnet-4-6';
    return { client, model, isAnthropic: true };
  }

  // Fallback: use project's existing OpenAI key/model
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model =
    process.env.CLAUDE_DATA_PARTNER_MODEL ||
    process.env.OPENAI_AGENT_MODEL ||
    process.env.OPENAI_MODEL ||
    'gpt-4o';
  return { client, model, isAnthropic: false };
}

// Models that require max_completion_tokens instead of max_tokens
const MAX_COMPLETION_TOKENS_MODELS = new Set(['o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini']);

function requiresMaxCompletionTokens(model: string): boolean {
  const base = model.split('-preview')[0].split(':')[0];
  return (
    MAX_COMPLETION_TOKENS_MODELS.has(base) ||
    model.startsWith('gpt-4.1') ||
    model.startsWith('o1') ||
    model.startsWith('o3') ||
    model.startsWith('o4')
  );
}

/**
 * Runs a single-turn LLM prompt and returns the text response.
 */
export async function llmChat(userPrompt: string, maxTokens = 8192): Promise<string> {
  const { client, model, isAnthropic } = createLlmConfig();

  const tokenParam = !isAnthropic && requiresMaxCompletionTokens(model)
    ? { max_completion_tokens: maxTokens }
    : { max_tokens: maxTokens };

  const response = await client.chat.completions.create({
    model,
    ...tokenParam,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty LLM response');
  return content;
}
