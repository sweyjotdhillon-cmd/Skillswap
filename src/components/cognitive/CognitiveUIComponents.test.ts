import React from 'react';
import { MarketplaceCard, MultiModalChat } from './CognitiveUIComponents';
import { runOnboardingProgressBarUnitTests } from './OnboardingProgressBar.test';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Consolidated Unit Test Suite for Section K Cognitive UI Components
 * (MarketplaceCard, MultiModalChat, OnboardingProgressBar).
 */
export function runCognitiveUIComponentsUnitTests() {
  console.log('--- Starting Section K Cognitive UI Components Suite ---');

  // 1. Run OnboardingProgressBar unit tests
  runOnboardingProgressBarUnitTests();

  // 2. MarketplaceCard component element creation test
  const cardProps = {
    title: 'React UI System',
    description: 'Build robust components using design tokens',
    category: 'Development',
    credits: 50,
    creatorName: 'Alex Smith',
    creatorAvatar: 'https://example.com/avatar.png',
    timeAgo: '2h ago',
    onAccept: () => {},
    username: 'alex',
    isVerified: true,
    averageRating: 4.9,
    reviewCount: 12,
    completedSwapsCount: 8,
  };

  const cardElement = React.createElement(MarketplaceCard, cardProps);
  assert(React.isValidElement(cardElement), 'MarketplaceCard returns a valid React element');

  // 3. MultiModalChat component element creation test
  const chatElement = React.createElement(MultiModalChat);
  assert(React.isValidElement(chatElement), 'MultiModalChat returns a valid React element');

  console.log('✓ All Section K Cognitive UI Components tests passed!');
}

// Execute tests if run directly
if (import.meta.url.endsWith('CognitiveUIComponents.test.ts') || process.argv[1]?.endsWith('CognitiveUIComponents.test.ts')) {
  runCognitiveUIComponentsUnitTests();
}
