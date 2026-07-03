import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const explore = await loadTsModule(new URL("../src/lib/explore.ts", import.meta.url));

const creators = [
  {
    creatorId: "ada",
    username: "adaplays",
    displayName: "Ada Plays",
    bio: "Rocket League speedruns",
    category: "Gaming",
    subscriberCount: 12000,
  },
  {
    creatorId: "tunde",
    username: "tundefm",
    displayName: "Tunde FM",
    bio: "Lagos radio and amapiano sets",
    category: "Music",
    subscriberCount: 8000,
  },
];

const liveItems = [
  { creator: creators[0], stream: { title: "Friday Rocket League", description: "Ranked grind" } },
  { creator: creators[1], stream: { title: "Late night mix", description: "Amapiano requests" } },
];

test("normalizeExploreQuery trims scalar and array search params", () => {
  assert.equal(explore.normalizeExploreQuery("  ada  "), "ada");
  assert.equal(explore.normalizeExploreQuery(["music", "gaming"]), "music");
  assert.equal(explore.normalizeExploreQuery(undefined), "");
});

test("filterExploreResults matches creators and live streams by creator, category, title, or bio", () => {
  const music = explore.filterExploreResults({ creators, liveItems, query: "music" });
  assert.deepEqual(music.creators.map((creator) => creator.username), ["tundefm"]);
  assert.deepEqual(music.liveItems.map((item) => item.creator.username), ["tundefm"]);

  const ada = explore.filterExploreResults({ creators, liveItems, query: "rocket" });
  assert.deepEqual(ada.creators.map((creator) => creator.username), ["adaplays"]);
  assert.deepEqual(ada.liveItems.map((item) => item.creator.username), ["adaplays"]);
});

test("filterExploreResults leaves ordering intact for a blank query", () => {
  const blank = explore.filterExploreResults({ creators, liveItems, query: "" });
  assert.deepEqual(blank.creators.map((creator) => creator.username), ["adaplays", "tundefm"]);
  assert.deepEqual(blank.liveItems.map((item) => item.creator.username), ["adaplays", "tundefm"]);
});
