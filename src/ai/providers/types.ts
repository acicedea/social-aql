export type AiTier = 'batch' | 'deep';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AiContentBlock[];
}

export interface AiContentBlock {
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  imageBase64?: string;
}

export interface AiGenerateInput {
  systemPrompt: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  responseSchema?: object;
}

export interface AiGenerateOutput {
  text: string;
  parsed?: unknown;
  inputTokens: number;
  outputTokens: number;
  model: string;
  finishReason: 'stop' | 'length' | 'error';
  raw?: unknown;
}

export class AiProviderError extends Error {
  retryable: boolean;
  rateLimited: boolean;
  constructor(message: string, opts: { retryable: boolean; rateLimited: boolean }) {
    super(message);
    this.name = 'AiProviderError';
    this.retryable = opts.retryable;
    this.rateLimited = opts.rateLimited;
  }
}

export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  readonly tier: AiTier;
  readonly model: string;
  readonly supportsImages: boolean;
  readonly costPerMillionInputTokens: number;
  readonly costPerMillionOutputTokens: number;
  readonly rateLimit: { requestsPerMinute: number; requestsPerDay?: number };
  generate(input: AiGenerateInput): Promise<AiGenerateOutput>;
  isAvailable(): boolean;
}
