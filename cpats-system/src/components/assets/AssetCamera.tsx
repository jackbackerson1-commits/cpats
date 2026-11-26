'use client';

import { useEffect, useRef, useState } from 'react';

type Detector = { detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> };

export default function AssetCamera({ onScan }: { onScan: (token: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<number | null>(null);
  const generation = useRef(0);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  function stop() {
    generation.current++;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setActive(false);
  }
  useEffect(() => () => {
    generation.current++;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);
  async function start() {
    stop(); setError('');
    const attempt = generation.current;
    try {
      const Constructor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!Constructor) throw new Error('Camera QR reading is unavailable in this browser. Enter the asset ID or use a connected scanner.');
      const detector = new Constructor({ formats: ['qr_code'] });
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      if (attempt !== generation.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      if (!video.current) { stop(); return; }
      video.current.srcObject = media; await video.current.play();
      if (attempt !== generation.current) return;
      setActive(true);
      const scan = async () => {
        if (attempt !== generation.current) return;
        if (video.current && video.current.readyState >= 2) {
          try {
            const codes = await detector.detect(video.current);
            if (attempt !== generation.current) return;
            if (codes[0]?.rawValue) { stop(); onScan(codes[0].rawValue); return; }
          } catch { /* Continue with the next camera frame. */ }
        }
        frame.current = requestAnimationFrame(scan);
      };
      frame.current = requestAnimationFrame(scan);
    } catch (cause) {
      if (attempt !== generation.current) return;
      stop();
      setError(cause instanceof Error && cause.message.startsWith('Camera QR') ? cause.message : 'Camera access is unavailable. Enter the asset ID or use a connected scanner.');
    }
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2"><button type="button" onClick={start} disabled={active} className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium disabled:opacity-50">Scan asset QR with camera</button>{active && <button type="button" onClick={stop} className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm">Stop camera</button>}</div>
    <video ref={video} playsInline muted aria-label="Asset QR camera preview" className={`${active ? 'block' : 'hidden'} aspect-video w-full max-w-md rounded-lg bg-slate-950 object-cover`} />
    {error && <p role="alert" className="text-sm leading-6 text-rose-800">{error}</p>}
  </div>;
}
