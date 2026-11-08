'use client';
import { QRCodeSVG as EncodedQRCodeSVG } from 'qrcode.react';
export default function QRCodeSVG({ value, size = 128, bgColor = '#FFFFFF', fgColor = '#0F172A', className = '' }: {
  value: string; size?: number; bgColor?: string; fgColor?: string; className?: string;
}) {
  return <EncodedQRCodeSVG value={value} size={size} bgColor={bgColor} fgColor={fgColor}
    level="M" marginSize={4} title="CPATS QR reference" className={`shrink-0 ${className}`} />;
}
