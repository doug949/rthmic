type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeTaskId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function findTaskId(node: unknown, depth = 0): string | null {
  if (depth > 5 || !isRecord(node)) return null;

  const direct = node.taskId ?? node.task_id ?? node.taskID;
  if (looksLikeTaskId(direct)) return direct;

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findTaskId(item, depth + 1);
        if (found) return found;
      }
      continue;
    }
    const found = findTaskId(value, depth + 1);
    if (found) return found;
  }

  return null;
}

export function extractSunoTaskId(payload: unknown): string | null {
  if (looksLikeTaskId(payload)) return payload;
  if (!isRecord(payload)) return null;

  const found = findTaskId(payload);
  if (found) return found;

  const direct = payload.id;
  if (looksLikeTaskId(direct)) return direct;

  const data = payload.data;
  if (looksLikeTaskId(data)) return data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const taskId = extractSunoTaskId(item);
      if (taskId) return taskId;
    }
  }
  if (isRecord(data)) {
    const nested = data.taskId ?? data.task_id ?? data.id;
    if (looksLikeTaskId(nested)) return nested;
    const nestedTask = extractSunoTaskId(data.task);
    if (nestedTask) return nestedTask;
  }

  const task = payload.task;
  if (isRecord(task)) {
    const taskId = extractSunoTaskId(task);
    if (taskId) return taskId;
  }

  return null;
}

export function sunoStartError(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const code = payload.code;
  const msg = payload.msg ?? payload.message ?? payload.error;
  const text = typeof msg === "string" && msg.trim() ? msg.trim() : "";

  if (isSunoCreditError(text)) {
    return "Suno credits are empty. Top up the connected Suno account, then try again.";
  }
  if (typeof code === "number" && code !== 200) {
    return text ? `Suno ${code}: ${text}` : `Suno returned code ${code}`;
  }
  if (typeof code === "string" && code !== "200" && code.toLowerCase() !== "success") {
    return text ? `Suno ${code}: ${text}` : `Suno returned code ${code}`;
  }
  if (text && text.toLowerCase() !== "success") return text;

  return null;
}

export function isSunoCreditError(message: string | undefined | null): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes("credits are insufficient") || text.includes("please top up") || text.includes("top up");
}
