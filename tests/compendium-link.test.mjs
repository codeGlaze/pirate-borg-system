// Regression test: findCompendiumItem returns a cache-safe clone, but the clone
// must keep a resolvable compendium uuid so `item.link` enriches to a working
// content link instead of a broken pill in get-better / loot chat cards.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installFoundryStubs, REPO_ROOT } from "./helpers/foundry-stubs.mjs";

installFoundryStubs();
const { findCompendiumItem } = await import(path.join(REPO_ROOT, "module/api/compendium.js"));

test("findCompendiumItem result keeps a resolvable uuid (working content link)", async () => {
  const item = await findCompendiumItem("pirateborg.class-buccaneer", "Survivalist");
  assert.ok(item, "Survivalist should be found in class-buccaneer");
  assert.match(item.uuid, /^Compendium\.pirateborg\.class-buccaneer\.Item\./, "uuid points at the source pack entry");
  assert.doesNotMatch(item.link, /undefined|null/, "link must not contain a broken uuid");
  assert.equal(item.link, `@UUID[${item.uuid}]{Survivalist}`);
});

test("the returned item is a clone, so mutating it never corrupts the cache", async () => {
  const first = await findCompendiumItem("pirateborg.class-buccaneer", "Survivalist");
  first.getData().description = "MUTATED";
  const second = await findCompendiumItem("pirateborg.class-buccaneer", "Survivalist");
  assert.notEqual(second.getData().description, "MUTATED", "second lookup is isolated from the first's mutation");
});
