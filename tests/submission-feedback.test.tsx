import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describeSubmissionIssue, SubmissionResponseError } from '../src/shared/submission-feedback';
import { SubmissionFeedback } from '../src/components/ui/SubmissionFeedback';

test('validation and authorization rejections retain entries and specify how to recover', () => {
  assert.equal(describeSubmissionIssue(new SubmissionResponseError(422, 'Check quantity')).kind, 'validation');
  for (const status of [400, 401, 403, 404, 413]) {
    const issue = describeSubmissionIssue(new SubmissionResponseError(status, 'Server explanation'));
    assert.equal(issue.kind, 'rejected');
    assert.equal(issue.message, 'Server explanation');
    assert.match(issue.guidance, /entries remain/);
  }
});

test('stale statuses and version conflicts direct users to the latest record', () => {
  for (const [status, message] of [[409, 'Changed while saving'], [400, "Target request must possess an 'Approved_Awaiting_PO' status."]] as const) {
    const issue = describeSubmissionIssue(new SubmissionResponseError(status, message));
    assert.equal(issue.kind, 'conflict');
    assert.match(issue.guidance, /reopen the record/);
  }
});

test('lost responses and server faults never assert that nothing was saved', () => {
  for (const cause of [new TypeError('Failed to fetch'), new SyntaxError('Invalid response'), new SubmissionResponseError(500, 'Server unavailable'), null]) {
    const issue = describeSubmissionIssue(cause);
    assert.equal(issue.kind, 'uncertain');
    assert.match(issue.guidance, /server may have received/);
    assert.match(issue.guidance, /before trying again/);
  }
});

test('a confirmed save followed by display failure must not encourage resubmission', () => {
  const issue = describeSubmissionIssue(new Error('Refresh failed'), true);
  assert.equal(issue.kind, 'saved');
  assert.match(issue.message, /action was recorded/);
  assert.match(issue.guidance, /Do not submit/);
});

test('persistent notices are accessible, wrap long references, and escape server text', () => {
  assert.equal(renderToStaticMarkup(<SubmissionFeedback issue={null} />), '');
  const issue = { ...describeSubmissionIssue(new SubmissionResponseError(409, '<script>test</script>')), reference: 'long-reference-'.repeat(20) };
  const html = renderToStaticMarkup(<SubmissionFeedback issue={issue} />);
  assert.match(html, /role="alert"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /Submission reference/);
  assert.match(renderToStaticMarkup(<SubmissionFeedback issue={describeSubmissionIssue(null, true)} />), /role="status"/);
});
