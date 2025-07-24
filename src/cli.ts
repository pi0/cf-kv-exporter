#!/usr/bin/env node
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { defineCommand, runMain } from "citty";
import { createStorage } from "unstorage";
import cloudflareKVHTTP, {
  type KVHTTPOptions,
} from "unstorage/drivers/cloudflare-kv-http";
import fsLite from "unstorage/drivers/fs-lite";
import { consola } from "consola";
import cliProgress from "cli-progress";

import pkg from "../package.json" with { type: "json" };
import { runParallel } from "./utils.ts";

const envMap = {
  CF_ACCOUNT_ID: "accountId",
  CF_NAMESPACE_ID: "namespaceId",
  CF_API_TOKEN: "apiToken",
  CF_EMAIL: "email",
  CF_API_KEY: "apiKey",
  CF_USER_SERVICE_KEY: "userServiceKey",
  CF_API_URL: "apiURL",
} as const;

const exportCommand = defineCommand({
  meta: {
    description: "Export a Cloudflare KV namespace",
  },
  args: {
    cwd: {
      type: "string",
      default: ".",
      description: "The current working directory",
    },
    outDir: {
      type: "string",
      default: "kv_export",
      description: "The output directory",
    },
    base: {
      type: "string",
      description: "KV bucket key prefix to export",
    },
    cacheKeys: {
      type: "boolean",
      default: false,
      description: "Disable key caching",
    },
    namespaceId: {
      type: "string",
      required: true,
      description:
        "The ID of the KV namespace to target. Note: be sure to use the namespace's ID, and not the name or binding used in a worker environment (env: `CF_NAMESPACE_ID`)",
    },
    accountId: {
      type: "string",
      description: "The Cloudflare account ID (env: `CF_ACCOUNT_ID`)",
    },
    apiToken: {
      type: "string",
      description:
        "API Token generated from the User Profile 'API Tokens' page. (env: `CF_API_TOKEN`)",
    },
    email: {
      type: "string",
      description:
        "Email address associated with your account. May be used along with apiKey to authenticate in place of apiToken. (env: `CF_EMAIL`)",
    },
    apiKey: {
      type: "string",
      description:
        "API key generated on the My Account page of the Cloudflare console. May be used along with email to authenticate in place of apiToken (env: `CF_API_KEY`)",
    },
    userServiceKey: {
      type: "string",
      description:
        "A special Cloudflare API key good for a restricted set of endpoints. Always begins with `v1.0-`, may vary in length. May be used to authenticate in place of apiToken or apiKey and email (env: `CF_USER_SERVICE_KEY`)",
    },
    apiURL: {
      type: "string",
      description:
        "Custom API URL. Default is https://api.cloudflare.com (env: `CF_API_URL`)",
    },
  },
  async run({ args }) {
    consola.info("Initializing storage...");
    const storage = createStorage();

    // Init remote storage
    const driverOptions = { ...args } as KVHTTPOptions;
    for (const [env, key] of Object.entries(envMap)) {
      if (process.env[env]) {
        (driverOptions as any)[key] = process.env[env];
      }
    }
    storage.mount("src", cloudflareKVHTTP(driverOptions));

    // Init local storage
    const cwd = resolve(process.cwd(), args.cwd);
    const outDir = resolve(cwd, args.outDir);
    await mkdir(outDir, { recursive: true });
    storage.mount("out", fsLite({ base: outDir }));

    // List all keys
    const keysCacheId = "out/__export_keys__.json";
    let kvKeys = (await storage.getItem(keysCacheId)) as string[];
    if (kvKeys?.length) {
      consola.success(`Using cached keys. Use --force to refresh.`);
    } else {
      consola.start("Listing kv keys...");
      kvKeys = (await storage.getKeys("src:")).map((k) => k.slice(4));
      await storage.setItem(keysCacheId, kvKeys);
      consola.info(`Listed ${kvKeys.length} keys in total`);
    }

    // List local keys
    const localKeys = (await storage.getKeys("out:")).map((k) => k.slice(4));
    const keys =
      localKeys.length > 0
        ? kvKeys.filter((key) => !localKeys.includes(key))
        : kvKeys;

    // Export keys
    consola.start(`Exporting ${kvKeys.length} keys...`);

    const progress = new cliProgress.Bar({
      format:
        "export progress [{bar}] {percentage}% | ETA: {eta_formatted} | {value}/{total}",
    });
    progress.start(kvKeys.length, localKeys.length);

    await runParallel(
      new Set(keys),
      async (key) => {
        try {
          const value = await storage.getItemRaw(`src:${key}`);
          if (value) {
            await storage.setItemRaw(`out:${key}`, value);
          }
          progress.increment();
        } catch (error) {
          onError(error);
        }
      },
      // Cloudflare rate limits: https://developers.cloudflare.com/fundamentals/api/reference/limits/#:~:text=The%20global%20rate%20limit%20for,API%20key%2C%20or%20API%20token.
      // 1200 requests per 5 minute ~ 4 requests per second
      { concurrency: 4, interval: 1000 },
    );

    progress.stop();
  },
});

function onError(error: unknown) {
  consola.error(error);
  consola.info(
    "It is likely that you have hit the Cloudflare rate limit. Please try again later in few minutes.",
  );
  consola.info("Don't worry, your progress is saved and will be resumed!");
  process.exit(1);
}

const mainCommand = defineCommand({
  meta: {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
  },
  subCommands: {
    export: exportCommand,
  },
});

runMain(mainCommand);
