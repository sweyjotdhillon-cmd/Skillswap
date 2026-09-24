import { test, describe } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToString } from 'react-dom/server';
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

  describe('ProfileAvatar Component Rendering & HTML Contract', () => {
    test('renders img element when valid src is provided', () => {
      const html = renderToString(
        React.createElement(ProfileAvatar, {
          src: 'https://lh3.googleusercontent.com/a/abc123',
          displayName: 'Sarah Connor',
          size: 'lg',
          className: 'custom-avatar-class',
        })
      );

      assert.ok(html.includes('<img'), 'Must render <img> tag when valid src is provided');
      assert.ok(html.includes('src="https://lh3.googleusercontent.com/a/abc123"'));
      assert.ok(html.includes('alt="Profile photo of Sarah Connor"'));
      assert.ok(html.includes('class="custom-avatar-class"'));
    });

    test('renders initials fallback div when src is null or empty', () => {
      const htmlNull = renderToString(
        React.createElement(ProfileAvatar, {
          src: null,
          displayName: 'Marcus Aurelius',
          size: 'md',
        })
      );

      assert.ok(htmlNull.includes('<div'), 'Must render fallback <div> when src is null');
      assert.ok(htmlNull.includes('role="img"'));
      assert.ok(
        htmlNull.includes('aria-label="Profile photo unavailable for Marcus Aurelius. Initials shown instead."')
      );
      assert.ok(htmlNull.includes('>MA</div>'), 'Must render initials inside fallback div');

      const htmlEmpty = renderToString(
        React.createElement(ProfileAvatar, {
          src: '   ',
          displayName: 'Elena Rostova',
        })
      );
      assert.ok(htmlEmpty.includes('<div'));
      assert.ok(htmlEmpty.includes('>ER</div>'));
    });

    test('provides accurate accessible labels when display name is missing', () => {
      const html = renderToString(
        React.createElement(ProfileAvatar, {
          src: null,
          displayName: null,
        })
      );

      assert.ok(html.includes('<div'));
      assert.ok(
        html.includes('aria-label="Profile photo unavailable for Member. Initials shown instead."')
      );
      assert.ok(html.includes('>SS</div>'));
    });

    test('supports numerical size and ring styling', () => {
      const html = renderToString(
        React.createElement(ProfileAvatar, {
          src: 'https://avatars.githubusercontent.com/u/12345',
          displayName: 'Dev User',
          size: 84,
          showRing: true,
        })
      );

      assert.ok(html.includes('<img'));
      assert.ok(html.includes('width:84px'));
      assert.ok(html.includes('height:84px'));
      assert.ok(html.includes('swap-avatar-ring'));
    });
  });
});
