import React, { useEffect, useState, useCallback } from 'react';
import { Smartphone, Maximize } from 'lucide-react';

export const OrientationGuard: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);

  const checkOrientation = useCallback(() => {
    const portrait = window.innerHeight > window.innerWidth;
    setIsPortrait(portrait);

    // Attempt orientation lock if in supported environment
    if (!portrait && screen.orientation && 'lock' in screen.orientation) {
      try {
        (screen.orientation.lock as (orientation: string) => Promise<void>)('landscape').catch(() => {});
      } catch {
        // Ignored
      }
    }
  }, []);

  useEffect(() => {
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [checkOrientation]);

  const requestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if ((document.documentElement as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen) {
        await (document.documentElement as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
      }
      if (screen.orientation && 'lock' in screen.orientation) {
        await (screen.orientation.lock as (orientation: string) => Promise<void>)('landscape').catch(() => {});
      }
    } catch {
      // Ignored
    }
    checkOrientation();
  };

  if (!isPortrait) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#111317',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#ffffff',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Animated Phone Rotation Icon */}
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          border: '1.5px solid rgba(255, 255, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px',
        }}
      >
        <Smartphone
          size={36}
          className="text-cyan-400 animate-pulse"
          style={{ transform: 'rotate(90deg)' }}
        />
      </div>

      <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', letterSpacing: '0.02em' }}>
        Rotate Device to Landscape
      </h2>
      <p style={{ fontSize: '13px', color: '#9ca3af', maxWidth: '280px', lineHeight: 1.5, marginBottom: '24px' }}>
        This 3D action game requires landscape mode for the virtual joystick, camera, and combat controls.
      </p>

      <button
        onClick={requestFullscreen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 18px',
          backgroundColor: '#0284c7',
          color: '#ffffff',
          border: 'none',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
        }}
      >
        <Maximize size={16} />
        <span>Enter Fullscreen</span>
      </button>
    </div>
  );
};
