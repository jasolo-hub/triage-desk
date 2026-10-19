import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { buildSystemPrompt } from './ai.prompt.js';

const TIMEOUT_MS = 10_000;

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

// D16: one fetch to any OpenAI-compatible /chat/completions endpoint (Groq by
// default). Provider, key and model are configuration; no SDK. Every failure
// becomes a 503 so the admin keeps working when the assistant does not.
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly tickets: TicketsService,
  ) {}

  async ask(question: string, field?: string): Promise<{ answer: string }> {
    const baseUrl = this.config.get('AI_BASE_URL', { infer: true });
    const apiKey = this.config.get('AI_API_KEY', { infer: true });
    const model = this.config.get('AI_MODEL', { infer: true });
    if (!baseUrl || !apiKey || !model) {
      throw this.unavailable(
        'not configured (AI_BASE_URL, AI_API_KEY and AI_MODEL are required)',
      );
    }

    try {
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: buildSystemPrompt(this.tickets.fields(), field),
              },
              // The question is only ever answered back to the same user and the
              // model has no tools or data access, so a prompt-injection attempt
              // can at worst produce an off-topic answer.
              { role: 'user', content: question },
            ],
            max_tokens: 400,
            temperature: 0.2, // factual help text, not creative writing
          }),
          // Covers connect, response headers and body; the request is aborted after 10 s.
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
        );
      }
      const body = (await response.json()) as ChatCompletion;
      const answer = body.choices?.[0]?.message?.content?.trim();
      if (!answer)
        throw new Error('response has no choices[0].message.content');
      return { answer };
    } catch (error) {
      throw this.unavailable(describeError(error));
    }
  }

  // Details go to the log only; the client always sees the same message.
  private unavailable(cause: unknown): ServiceUnavailableException {
    this.logger.warn(`AI assistant unavailable: ${String(cause)}`);
    return new ServiceUnavailableException('Assistant unavailable');
  }
}

// fetch() reports network problems as "TypeError: fetch failed" with the real
// reason (ECONNREFUSED, DNS, TLS) in error.cause.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
  return `${error.name}: ${error.message}${cause}`;
}
