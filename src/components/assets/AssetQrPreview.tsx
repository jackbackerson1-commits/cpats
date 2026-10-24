'use client';

import { useId, useState } from 'react';
import { ChevronDown, QrCode } from 'lucide-react';
import QRCodeSVG from '@/components/ui/QRCodeSVG';

export default function AssetQrPreview({ token, assetTag }: { token: string; assetTag: string }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return <div className="rounded-lg border border-slate-200 bg-slate-50">
    <button type="button" aria-expanded={open} aria-controls={contentId} aria-label={`${open ? 'Hide' : 'Show'} QR code for ${assetTag}`}
      onClick={() => setOpen((previous) => !previous)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
      <span className="flex min-w-0 items-center gap-2"><QrCode aria-hidden="true" className="size-4 shrink-0" /><span>{open ? 'Hide QR code' : 'Show QR code'}</span></span>
      <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${open ? 'rotate-180' : ''}`} />
    </button>
    <div id={contentId} hidden={!open} className="border-t border-slate-200 p-4">
      {open && <div className="flex justify-center"><QRCodeSVG value={token} size={170} /></div>}
    </div>
  </div>;
}
