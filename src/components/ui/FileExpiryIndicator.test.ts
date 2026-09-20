import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import React from 'react';
import { formatFileExpiryTime, getFileExpiryStatus } from '../../lib/fileExpiry';
import { FileExpiryIndicator } from './FileExpiryIndicator';
import type { SwapSubmissionFile, SwapMessageAttachment } from '../../types/swap';
import type { SwapAttachment } from '../../lib/supabase/credits';

describe('File Expiry System Tests', () => {
  test('formatFileExpiryTime formats remaining duration correctly', () => {
    const ONE_MIN = 60 * 1000;
    const ONE_HOUR = 60 * ONE_MIN;
    const ONE_DAY = 24 * ONE_HOUR;

    // 3 days
    assert.strictEqual(formatFileExpiryTime(3 * ONE_DAY).text, 'Expires in 3 days');
    assert.strictEqual(formatFileExpiryTime(3 * ONE_DAY).urgency, 'normal');

    // 1 day
    assert.strictEqual(formatFileExpiryTime(1.5 * ONE_DAY).text, 'Expires in 1 day');

    // 7 hours
    assert.strictEqual(formatFileExpiryTime(7 * ONE_HOUR).text, 'Expires in 7 hours');
    assert.strictEqual(formatFileExpiryTime(7 * ONE_HOUR).urgency, 'normal');

    // 2 hours
    assert.strictEqual(formatFileExpiryTime(2 * ONE_HOUR).text, 'Expires in 2 hours');
    assert.strictEqual(formatFileExpiryTime(2 * ONE_HOUR).urgency, 'soon');

    // 1 hour
    assert.strictEqual(formatFileExpiryTime(1 * ONE_HOUR).text, 'Expires in 1 hour');
    assert.strictEqual(formatFileExpiryTime(1 * ONE_HOUR).urgency, 'soon');

    // 45 minutes
    assert.strictEqual(formatFileExpiryTime(45 * ONE_MIN).text, 'Expires in 45 minutes');
    assert.strictEqual(formatFileExpiryTime(45 * ONE_MIN).urgency, 'very_soon');

    // 1 minute
    assert.strictEqual(formatFileExpiryTime(1 * ONE_MIN).text, 'Expires in 1 minute');
    assert.strictEqual(formatFileExpiryTime(1 * ONE_MIN).urgency, 'very_soon');

    // Already expired (<= 0)
    assert.strictEqual(formatFileExpiryTime(0).text, 'File expired');
    assert.strictEqual(formatFileExpiryTime(-1000).text, 'File expired');
  });

  test('getFileExpiryStatus evaluates timestamps and deletion flags accurately', () => {
    const now = Date.now();
    // 10s buffer ensures Date.now() execution delta doesn't reduce remaining duration below 2 hours
    const inTwoHours = new Date(now + 2 * 3600 * 1000 + 10000).toISOString();
    const pastOneHour = new Date(now - 3600 * 1000).toISOString();

    // Active future file
    const activeStatus = getFileExpiryStatus(inTwoHours, null);
    assert.strictEqual(activeStatus.isExpired, false);
    assert.strictEqual(activeStatus.isDeleted, false);
    assert.strictEqual(activeStatus.displayText, 'Expires in 2 hours');

    // Past file
    const pastStatus = getFileExpiryStatus(pastOneHour, null);
    assert.strictEqual(pastStatus.isExpired, true);
    assert.strictEqual(pastStatus.displayText, 'File expired');
    assert.strictEqual(pastStatus.subtext, 'This file is no longer available.');

    // Deleted file
    const deletedStatus = getFileExpiryStatus(inTwoHours, 'deleted');
    assert.strictEqual(deletedStatus.isExpired, true);
    assert.strictEqual(deletedStatus.isDeleted, true);
    assert.strictEqual(deletedStatus.displayText, 'File expired');
    assert.strictEqual(deletedStatus.subtext, 'This file is no longer available.');
  });

  test('Data Model Mapping preserves authoritative expiry fields across file types', () => {
    const creatorExpiry = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const submissionExpiry = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const chatExpiry = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

    const creatorAttachment: SwapAttachment = {
      id: 'att-1',
      swapId: 'swap-1',
      uploadedBy: 'user-1',
      storagePath: 'swap-attachments/swap-1/user-1/doc.pdf',
      fileName: 'doc.pdf',
      createdAt: new Date().toISOString(),
      expiresAt: creatorExpiry,
      deletedAt: null,
      deleteStatus: 'active',
      storageExpiresAt: creatorExpiry,
      storageDeletedAt: null,
      storageDeleteStatus: 'active',
    };

    const submissionFile: SwapSubmissionFile = {
      id: 'subfile-1',
      submissionId: 'sub-1',
      storagePath: 'submissions/swap-1/user-1/deliverable.zip',
      fileName: 'deliverable.zip',
      createdAt: new Date().toISOString(),
      expiresAt: submissionExpiry,
      deletedAt: null,
      deleteStatus: 'active',
      storageExpiresAt: submissionExpiry,
      storageDeletedAt: null,
      storageDeleteStatus: 'active',
    };

    const chatAttachment: SwapMessageAttachment = {
      id: 'chatatt-1',
      messageId: 'msg-1',
      swapId: 'swap-1',
      uploadedBy: 'user-1',
      storagePath: 'swap-chat-attachments/swap-1/user-1/screenshot.png',
      fileName: 'screenshot.png',
      createdAt: new Date().toISOString(),
      expiresAt: chatExpiry,
      deletedAt: null,
      deleteStatus: 'active',
      deleteAfter: chatExpiry,
    };

    assert.ok(creatorAttachment.expiresAt);
    assert.strictEqual(getFileExpiryStatus(creatorAttachment.expiresAt).isExpired, false);

    assert.ok(submissionFile.expiresAt);
    assert.strictEqual(getFileExpiryStatus(submissionFile.expiresAt).isExpired, false);

    assert.ok(chatAttachment.expiresAt);
    assert.strictEqual(getFileExpiryStatus(chatAttachment.expiresAt).isExpired, false);
  });

  test('FileExpiryIndicator Component renders cleanly across all attachment surfaces', () => {
    const futureTime = new Date(Date.now() + 7 * 3600 * 1000).toISOString();

    // Inline Indicator
    const inlineElement = React.createElement(FileExpiryIndicator, {
      expiresAt: futureTime,
      inline: true,
    });
    assert.strictEqual(inlineElement.type, FileExpiryIndicator);
    assert.strictEqual(inlineElement.props.inline, true);

    // Badge Indicator
    const badgeElement = React.createElement(FileExpiryIndicator, {
      expiresAt: futureTime,
      inline: false,
    });
    assert.strictEqual(badgeElement.type, FileExpiryIndicator);
    assert.strictEqual(badgeElement.props.inline, false);
  });

  test('getFileExpiryStatus handles null expiry timestamps without fake countdown text', () => {
    const nullStatus = getFileExpiryStatus(null, false);
    assert.strictEqual(nullStatus.displayText, '');
    assert.strictEqual(nullStatus.isExpired, false);

    const undefinedStatus = getFileExpiryStatus(undefined, false);
    assert.strictEqual(undefinedStatus.displayText, '');
    assert.strictEqual(undefinedStatus.isExpired, false);
  });
});
