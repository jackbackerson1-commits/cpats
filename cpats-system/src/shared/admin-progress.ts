import { PRStatus, Role } from '@prisma/client';

export interface ProgressEvent {
  previousState: PRStatus | null;
  newState: PRStatus;
  actor: { role: Role };
}

// Completion requires a recorded event, never an inferred earlier stage.
export function adminProgress(status: PRStatus, logs: readonly ProgressEvent[]) {
  const entered = (role: Role, state: PRStatus) => logs.some(log => log.actor.role === role && log.newState === state && log.previousState !== state);
  const complete = [
    entered(Role.Requesting_Office, PRStatus.Pending_Business_Approval),
    entered(Role.Business_Office, PRStatus.Pending_Admin_Approval),
    entered(Role.Admin_Office, PRStatus.Approved_Awaiting_PO),
    entered(Role.Purchasing_Office, PRStatus.Awaiting_Check_Issuance),
    entered(Role.Receiving_Custodian, PRStatus.Received_and_Closed),
    entered(Role.Receiving_Custodian, PRStatus.Received_and_Closed),
  ];
  const stages: Partial<Record<PRStatus, number>> = {
    Draft: 0, Pending_Business_Approval: 1, Pending_Admin_Approval: 2,
    Approved_Awaiting_PO: 3, Awaiting_Check_Issuance: 3, Ready_for_Purchase: 4, Received_and_Closed: 5,
  };
  const current = stages[status];
  return ['Submitted', 'Business Office review', 'Admin approval', 'PO', 'Cargo received', 'Closed'].map((label, index) => ({
    label, current: current === index,
    state: complete[index] ? 'complete' as const : current === index ? 'current' as const : 'upcoming' as const,
  }));
}
