import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { htmlJson } from "./loaders/html-json";

const blog = defineCollection({
  loader: htmlJson("src/content/blog"),
  schema: z.object({
    title: z.string(),
    pageTitle: z.string().optional(),
    description: z.string(),
    published: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    seat: z.enum(["sensor", "source", "author", "reader"]),
    series: z.enum(["understanding-windows", "building-an-edr", "osint"]),
    order: z.number().int(),
    texture: z.string(),
    metaLabel: z.string().optional(),
    stepLabel: z.string(),
    stepShort: z.string(),
    scripts: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
