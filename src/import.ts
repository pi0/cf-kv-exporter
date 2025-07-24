// This is a testing script for now

import { createStorage } from "unstorage";

import fsLite from "unstorage/drivers/fs-lite";
import upstash from "unstorage/drivers/upstash";
import cliProgress from "cli-progress";
import { runParallel } from "./utils.ts";
import { config } from "dotenv";

config();

const storage = createStorage();

storage.mount("src", fsLite({ base: "kv_export" }));
storage.mount(
  "dest",
  upstash({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }),
);

const keys = await storage
  .getKeys("src:")
  .then((r) => r.map((k) => k.slice(4)));

const progress = new cliProgress.Bar({
  format:
    "export progress [{bar}] {percentage}% | ETA: {eta_formatted} | {value}/{total}",
});
progress.start(keys.length, 0);

await runParallel(
  new Set(keys),
  async (key) => {
    const value = await storage.getItem(`src:${key}`);

    if (!value) {
      return progress.increment();
    }

    let ttl;
    if ((value as { expires?: number }).expires) {
      ttl = Math.floor(
        ((value as { expires: number }).expires - Date.now()) / 1000,
      );
    }

    if (ttl && ttl <= 0) {
      return progress.increment();
    }

    await storage.setItem(`dest:${key}`, value, { ttl });

    return progress.increment();
  },
  {
    concurrency: 1000,
    interval: 1000,
  },
);
