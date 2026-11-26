export function isWorkflowConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error.code === 'P2025' || error.code === 'P2034');
}

export const WORKFLOW_CONFLICT_MESSAGE = 'This record changed while you were saving. Your action was not recorded. Refresh the workspace and reopen the latest record before trying again.';
