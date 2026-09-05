/**
 * Canonical single source of truth for Swap Tags across Skillswap.
 * Used for Create Swap tag selection, Explore Swap tag filtering, and backend database validation.
 */

export interface SwapTagOption {
  label: string;
  slug: string;
}

export const SWAP_TAG_OPTIONS: readonly SwapTagOption[] = [
  { label: 'Design', slug: 'design' },
  { label: 'Coding', slug: 'coding' },
  { label: 'Writing', slug: 'writing' },
  { label: 'Photography', slug: 'photography' },
  { label: 'Video Editing', slug: 'video-editing' },
  { label: 'Marketing', slug: 'marketing' },
  { label: 'Music', slug: 'music' },
  { label: 'Languages', slug: 'languages' },
  { label: 'Career', slug: 'career' },
  { label: 'Fitness', slug: 'fitness' },
  { label: 'Other', slug: 'other' },
] as const;

export const ALLOWED_SWAP_TAGS = SWAP_TAG_OPTIONS.map((t) => t.label);

export type SwapTag = typeof SWAP_TAG_OPTIONS[number]['slug'];

/** Maps a tag label or slug to its canonical slug value. */
export function getTagSlug(labelOrSlug: string): string {
  if (!labelOrSlug) return 'other';
  const match = SWAP_TAG_OPTIONS.find(
    (t) => t.slug === labelOrSlug.toLowerCase() || t.label.toLowerCase() === labelOrSlug.toLowerCase()
  );
  return match ? match.slug : labelOrSlug.toLowerCase().replace(/\s+/g, '-');
}

/** Maps a tag slug or label to its human-readable display label. */
export function getTagLabel(slugOrLabel: string): string {
  if (!slugOrLabel) return 'Other';
  const match = SWAP_TAG_OPTIONS.find(
    (t) => t.slug === slugOrLabel.toLowerCase() || t.label.toLowerCase() === slugOrLabel.toLowerCase()
  );
  return match ? match.label : slugOrLabel;
}

/** Checks if a string is a valid allowed swap tag slug or label. */
export function isValidSwapTag(tag: string): boolean {
  if (!tag) return false;
  const tagLower = tag.toLowerCase();
  return SWAP_TAG_OPTIONS.some((t) => t.slug === tagLower || t.label.toLowerCase() === tagLower);
}

/** Validates an array of tag strings against canonical swap tags. */
export function validateSwapTags(tags: string[]): boolean {
  if (!Array.isArray(tags) || tags.length === 0) return false;
  return tags.every((tag) => typeof tag === 'string' && isValidSwapTag(tag));
}
