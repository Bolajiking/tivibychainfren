export function sessionConfirmPath(parentId) {
  const params = new URLSearchParams({ parentId: String(parentId ?? "").trim() });
  return `/session?${params.toString()}`;
}

export function selectParentSession(payload, parentId) {
  const normalizedParentId = String(parentId ?? "").trim();
  return extractSessionRows(payload).find((session) => asRecord(session).parentId === normalizedParentId) ?? null;
}

export function extractSessionRows(payload) {
  if (Array.isArray(payload)) return payload;
  const data = asRecord(payload).data;
  return Array.isArray(data) ? data : [];
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
