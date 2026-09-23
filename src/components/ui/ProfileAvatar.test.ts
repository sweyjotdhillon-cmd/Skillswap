import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ProfileAvatar } from './ProfileAvatar';
import { getInitials } from '../../lib/initials';

describe('ProfileAvatar Unit Tests', () => {
  describe('getInitials helper', () => {
    test('extracts first and last initials from full names', () => {
      assert.strictEqual(getInitials('Alex Morgan'), 'AM');
      assert.strictEqual(getInitials('John Jane Doe'), 'JD');
      assert.strictEqual(getInitials('Single'), 'SI');
      assert.strictEqual(getInitials('a b c d e'), 'AE');
    });

    test('handles empty or null names gracefully', () => {
      assert.strictEqual(getInitials(null), 'SS');
      assert.strictEqual(getInitials(undefined), 'SS');
      assert.strictEqual(getInitials(''), 'SS');
      assert.strictEqual(getInitials('   '), 'SS');
    });

    test('handles long and whitespace-heavy names deterministically', () => {
      assert.strictEqual(
        getInitials('   Dr.   Bartholomew   Montgomery-Ponsonby III   '),
        'DI'
      );
    });
  });

  describe('ProfileAvatar React element structure & props contract', () => {
    test('renders img element when valid src is provided', () => {
      const element = ProfileAvatar({
        src: 'https://lh3.googleusercontent.com/a/abc123',
        displayName: 'Sarah Connor',
        size: 'lg',
        className: 'custom-avatar-class',
      });

      assert.strictEqual(element.type, 'img');
      assert.strictEqual(element.props.src, 'https://lh3.googleusercontent.com/a/abc123');
      assert.strictEqual(element.props.alt, 'Profile photo of Sarah Connor');
      assert.ok(typeof element.props.onError === 'function');
      assert.ok(element.props.className.includes('custom-avatar-class'));
    });

    test('renders initials fallback div when src is null or empty', () => {
      const elementNull = ProfileAvatar({
        src: null,
        displayName: 'Marcus Aurelius',
        size: 'md',
      });

      assert.strictEqual(elementNull.type, 'div');
      assert.strictEqual(elementNull.props.role, 'img');
      assert.strictEqual(
        elementNull.props['aria-label'],
        'Profile photo unavailable for Marcus Aurelius. Initials shown instead.'
      );
      assert.strictEqual(elementNull.props.children, 'MA');

      const elementEmpty = ProfileAvatar({
        src: '   ',
        displayName: 'Elena Rostova',
      });
      assert.strictEqual(elementEmpty.type, 'div');
      assert.strictEqual(elementEmpty.props.children, 'ER');
    });

    test('provides accurate accessible labels when display name is missing', () => {
      const element = ProfileAvatar({
        src: null,
        displayName: null,
      });

      assert.strictEqual(element.type, 'div');
      assert.strictEqual(
        element.props['aria-label'],
        'Profile photo unavailable for Member. Initials shown instead.'
      );
      assert.strictEqual(element.props.children, 'SS');
    });

    test('supports numerical size and ring styling', () => {
      const element = ProfileAvatar({
        src: 'https://avatars.githubusercontent.com/u/12345',
        displayName: 'Dev User',
        size: 84,
        showRing: true,
      });

      assert.strictEqual(element.type, 'img');
      assert.strictEqual(element.props.style.width, '84px');
      assert.strictEqual(element.props.style.height, '84px');
      assert.ok(element.props.className.includes('swap-avatar-ring'));
    });
  });
});
