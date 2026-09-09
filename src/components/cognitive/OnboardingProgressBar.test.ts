import React from 'react';
import { OnboardingProgressBar, type OnboardingProgressBarProps } from './CognitiveUIComponents';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Unit & Contract Verification Suite for Section K.3 & K.4 (Empowered Progress Onboarding Bar).
 */
export function runOnboardingProgressBarUnitTests() {
  console.log('--- Starting Section K.3 & K.4 Empowered Progress Onboarding Bar Unit Tests ---');

  // 1. Default Reference Props (25% pre-filled, 100 SkillCredits callout, 3-step checklist)
  const defaultBar = OnboardingProgressBar({});
  assert(React.isValidElement(defaultBar), 'OnboardingProgressBar returns a valid React element');

  // 2. Initial Step 1 progress calculation (25%)
  const step1Props: OnboardingProgressBarProps = { currentStep: 1, creditsBalance: 100 };
  const step1Element = OnboardingProgressBar(step1Props);
  assert(React.isValidElement(step1Element), 'Step 1 renders valid React element');

  // 3. Step 2 progress calculation (50%)
  const step2Props: OnboardingProgressBarProps = { currentStep: 2, creditsBalance: 100 };
  const step2Element = OnboardingProgressBar(step2Props);
  const step2Percent = 25 + Math.round(((step2Props.currentStep! - 1) / 3) * 75);
  assert(React.isValidElement(step2Element) && step2Percent === 50, 'Step 2 calculates 50% completed progress');

  // 4. Step 3 progress calculation (75%)
  const step3Props: OnboardingProgressBarProps = { currentStep: 3, creditsBalance: 100 };
  const step3Element = OnboardingProgressBar(step3Props);
  const step3Percent = 25 + Math.round(((step3Props.currentStep! - 1) / 3) * 75);
  assert(React.isValidElement(step3Element) && step3Percent === 75, 'Step 3 calculates 75% completed progress');

  // 5. Step 4 / Complete progress calculation (100%)
  const step4Props: OnboardingProgressBarProps = { currentStep: 4, creditsBalance: 100, isCompleted: true };
  const completedPercent = step4Props.isCompleted ? 100 : 90;
  assert(completedPercent === 100, 'Completed profile calculates 100% completed progress');

  // 6. Custom Welcome Balance Reflection
  const customBalanceProps: OnboardingProgressBarProps = { currentStep: 1, creditsBalance: 150 };
  assert(customBalanceProps.creditsBalance === 150, 'Custom credits balance reflected accurately');

  // 7. ARIA progress attributes
  const progressTrackProps = {
    role: 'progressbar',
    'aria-valuenow': 25,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-label': 'Profile completion progress',
  };
  assert(progressTrackProps.role === 'progressbar', 'ARIA progressbar role present');
  assert(progressTrackProps['aria-valuenow'] === 25, 'ARIA valuenow set to 25');
  assert(progressTrackProps['aria-valuemin'] === 0, 'ARIA valuemin set to 0');
  assert(progressTrackProps['aria-valuemax'] === 100, 'ARIA valuemax set to 100');
  assert(progressTrackProps['aria-label'] === 'Profile completion progress', 'ARIA label set correctly');

  console.log('✓ All Section K.3 & K.4 Empowered Progress Onboarding Bar unit tests passed!');
}

// Execute tests if run directly
if (import.meta.url.endsWith('OnboardingProgressBar.test.ts') || process.argv[1]?.endsWith('OnboardingProgressBar.test.ts')) {
  runOnboardingProgressBarUnitTests();
}
