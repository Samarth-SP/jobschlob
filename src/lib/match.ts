import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SCHEMA = {
  type: "object" as const,
  properties: {
    score: { type: "integer" as const, description: "Compatibility 0-100" },
    rationale: { type: "string" as const, description: "One sentence explaining the score" },
  },
  required: ["score", "rationale"],
  additionalProperties: false,
};

// Bulk, cheap scoring — called once per (job, user) pair from the ingest script. Returns null
// on any failure so the caller can skip and retry next run rather than blocking the whole batch.
export async function scoreJobForUser(
  job: { title: string; company: string; location: string | null },
  background: string,
): Promise<{ score: number; rationale: string } | null> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Background:\n${background}\n\nJob: ${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}\n\nScore how well this job matches the background, 0-100.`,
        },
      ],
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const parsed = JSON.parse(block.text);
    if (typeof parsed.score !== "number" || typeof parsed.rationale !== "string") return null;
    return { score: parsed.score, rationale: parsed.rationale };
  } catch {
    return null;
  }
}
