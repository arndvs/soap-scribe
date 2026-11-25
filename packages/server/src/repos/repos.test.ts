import { describe, it } from "vitest";
import { MongoClient } from "mongodb";
import { createMemoryRepos } from "./memory.js";
import { createMongoRepos, ensureIndexes } from "./mongo.js";
import { repoContract } from "./contract.js";

repoContract("memory", async () => createMemoryRepos());

const uri = process.env.TEST_MONGODB_URI;
if (uri) {
  let n = 0;
  repoContract("mongodb", async () => {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(`soap_scribe_test_${process.pid}_${n++}`);
    await db.dropDatabase();
    await ensureIndexes(db);
    return createMongoRepos(db);
  });
} else {
  describe("repository contract: mongodb", () => {
    it.skip("set TEST_MONGODB_URI to run the MongoDB contract tests", () => {});
  });
}
