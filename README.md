# cf-kv-exporter

CLI to export a Cloudflare a KV Namespace

**Why?**

Cloudflare today simply provided **not any** means of **exporting**, **backing-up** or **migrating** your KV data even between your own accounts!

It is not possible to load a whole KV inside a worker (due to subrequest limitation of 50...1000 requests) nor using HTTP API without hitting [rate limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/) (1200 requests in five minutes).

I have made this tool while struggeling to deal with [ungh](https://ungh.unjs.io/) service production cache with over 9K KV entries.

**How?**

This tool uses [Cloudflare KV HTTP API](https://developers.cloudflare.com/api/operations/workers-kv-namespace-read-key-value-pair) to list keys using paginated API and read them _one by one_ but in parallel (using [unstorage driver](https://unstorage.unjs.io/drivers/cloudflare-kv-http)). To overcome API [rate limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/), this tool caches paginated keys and fetched values and can _resume_ so we can run CLI tool multile times until all data is exported. Puff.

This CLI tool is based on [unjs ecosystem](https://unjs.io/) ([unjs/unstorage](https://unstorage.unjs.io), [unjs/citty](https://citty.unjs.io), [unjs/unbuild](https://unbuild.unjs.io) and [unjs/consola](https://consola.unjs.io)).

Check [./src/cli.ts](./src/cli.ts) for implementation!

## Usage

```sh
npx cf-kv-exporter export --namespaceId ...  --accountId ... --apiToken ...
```

Use `npx cf-kv-exporter export --help` to see more options.

## Development

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm cf-kv-exporter`

## License

Made with 💛

Published under [MIT License](./LICENSE).
