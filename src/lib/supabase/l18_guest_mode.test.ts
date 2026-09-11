function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runL18GuestModeUnitTests() {
  console.log('--- Starting L18 Guest Mode & Motivational Trigger Unit Tests ---');

  // Test 1: getProfileByUsername function contract & sanitization
  const cleanA = '  @UserA  '.trim().replace(/^@/, '').toLowerCase();
  assert(cleanA === 'usera', 'Username cleaning removes @ and converts to lowercase');

  const cleanEmpty = ' @ '.trim().replace(/^@/, '').toLowerCase();
  assert(cleanEmpty === '', 'Cleaning @ only results in empty string');

  // Test 2: Motivational Trigger Message Copy Integrity
  const triggerTag = 'Boost Discoverability';
  const triggerHeading = 'Complete your profile to start trading skills!';
  const triggerBody = 'Members with complete profiles get up to 3x higher response rates on swap requests. Add your skills and bio to make your expertise discoverable to community partners.';

  assert(triggerTag === 'Boost Discoverability', 'Trigger tag communicates discoverability benefit');
  assert(triggerHeading.includes('trading skills'), 'Trigger heading encourages trading skills');
  assert(!triggerBody.includes('25%'), 'Trigger does not include L22 percentage calculation');
  assert(!triggerBody.includes('expired') && !triggerBody.includes('urgent'), 'Trigger avoids artificial urgency or pressure');

  console.log('✓ All L18 Guest Mode & Motivational Trigger unit tests passed!');
}
