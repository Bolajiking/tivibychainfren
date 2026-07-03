import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const redirects = await loadTsModule(new URL("../src/lib/auth/redirect.ts", import.meta.url));

test("safeNextPath preserves internal viewer and creator destinations", () => {
  assert.equal(redirects.safeNextPath("/adaplays/live?room=watch", "/explore"), "/adaplays/live?room=watch");
  assert.equal(redirects.safeNextPath("/onboarding?start=create", "/explore"), "/onboarding?start=create");
  assert.equal(redirects.safeNextPath("/dashboard/broadcast", "/explore"), "/dashboard/broadcast");
});

test("safeNextPath rejects external, protocol, and malformed destinations", () => {
  assert.equal(redirects.safeNextPath("https://evil.example/adaplays", "/explore"), "/explore");
  assert.equal(redirects.safeNextPath("//evil.example/adaplays", "/explore"), "/explore");
  assert.equal(redirects.safeNextPath("javascript:alert(1)", "/explore"), "/explore");
  assert.equal(redirects.safeNextPath("dashboard", "/explore"), "/explore");
  assert.equal(redirects.safeNextPath("", "/explore"), "/explore");
  assert.equal(redirects.safeNextPath(null, "/explore"), "/explore");
});

test("authRoleFromSearch only allows the supported personas", () => {
  assert.equal(redirects.authRoleFromSearch("creator"), "creator");
  assert.equal(redirects.authRoleFromSearch("viewer"), "viewer");
  assert.equal(redirects.authRoleFromSearch("admin"), "viewer");
  assert.equal(redirects.authRoleFromSearch(null), "viewer");
});

test("buildAuthHref encodes a safe role-specific return target", () => {
  assert.equal(
    redirects.buildAuthHref({ role: "viewer", next: "/adaplays/live?room=watch" }),
    "/auth?role=viewer&next=%2Fadaplays%2Flive%3Froom%3Dwatch",
  );
  assert.equal(
    redirects.buildAuthHref({ role: "creator", next: "/onboarding?start=create" }),
    "/auth?role=creator&next=%2Fonboarding%3Fstart%3Dcreate",
  );
  assert.equal(
    redirects.buildAuthHref({ role: "creator", next: "https://evil.example" }),
    "/auth?role=creator&next=%2Fexplore",
  );
});
