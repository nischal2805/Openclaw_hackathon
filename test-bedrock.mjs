// Quick Bedrock connectivity test — run with:
//   node --env-file=.env test-bedrock.mjs
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, BEDROCK_MODEL_ID } = process.env;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error('Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY in .env');
  process.exit(1);
}

const modelId = BEDROCK_MODEL_ID ?? 'minimax.minimax-m2.5';
const region = AWS_REGION ?? 'us-east-1';

console.log(`Testing Bedrock → model: ${modelId} | region: ${region}`);

const client = new BedrockRuntimeClient({
  region,
  credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
});

try {
  const response = await client.send(new ConverseCommand({
    modelId,
    system: [{ text: 'You are a test assistant. Be brief.' }],
    messages: [{ role: 'user', content: [{ text: 'Say exactly: "Bedrock OK"' }] }],
    inferenceConfig: { maxTokens: 500, temperature: 0 },
  }));

  const content = response.output?.message?.content ?? [];
  const text =
    content.find((b) => typeof b.text === 'string')?.text ??
    content.find((b) => b.reasoningContent?.reasoningText?.text)?.reasoningContent?.reasoningText?.text;
  console.log('SUCCESS ✓');
  console.log('Response:', text ?? '(no text — check model ID or token limit)');
} catch (err) {
  console.error('FAILED ✗');
  console.error('Error:', err.message);
  if (err.name) console.error('Error type:', err.name);
}
