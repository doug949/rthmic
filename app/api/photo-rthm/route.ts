import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 45;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function supportedMediaType(type: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (type === "image/jpeg" || type === "image/png" || type === "image/gif" || type === "image/webp") return type;
  return null;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  try {
    const form = await req.formData();
    const image = form.get("image");
    const context = typeof form.get("context") === "string" ? String(form.get("context")).trim() : "";

    if (!(image instanceof Blob)) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }

    const mediaType = supportedMediaType(image.type);
    if (!mediaType) {
      return NextResponse.json({ error: "Use a JPEG, PNG, GIF, or WebP image" }, { status: 400 });
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large. Try a smaller photo." }, { status: 413 });
    }

    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const client = new Anthropic();

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: `You turn a user's photo into a concise RTHMIC creation prompt.

Do not write song lyrics. Describe what is visible, infer the likely useful angle carefully, and shape it into a prompt that can become a practical Explain-style Rthm.

If the image appears to show a place, object, meal, room, product, document, view, property, artwork, sign, or scene, focus on what the listener should notice, remember, question, appreciate, or do next.

Never invent private facts that are not visible or provided in the user's context.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: `User context: ${context || "No extra context provided."}

Return a single compact prompt for RTHMIC. Include:
- What the photo appears to show.
- Why it might matter.
- What the Rthm should help the listener notice or remember.
- Any useful questions or tradeoffs.

Keep it under 220 words.`,
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Could not interpret photo" }, { status: 500 });
    }

    const seed = [
      "Developer experiment: Photograph to Rthm.",
      textBlock.text.trim(),
      "Make the Rthm clear, specific, and useful. Do not mention that an AI vision model described the image.",
    ].join(" ");

    return NextResponse.json({ seed });
  } catch (err) {
    console.error("Photo Rthm error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not interpret photo" },
      { status: 500 }
    );
  }
}
