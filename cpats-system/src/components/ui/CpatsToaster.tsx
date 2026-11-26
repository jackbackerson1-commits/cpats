'use client';

import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import { Toaster } from 'sonner';
import './cpats-toast.css';

export default function CpatsToaster() {
  return (
    <Toaster
      style={{ fontFamily: 'var(--font-sans)' }}
      theme="light"
      position="top-right"
      duration={7000}
      closeButton
      visibleToasts={3}
      offset={{ top: 88, right: 32 }}
      mobileOffset={{ top: 16, left: 16, right: 16 }}
      containerAriaLabel="Action feedback"
      icons={{
        success: <CircleCheck className="size-5" aria-hidden="true" />,
        warning: <TriangleAlert className="size-5" aria-hidden="true" />,
        error: <CircleX className="size-5" aria-hidden="true" />,
        info: <Info className="size-5" aria-hidden="true" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: 'Dismiss action feedback',
        classNames: {
          toast: 'cpats-toast',
          title: 'cpats-toast-title',
          description: 'cpats-toast-description',
          closeButton: 'cpats-toast-close',
          content: 'cpats-toast-content',
          success: 'cpats-toast-success',
          warning: 'cpats-toast-warning',
          error: 'cpats-toast-error',
          info: 'cpats-toast-info',
        },
      }}
    />
  );
}
