import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const STORAGE_PREFIX = 'skillswap_dismissed_scaffold_';

export interface UseScaffoldingReturn {
  isExperienced: boolean;
  isDismissed: boolean;
  isManuallyExpanded: boolean;
  shouldShow: boolean;
  dismissScaffold: () => void;
  restoreScaffold: () => void;
  toggleExpanded: () => void;
}

/**
 * Reusable hook for Section H.3 Visual Scaffolding Fading and Expertise Reversal.
 *
 * Rule: completedSwapsCount > 3 => experienced user.
 * - Experienced users: default to minimizing/fading beginner scaffolding cards and walkthroughs.
 * - Novice users (<= 3 completed swaps): default to showing guidance.
 * - Provides explicit autonomy controls: "Don't show this again" (persisted) and manual expansion toggle so experienced users can still access help if needed.
 */
export function useScaffolding(
  scaffoldId: string,
  overrideCompletedSwapsCount?: number
): UseScaffoldingReturn {
  const { profile } = useAuth();

  const completedCount =
    overrideCompletedSwapsCount ?? profile?.completed_swaps_count ?? 0;

  const isExperienced = completedCount > 3;

  const storageKey = `${STORAGE_PREFIX}${scaffoldId}`;

  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const [isManuallyExpanded, setIsManuallyExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const val = localStorage.getItem(storageKey) === 'true';
      setIsDismissed(val);
    } catch {
      // Ignore storage errors
    }
  }, [storageKey]);

  const dismissScaffold = useCallback(() => {
    setIsDismissed(true);
    setIsManuallyExpanded(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, 'true');
      } catch {
        // Ignore storage errors
      }
    }
  }, [storageKey]);

  const restoreScaffold = useCallback(() => {
    setIsDismissed(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage errors
      }
    }
  }, [storageKey]);

  const toggleExpanded = useCallback(() => {
    setIsManuallyExpanded((prev) => !prev);
  }, []);

  // Shown if manually expanded, or if not dismissed and user is a novice
  const shouldShow = isManuallyExpanded || (!isExperienced && !isDismissed);

  return {
    isExperienced,
    isDismissed,
    isManuallyExpanded,
    shouldShow,
    dismissScaffold,
    restoreScaffold,
    toggleExpanded,
  };
}
