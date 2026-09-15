// Resolves which provider/model/key powers a given LLM-touched step of the app (resume
// generation, cover letter generation, JD parsing — see lib/llm-config.ts for the full process
// list) for a given user, and runs one structured tool-call against whichever provider that
// resolves to. A user who hasn't configured anything gets today's behavior unchanged: Anthropic,
// the app's own ANTHROPIC_API_KEY, claude-sonnet-5.
//
// Anthropic and OpenAI only — not Ollama/LM Studio/vLLM, which BoofSimplify (this app's sibling
// local tool) also supports, but which assume a local network this Vercel deployment has no
// access to.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getLlmConfig } from "@/db/queries";
import { decryptSecret } from "./crypto";
import type { LlmProcess, Provider } from "./llm-config";

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5",
};

async function resolve(userId: string, proc: LlmProcess): Promise<{ provider: Provider; model: string; apiKey: string }> {
  const config = await getLlmConfig(userId);
  const route = config?.routing?.[proc];
  const provider: Provider = route?.provider ?? "anthropic";
  const model = route?.model?.trim() || DEFAULT_MODEL[provider];

  const storedKey = config?.keys?.[provider];
  const apiKey = storedKey ? decryptSecret(storedKey) : provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      provider === "anthropic"
        ? "No Anthropic key available — set ANTHROPIC_API_KEY, or add your own key on the profile page."
        : "No OpenAI key available — add your own key on the profile page (there is no app-wide OpenAI key).",
    );
  }
  return { provider, model, apiKey };
}

// Same shape as Anthropic.Tool ({name, description, input_schema}) so existing tool definitions
// (resume-scaffold.ts, jd-parse.ts) don't need restructuring — this just also knows how to run
// that same JSON-schema tool definition against OpenAI's function-calling API.
export type LlmTool = { name: string; description: string; input_schema: Record<string, unknown> };

export async function callTool<T>(
  userId: string,
  proc: LlmProcess,
  system: string,
  prompt: string,
  tool: LlmTool,
  maxTokens = 4000,
): Promise<T> {
  const { provider, model, apiKey } = await resolve(userId, proc);

  if (provider === "openai") {
    const client = new OpenAI({ apiKey });
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
      tool_choice: { type: "function", function: { name: tool.name } },
    });
    const call = res.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== "function") throw new Error(`${tool.name}: model returned no structured output`);
    return JSON.parse(call.function.arguments) as T;
  }

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools: [{ name: tool.name, description: tool.description, input_schema: tool.input_schema as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error(`${tool.name}: model returned no structured output`);
  return block.input as T;
}
