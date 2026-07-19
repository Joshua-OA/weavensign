import { z } from "zod";

/**
 * Response shape of `GET /v1/files/:key/images` — a map of Figma's internal image hash
 * (the same value `ImagePaintSchema.imageRef`/canonical `assetRef` carries) to a signed,
 * time-limited download URL. Verified live against a real file (99 real image refs, all
 * non-null). `meta.images[ref]` is documented by Figma as nullable for a ref it couldn't
 * resolve (e.g. a deleted asset) — kept `.nullable()` even though zero nulls appeared in
 * the live sample, since a single sample proving a shape doesn't prove every value the
 * field can take (learning_v0.md #006's lesson) and Figma's own docs state this case
 * exists.
 */
export const RawImageFillsResponseSchema = z.object({
  error: z.boolean(),
  status: z.number(),
  meta: z.object({
    images: z.record(z.string(), z.string().nullable()),
  }),
});
export type RawImageFillsResponse = z.infer<typeof RawImageFillsResponseSchema>;
