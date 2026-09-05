/**
 * Canonical single source of truth for Swap Tags across Skillswap.
 * Used for Create Swap tag selection, Explore Swap tag filtering, and backend database validation.
 */
export const ALLOWED_SWAP_TAGS = [
  'Design',
  'Coding',
  'Writing',
  'Photography',
  'Video Editing',
  'Marketing',
  'Music',
  'Languages',
  'Career',
  'Fitness',
  'Other',
] as const;

export type SwapTag = (typeof ALLOWED_SWAP_TAGS)[number];

/**
 * Checks if a string is a valid allowed swap tag.
 */
export function isValidSwapTag(tag: string): tag is SwapTag {
  return (ALLOWED_SWAP_TAGS as readonly string[]).includes(tag);
}

/**
 * Validates an array of tag strings against ALLOWED_SWAP_TAGS.
 * Returns true if all elements are valid and non-empty.
 */
export function validateSwapTags(tags: string[]): boolean {
  if (!Array.isArray(tags) || tags.length === 0) return false;
  return tags.every((tag) => typeof tag === 'string' && isValidSwapTag(tag));
}
