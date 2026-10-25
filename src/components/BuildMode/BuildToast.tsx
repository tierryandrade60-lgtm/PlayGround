import React from 'react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'info' | 'success' | 'warn';
}

interface BuildToastProps {
  toasts: ToastMessage[];
}

export const BuildToast: React.FC<BuildToastProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '240px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor:
              t.type === 'success'
                ? 'rgba(16, 185, 129, 0.92)'
                : t.type === 'warn'
                ? 'rgba(245, 158, 11, 0.92)'
                : 'rgba(30, 41, 59, 0.92)',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.02em',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
};
