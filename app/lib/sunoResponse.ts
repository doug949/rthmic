type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeTaskId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function extractSunoTaskId(payload: unknown): string | null {
  if (looksLikeTaskId(payload)) return payload;
  if (!isRecord(payload)) return null;

  const direct = payload.taskId ?? payload.task_id ?? payload.id;
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
