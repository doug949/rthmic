export function displayGenerationFailure(reason: string | undefined): string {
  if (!reason) return "Generation failed";

  const text = reason.toLowerCase();
  if (text.includes("credits are insufficient") || text.includes("please top up") || text.includes("top up")) {
    return "Suno credits need topping up before RTHMIC can generate more tracks";
  }

  return reason;
}
