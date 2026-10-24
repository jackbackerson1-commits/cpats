interface BusinessConfirmations {
  businessNecessityVerified?: boolean | null;
  businessBudgetAvailable?: boolean | null;
}

function confirmationLabel(value: boolean | null | undefined) {
  return value === true ? 'Confirmed' : value === false ? 'Not confirmed' : 'Not recorded';
}

export function BusinessVerificationDetails({ decision }: { decision: BusinessConfirmations }) {
  return <div className="mt-4 min-w-0 space-y-2">
    <p className="text-sm font-semibold text-slate-900">Saved fiscal confirmations</p>
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0 break-words [overflow-wrap:anywhere]">
        <dt className="text-xs leading-5 text-slate-600">Purchase necessity</dt>
        <dd className="mt-1 text-sm font-medium text-slate-900">{confirmationLabel(decision.businessNecessityVerified)}</dd>
      </div>
      <div className="min-w-0 break-words [overflow-wrap:anywhere]">
        <dt className="text-xs leading-5 text-slate-600">Budget availability</dt>
        <dd className="mt-1 text-sm font-medium text-slate-900">{confirmationLabel(decision.businessBudgetAvailable)}</dd>
      </div>
    </dl>
    <p className="text-xs leading-5 text-slate-600">These are the form confirmations saved with this decision. Unrecorded values do not mean a check failed.</p>
  </div>;
}
