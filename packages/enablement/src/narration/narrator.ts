import Anthropic from "@anthropic-ai/sdk";
import { log } from "@rex/shared";

export interface NarratedStep {
  title: string;
  narration: string;
  context: string;
}

const anthropic = new Anthropic();

export async function generateNarration(prompt: string): Promise<NarratedStep[]> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as NarratedStep[];

    if (!Array.isArray(parsed)) {
      throw new Error("Response is not an array");
    }

    for (const step of parsed) {
      if (!step.title || !step.narration) {
        throw new Error(`Invalid step structure: missing title or narration`);
      }
    }

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log({
      level: "error",
      message: `Narration generation failed: ${message}`,
      service: "enablement",
    });
    throw error;
  }
}

export async function generateWalkthroughTitle(
  clientName: string,
  engagementName: string,
  categories: string[]
): Promise<{ title: string; description: string }> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Generate a title and description for a HubSpot implementation walkthrough.

Client: ${clientName}
Engagement: ${engagementName}
Categories covered: ${categories.join(", ")}

Respond with JSON only, no markdown:
{"title": "...", "description": "..."}

The title should be professional and client-facing (e.g., "${clientName} HubSpot Implementation Guide").
The description should be 1-2 sentences summarizing what the walkthrough covers.`,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      title: `${clientName} — HubSpot Implementation Walkthrough`,
      description: `A guided walkthrough of the HubSpot configuration built for ${clientName} as part of the ${engagementName} engagement.`,
    };
  }
}
