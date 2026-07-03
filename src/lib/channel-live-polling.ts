export function channelLiveStatusPollMs(isActive: boolean): number {
  return isActive ? 5_000 : 2_000;
}

export function createSingleFlightChannelRefresh(refresh: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    if (inFlight) return inFlight;
    const request = refresh().finally(() => {
      if (inFlight === request) inFlight = null;
    });
    inFlight = request;
    return request;
  };
}
