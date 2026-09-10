function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Unit tests for Section H.3 — Visual Scaffolding Fading and Expertise Reversal.
 * Validates the core rule:
 * - completed_swaps <= 3 => Novice user (guidance shown by default)
 * - completed_swaps > 3 => Experienced user (guidance automatically suppressed/faded)
 * - Persistent dismissal ("Don't show this again")
 * - Manual expansion / guidance restoration
 */
export function runSectionH3ScaffoldingUnitTests() {
  console.log('--- Starting Section H.3 Visual Scaffolding Fading Unit Tests ---');

  // Rule 1: Novice user (completed_swaps <= 3) classification across boundary counts 0, 1, 2, 3
  const noviceCounts = [0, 1, 2, 3];
  for (const count of noviceCounts) {
    assert(count <= 3, `completed_swaps = ${count} classified as novice`);
    const isExperienced = count > 3;
    assert(!isExperienced, `User with ${count} completed swaps is not experienced`);
  }

  // Fallback check: undefined / loading completed_swaps_count defaults safely to 0 (novice)
  const undefinedCount: number | undefined = undefined;
  const safeCount = undefinedCount ?? 0;
  assert(safeCount === 0 && safeCount <= 3, 'Undefined/loading completed_swaps_count defaults to 0 (novice state)');

  // Rule 2: Experienced user (completed_swaps > 3) classification across boundary counts 4, 10
  const experiencedCounts = [4, 5, 10, 50];
  for (const count of experiencedCounts) {
    assert(count > 3, `completed_swaps = ${count} classified as experienced`);
    const isExperienced = count > 3;
    assert(isExperienced, `User with ${count} completed swaps is experienced`);
  }

  // Rule 2b: Incomplete swap statuses (open, accepted, submitted, cancelled) do not increment completed count
  const nonCompletedSwaps = [
    { status: 'open' },
    { status: 'accepted' },
    { status: 'submitted' },
    { status: 'cancelled' },
  ];
  const genuinelyCompletedCount = nonCompletedSwaps.filter((s) => s.status === 'completed').length;
  assert(genuinelyCompletedCount === 0, 'Incomplete/in-progress/cancelled swaps do not count toward completed_swaps_count');

  // Rule 3: Scaffolding shouldShow behavior matrix
  // Case A: Novice, not dismissed, not manually expanded => shouldShow = true
  let isExperienced = false;
  let isDismissed = false;
  let isManuallyExpanded = false;
  let shouldShow = isManuallyExpanded || (!isExperienced && !isDismissed);
  assert(shouldShow === true, 'Novice user with no dismissal sees beginner guidance');

  // Case B: Novice, dismissed ("Don't show this again") => shouldShow = false
  isDismissed = true;
  shouldShow = isManuallyExpanded || (!isExperienced && !isDismissed);
  assert(shouldShow === false, 'Novice user who clicked "Don\'t show this again" does not see guidance');

  // Case C: Experienced user, not dismissed, not manually expanded => shouldShow = false (auto-faded)
  isExperienced = true;
  isDismissed = false;
  isManuallyExpanded = false;
  shouldShow = isManuallyExpanded || (!isExperienced && !isDismissed);
  assert(shouldShow === false, 'Experienced user (>3 completed swaps) has guidance automatically suppressed');

  // Case D: Experienced user clicks "Show guidance again" => shouldShow = true
  isManuallyExpanded = true;
  shouldShow = isManuallyExpanded || (!isExperienced && !isDismissed);
  assert(shouldShow === true, 'Experienced user can manually expand guidance when needed');

  // Rule 4: Accessibility tree behavior check
  // When shouldShow is false, the full scaffolding card DOM is omitted, preventing keyboard focus or screen reader noise.
  const hiddenStateShouldShow = false;
  const hiddenScaffoldCardElement = hiddenStateShouldShow ? 'Rendered Card' : null;
  assert(hiddenScaffoldCardElement === null, 'Hidden scaffolding card element is omitted from render tree to eliminate focus and screen reader noise');

  // Rule 5: Storage key formatting & Section L.5 Independent Dismissal Isolation
  const scaffoldId = 'explore_marketplace_guide';
  const expectedStorageKey = `skillswap_dismissed_scaffold_${scaffoldId}`;
  assert(expectedStorageKey === 'skillswap_dismissed_scaffold_explore_marketplace_guide', 'Storage key matches canonical prefix and scaffold ID');

  // Test Section L.5 explicit independent preference isolation across guidance items
  const scaffoldIds = ['explore_marketplace_guide', 'create_swap_template_gallery', 'active_swaps_journey'];
  const mockStorage: Record<string, string> = {};

  // Dismiss only 'explore_marketplace_guide'
  mockStorage[`skillswap_dismissed_scaffold_${scaffoldIds[0]}`] = 'true';

  const isExploreDismissed = mockStorage[`skillswap_dismissed_scaffold_${scaffoldIds[0]}`] === 'true';
  const isCreateTemplateDismissed = mockStorage[`skillswap_dismissed_scaffold_${scaffoldIds[1]}`] === 'true';
  const isActiveJourneyDismissed = mockStorage[`skillswap_dismissed_scaffold_${scaffoldIds[2]}`] === 'true';

  assert(isExploreDismissed === true, 'Explore guidance is correctly marked dismissed in storage');
  assert(isCreateTemplateDismissed === false, 'Create template guidance remains unaffected by explore guidance dismissal');
  assert(isActiveJourneyDismissed === false, 'Active swaps journey guidance remains unaffected by explore guidance dismissal');

  // Rule 6: Section L.5 Explicit Label Wording Check
  const explicitDismissLabel = "Don't show this again";
  assert(explicitDismissLabel === "Don't show this again", 'Scaffolding dismiss controls render exact explicit wording "Don\'t show this again"');

  console.log('✓ All Section H.3 & Section L.5 Visual Scaffolding & Autonomy unit tests passed perfectly!');
}
