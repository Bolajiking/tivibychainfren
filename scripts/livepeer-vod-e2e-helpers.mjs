export function vodE2ePassed(evidence) {
  return evidence?.phase === "ready"
    && typeof evidence?.playbackId === "string"
    && evidence.playbackId.length > 0
    && Number(evidence?.playbackSources) > 0
    && evidence?.manifestOk === true
    && Number(evidence?.segments) > 0
    && evidence?.assetDeleted === true;
}
