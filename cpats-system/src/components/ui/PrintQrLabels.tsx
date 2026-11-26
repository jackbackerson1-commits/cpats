'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCodeSVG from './QRCodeSVG';
import './qr-labels.css';

export interface QrLabel { reference: string; token: string; title: string; detail: string }

export default function PrintQrLabels({ labels, children = 'Print selected labels' }: { labels: QrLabel[]; children?: React.ReactNode }) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const finish = () => setPrinting(false);
    window.addEventListener('afterprint', finish);
    window.print();
    return () => window.removeEventListener('afterprint', finish);
  }, [printing]);
  return <>
    <button type="button" disabled={!labels.length} onClick={() => setPrinting(true)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-emerald-700">{children}</button>
    {printing && createPortal(<div className="cpats-print-sheet"><div className="cpats-label-grid">{labels.map((label) => <section key={label.reference} className="cpats-label">
      <p>DMC CPATS · {label.title}</p><QRCodeSVG value={label.token} size={170} />
      <strong>{label.reference}</strong><p>{label.detail}</p>
    </section>)}</div></div>, document.body)}
  </>;
}
