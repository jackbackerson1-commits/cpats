export type SubmissionIssue = {
  reference?: string;
  kind: 'validation' | 'conflict' | 'rejected' | 'uncertain' | 'saved';
  title: string;
  message: string;
  guidance: string;
};

export class SubmissionResponseError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'SubmissionResponseError';
  }
}

export function describeSubmissionIssue(cause: unknown, committed = false): SubmissionIssue {
  if (committed) return {
    kind: 'saved', title: 'Saved; workspace needs updating',
    message: 'Your action was recorded, but the latest workspace could not be displayed.',
    guidance: 'Refresh or open the existing tracking/history view. Do not submit the same action again.',
  };
  const message = cause instanceof Error ? cause.message : 'The submission response could not be read.';
  if (cause instanceof SubmissionResponseError) {
    if (cause.status === 422) return { kind: 'validation', title: 'Check the highlighted fields', message, guidance: 'Your entries remain in this form. Correct the indicated fields before submitting again.' };
    if (cause.status === 409 || /INVALID OPERATION STATE|currently in .* status|INVALID_LIFECYCLE_STAGE|must possess an .* status|no longer available/i.test(message)) {
      return { kind: 'conflict', title: 'Review the latest record', message, guidance: 'Keep any notes you need, then refresh the workspace and reopen the record. Check its current status before trying again.' };
    }
    if (cause.status >= 400 && cause.status < 500) return { kind: 'rejected', title: 'Submission was not accepted', message, guidance: 'Your entries remain in this form. Resolve the reported issue before trying again.' };
  }
  return { kind: 'uncertain', title: 'Submission result is unconfirmed', message, guidance: 'Your entries remain in this form. Check tracking or history for a saved result before trying again; the server may have received your action.' };
}
