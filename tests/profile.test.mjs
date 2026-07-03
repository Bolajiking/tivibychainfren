import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const profile = await loadTsModule(new URL("../src/lib/profile.ts", import.meta.url));
const wallets = await loadTsModule(new URL("../src/lib/auth/wallets.ts", import.meta.url));

test("slugifyUsername creates a stable bio-link slug", () => {
  assert.equal(profile.slugifyUsername(" Ada Plays!! "), "adaplays");
  assert.equal(profile.slugifyUsername("Creator-101"), "creator101");
  assert.equal(profile.slugifyUsername("Élodie TV"), "elodietv");
});

test("parseCreatorProfileInput normalizes a valid profile", () => {
  const result = profile.parseCreatorProfileInput(
    {
      displayName: "  Ada Plays  ",
      username: " Ada Plays!! ",
      bio: "  Late night streams and drops.  ",
      category: " gaming ",
      socialLinks: [
        { kind: "youtube", url: " https://youtube.com/@ada " },
        { kind: "bad", url: "not-a-url" },
      ],
    },
    "0xFA9d000000000000000000000000000000000001",
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    creatorId: "0xfa9d000000000000000000000000000000000001",
    username: "adaplays",
    displayName: "Ada Plays",
    bio: "Late night streams and drops.",
    avatarColor: "#2a2a2a",
    socialLinks: [{ kind: "youtube", url: "https://youtube.com/@ada" }],
    category: "gaming",
  });
});

test("parseCreatorProfileInput rejects unusable profile data", () => {
  assert.deepEqual(
    profile.parseCreatorProfileInput({ displayName: "", username: "ada" }, "0xFA9d000000000000000000000000000000000001"),
    { ok: false, error: "missing_display_name" },
  );
  assert.deepEqual(
    profile.parseCreatorProfileInput({ displayName: "Ada", username: "a!" }, "0xFA9d000000000000000000000000000000000001"),
    { ok: false, error: "bad_username" },
  );
  assert.deepEqual(
    profile.parseCreatorProfileInput({ displayName: "Ada", username: "adaplays" }, "0xnotreal"),
    { ok: false, error: "bad_wallet" },
  );
});

test("buildDefaultStreamRow creates a first real channel surface", () => {
  const creator = {
    creatorId: "0xfa9d000000000000000000000000000000000001",
    username: "adaplays",
    displayName: "Ada Plays",
    avatarColor: "#2a2a2a",
    socialLinks: [],
  };

  assert.deepEqual(profile.buildDefaultStreamRow(creator), {
    playback_id: "live-adaplays",
    creator_id: "0xfa9d000000000000000000000000000000000001",
    title: "Ada Plays live",
    description: "A new TVinBio channel.",
    view_mode: "free",
    amount: 0,
    is_active: false,
    viewer_count: 0,
    thumb_color: "#2a2a2a",
    paid_users: [],
    donation_presets: [3, 5, 10, 25],
    record: true,
  });
});

test("extractEvmWalletAddressesFromUnknown finds unique linked EVM wallets", () => {
  const addresses = wallets.extractEvmWalletAddressesFromUnknown({
    linked_accounts: [
      { type: "email", address: "ada@example.com" },
      { type: "wallet", address: "0xFA9d000000000000000000000000000000000001" },
      { type: "wallet", address: "0xFA9d000000000000000000000000000000000001" },
    ],
    wallet: { address: "0x0000000000000000000000000000000000000002" },
  });

  assert.deepEqual(addresses, [
    "0xfa9d000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000002",
  ]);
});
