import type { Creator, Stream } from "@/lib/types";

type SearchableCreator = Pick<Creator, "displayName" | "username" | "bio" | "category">;
type SearchableStream = Pick<Stream, "title" | "description">;

export function normalizeExploreQuery(value: string | string[] | null | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim();
}

export function filterExploreResults<
  TCreator extends SearchableCreator,
  TLiveItem extends { creator: TCreator; stream: SearchableStream },
>({
  creators,
  liveItems,
  query,
}: {
  creators: TCreator[];
  liveItems: TLiveItem[];
  query: string;
}) {
  const needle = query.trim().toLowerCase();
  if (!needle) return { creators, liveItems };

  return {
    creators: creators.filter((creator) => creatorMatches(creator, needle)),
    liveItems: liveItems.filter((item) => {
      const streamText = [item.stream.title, item.stream.description].filter(Boolean).join(" ");
      return creatorMatches(item.creator, needle) || streamText.toLowerCase().includes(needle);
    }),
  };
}

function creatorMatches(creator: SearchableCreator, needle: string) {
  return [creator.displayName, creator.username, creator.bio, creator.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}
