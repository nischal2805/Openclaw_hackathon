import { ContractClawError } from '../../../src/types/obligation.js';

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

async function callAnthropic(
  systemPrompt: string,
  userContent: string,
  options: Required<LLMOptions>,
): Promise<string> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'ANTHROPIC_API_KEY environment variable is not set.',
    );
  }

  const modelName = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-20250514';

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: modelName,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'Anthropic API returned no text content block in the response.',
    );
  }

  return textBlock.text;
}

async function callGemini(
  systemPrompt: string,
  userContent: string,
  options: Required<LLMOptions>,
): Promise<string> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'GEMINI_API_KEY environment variable is not set.',
    );
  }

  const modelName = process.env['GEMINI_MODEL'] ?? 'gemini-1.5-pro';

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
    },
  });

  return result.response.text();
}

async function callBedrock(
  systemPrompt: string,
  userContent: string,
  options: Required<LLMOptions>,
): Promise<string> {
  const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];
  if (!accessKeyId) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'AWS_ACCESS_KEY_ID environment variable is not set.',
    );
  }
  if (!secretAccessKey) {
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      'AWS_SECRET_ACCESS_KEY environment variable is not set.',
    );
  }

  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  const modelId = process.env['BEDROCK_MODEL_ID'] ?? 'minimax.minimax-m2.5';

  const { BedrockRuntimeClient, ConverseCommand } = await import(
    '@aws-sdk/client-bedrock-runtime'
  );
  const client = new BedrockRuntimeClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  // Converse API: model-agnostic — works for Anthropic, MiniMax, Meta, Mistral, etc.
  const response = await client.send(
    new ConverseCommand({
      modelId,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userContent }] }],
      inferenceConfig: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    }),
  );

  const content = response.output?.message?.content ?? [];

  // Regular text block (most models)
  const textBlock = content.find((b: { text?: string }) => typeof b.text === 'string');
  if (textBlock?.text) return textBlock.text;

  // Reasoning model fallback (MiniMax M2.5, DeepSeek-R1, etc.)
  const reasoningBlock = content.find(
    (b: { reasoningContent?: { reasoningText?: { text?: string } } }) =>
      b.reasoningContent?.reasoningText?.text,
  );
  if (reasoningBlock?.reasoningContent?.reasoningText?.text) {
    return reasoningBlock.reasoningContent.reasoningText.text;
  }

  throw new ContractClawError(
    'EXTRACTION_FAILED',
    'Bedrock Converse API returned no text content in response.',
  );
}

export async function callLLM(
  systemPrompt: string,
  userContent: string,
  options?: LLMOptions,
): Promise<string> {
  const resolvedOptions: Required<LLMOptions> = {
    maxTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
  };

  const provider = (process.env['LLM_PROVIDER'] ?? 'anthropic').toLowerCase();

  try {
    switch (provider) {
      case 'anthropic':
        return await callAnthropic(systemPrompt, userContent, resolvedOptions);
      case 'gemini':
        return await callGemini(systemPrompt, userContent, resolvedOptions);
      case 'bedrock':
        return await callBedrock(systemPrompt, userContent, resolvedOptions);
      default:
        throw new ContractClawError(
          'EXTRACTION_FAILED',
          `Unknown LLM_PROVIDER value: "${provider}". Supported values are: anthropic, gemini, bedrock.`,
        );
    }
  } catch (err) {
    if (err instanceof ContractClawError) throw err;
    throw new ContractClawError(
      'EXTRACTION_FAILED',
      `LLM API call failed (provider: ${provider}): ${(err as Error).message}`,
      { originalError: String(err), provider },
    );
  }
}
