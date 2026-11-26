'use client';

import { toast } from 'sonner';
import { describeSubmissionIssue, SubmissionResponseError } from '@/shared/submission-feedback';

type FeedbackTone = 'success' | 'warning' | 'error' | 'info';
type Decision = 'APPROVE' | 'RETURN_FOR_CORRECTION' | 'DECLINE';

// Call from the confirmed response branch, never from a selected radio/button.
export function actionFeedback(title: string, description: string, tone: FeedbackTone = 'success') {
  return toast[tone](title, { description });
}

export function decisionFeedback(action: Decision, reference: string, office: 'Business' | 'Admin', revised = false) {
  const record = `Request ${reference}`;
  if (action === 'DECLINE') {
    return actionFeedback('Decline recorded', `${record} was declined. The original request is final.`, 'error');
  }
  if (action === 'RETURN_FOR_CORRECTION') {
    return actionFeedback('Returned for correction', `${record} was returned with your feedback.`, 'warning');
  }
  return actionFeedback(
    revised ? 'Revised evaluation recorded' : 'Approval recorded',
    `${record} ${office === 'Business' ? 'was sent to Admin Office review.' : 'is approved for Purchase Order preparation.'}`,
  );
}

export function submissionFeedbackError(cause: unknown, title = 'Submission could not be confirmed') {
  // Other callers include read-only refreshes and account actions, not procurement submissions.
  if (!(cause instanceof SubmissionResponseError)) return actionFeedback(title,
    cause instanceof Error ? cause.message : 'Check the current record before trying again.', 'error');
  const issue = describeSubmissionIssue(cause);
  return actionFeedback(cause instanceof SubmissionResponseError && title === 'Submission could not be confirmed' ? issue.title : title,
    `${issue.message} ${issue.guidance}`, issue.kind === 'conflict' ? 'warning' : 'error');
}
