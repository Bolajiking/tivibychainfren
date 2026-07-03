export function browserObsFallbackHandoff({
  hasIngest,
  keyShown,
}: {
  hasIngest: boolean;
  keyShown: boolean;
}): { revealKey: boolean; focusObsPanel: boolean } {
  if (!hasIngest) return { revealKey: false, focusObsPanel: false };
  return { revealKey: !keyShown, focusObsPanel: true };
}

export function browserPublisherFailureAction({
  currentAttempt,
  aborted,
  live,
}: {
  currentAttempt: boolean;
  aborted: boolean;
  live: boolean;
}): "ignore" | "recover" | "handoff" {
  if (!currentAttempt || aborted) return "ignore";
  return live ? "recover" : "handoff";
}
