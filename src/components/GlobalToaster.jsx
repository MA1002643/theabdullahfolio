'use client';
import { Toaster } from 'sonner';

export default function GlobalToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          background: 'rgba(27, 27, 27, 0.2)',
          backdropFilter: 'blur(6px)',
          color: 'rgb(255, 109, 5)',
          border: '1px solid rgba(155, 89, 182, 0.3)',
          boxShadow: 'inset 0 0 10px rgba(255, 255, 255, 0.05)',
          fontFamily: 'var(--font-varela-round)',
        },
        classNames: {
          success:
            '[&]:!border-[#00e676] [&]:!shadow-[0_0_12px_rgba(0,230,118,0.5),0_0_24px_rgba(0,230,118,0.2)]',
          error:
            '[&]:!border-[#ff1744] [&]:!shadow-[0_0_12px_rgba(255,23,68,0.5),0_0_24px_rgba(255,23,68,0.2)]',
        },
      }}
    />
  );
}
