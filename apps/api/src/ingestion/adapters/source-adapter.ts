/**
 * SourceAdapter contract (docs/ARCHITECTURE.md §3): GitHub implements it in v0.1;
 * Cursor and Devin polling adapters slot in at v0.2 with no pipeline changes.
 */
export interface SourceAdapter<TRaw = unknown> {
  fetchSince(cursor: string | null): Promise<{ items: TRaw[]; nextCursor: string | null }>;
  normalize(raw: TRaw): unknown; // returns canonical event insert shape
  dedupKey(raw: TRaw): string;
}
