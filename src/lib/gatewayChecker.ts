import { execSync } from 'child_process';

console.log('=== SKILLSWAP GATEWAY CHECKER ===');
const gitDiff = execSync('git diff').toString();
const linesChanged = gitDiff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length;

console.log('Total diff lines touched:', linesChanged);

// Check 1: Ensure no mock data or forced mock arrays were re-introduced
if (gitDiff.includes('INITIAL_ACCEPTED_SWAPS') || gitDiff.includes('INITIAL_GIVEN_SWAPS')) {
  console.error('FAILED Gateway Check: Mock data reintroduced!');
  process.exit(1);
}

// Check 2: Ensure test suite passes
try {
  console.log('Running test suite...');
  execSync('npm test', { stdio: 'inherit' });
  console.log('✓ Test suite passed cleanly.');
} catch {
  console.error('FAILED Gateway Check: Test suite failure');
  process.exit(1);
}

// Check 3: Ensure production build succeeds
try {
  console.log('Running build verification...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✓ Production build passed cleanly.');
} catch {
  console.error('FAILED Gateway Check: Build failure');
  process.exit(1);
}

console.log('=== ALL GATEWAY CHECKER CHECKS PASSED PERFECTLY ===');
