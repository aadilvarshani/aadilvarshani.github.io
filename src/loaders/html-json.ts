import type { Loader } from "astro/loaders";
import { readdir, readFile } from "node:fs/promises";

// Each entry is a pair: <id>.json (metadata, validated by the collection schema) and <id>.html
// (the body, kept byte for byte). Markdown would reflow the HTML and break detection queries.
export function htmlJson(dir: string): Loader {
  return {
    name: "html-json",
    load: async ({ store, parseData, generateDigest, config }) => {
      const base = new URL(dir.endsWith("/") ? dir : `${dir}/`, config.root);
      store.clear();
      for (const file of (await readdir(base)).filter((name) => name.endsWith(".json"))) {
        const id = file.slice(0, -".json".length);
        const raw = JSON.parse(await readFile(new URL(file, base), "utf8"));
        const body = await readFile(new URL(`${id}.html`, base), "utf8");
        const data = await parseData({ id, data: raw });
        store.set({ id, data, body, digest: generateDigest({ raw, body }) });
      }
    },
  };
}
