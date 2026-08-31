import { formatFriendlyErrorMessage, validateUsernameFormat } from './profile';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runProfileIdentityTests() {
  console.log('Running SkillSwap Username Identity Integrity tests...');

  // TEST 1: validateUsernameFormat
  console.log('Test 1: validateUsernameFormat');
  assert(validateUsernameFormat('swejot'), 'valid lowercase username');
  assert(validateUsernameFormat('alex_123'), 'valid username with underscore and numbers');
  assert(validateUsernameFormat('john.doe'), 'valid username with dot');
  assert(!validateUsernameFormat('ab'), 'too short (2 chars)');
  assert(!validateUsernameFormat('a'.repeat(31)), 'too long (31 chars)');
  assert(!validateUsernameFormat('Swejot'), 'uppercase letters should fail validation');
  assert(!validateUsernameFormat('user name'), 'space should fail validation');
  assert(!validateUsernameFormat('user@name'), 'invalid character @');

  // TEST 2: formatFriendlyErrorMessage for Unique Constraint Violations
  console.log('Test 2: formatFriendlyErrorMessage for unique constraint errors');
  const err1 = { message: 'duplicate key value violates unique constraint "idx_profiles_username_lower"' };
  assert(
    formatFriendlyErrorMessage(err1) === 'This username was just taken. Please choose another username.',
    'Translates idx_profiles_username_lower unique violation'
  );

  const err2 = { message: 'duplicate key value violates unique constraint "profiles_username_key"' };
  assert(
    formatFriendlyErrorMessage(err2) === 'This username was just taken. Please choose another username.',
    'Translates profiles_username_key unique violation'
  );

  const err3 = 'ERROR 23505: duplicate key value violates unique constraint on username';
  assert(
    formatFriendlyErrorMessage(err3) === 'This username was just taken. Please choose another username.',
    'Translates raw SQL 23505 duplicate username string'
  );

  // TEST 3: formatFriendlyErrorMessage for Immutable Username
  console.log('Test 3: formatFriendlyErrorMessage for immutable username');
  const errImmutable = { message: 'Username is permanently immutable once set.' };
  assert(
    formatFriendlyErrorMessage(errImmutable) === 'Username cannot be changed once set.',
    'Translates username immutability trigger exception'
  );

  // TEST 4: formatFriendlyErrorMessage for Auth & Technical Errors
  console.log('Test 4: formatFriendlyErrorMessage for Auth & Technical Driver errors');
  assert(
    formatFriendlyErrorMessage({ message: 'Invalid login credentials' }) === "Account doesn't exist or invalid credentials.",
    'Sanitizes invalid login credentials'
  );
  assert(
    formatFriendlyErrorMessage({ message: 'Token has expired' }) === 'The verification code has expired. Please request a new code.',
    'Sanitizes expired token'
  );
  assert(
    formatFriendlyErrorMessage({ message: 'PGRST116 JSON object requested, multiple (or no) rows returned' }) ===
      'Something went wrong while processing your request. Please try again.',
    'Sanitizes technical PostgREST PGRST error'
  );

  console.log('All SkillSwap Username Identity Integrity tests passed successfully!');
}

// Execute tests
runProfileIdentityTests();
