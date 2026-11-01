'use client';
import { Toaster } from 'sonner';
import { useTranslations } from 'next-intl';
import { useDirection } from '@/i18n/useDirection';

// `dir` and the region's name follow the locale (issue #82): sonner lays out
// its icon/close slots by `dir`, and names its live region "Notifications"
// in English unless told otherwise.
export default function GlobalToaster() {
  const t = useTranslations('Common');
  const { dir } = useDirection();
  return (
    <Toaster
      position="top-center"
      dir={dir}
      containerAriaLabel={t('notifications')}
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
