import React from 'react';
import { Zap } from 'lucide-react';
import { BeamClashState } from '../game/IronManAbilities';

interface BeamClashBannerProps {
  clashState: BeamClashState;
}

export const BeamClashBanner: React.FC<BeamClashBannerProps> = ({ clashState }) => {
  if (!clashState.active) return null;

  const progressPct = Math.round(clashState.progress * 100);

  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(20px, env(safe-area-inset-top, 20px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        pointerEvents: 'none',
        userSelect: 'none',
        animation: 'pulse 1.5s infinite',
      }}
    >
      {/* Title Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'rgba(15, 17, 23, 0.88)',
          border: '1.5px solid #f59e0b',
          borderRadius: '20px',
          padding: '6px 16px',
          boxShadow: '0 0 20px rgba(245, 158, 11, 0.5), 0 4px 12px rgba(0,0,0,0.7)',
        }}
      >
        <Zap size={16} className="text-amber-400 animate-bounce" />
        <span
          style={{
            fontSize: '12px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: '#fef08a',
            textShadow: '0 0 10px rgba(245, 158, 11, 0.8)',
          }}
        >
          BEAM CLASH! TAP ATTACK TO PUSH!
        </span>
        <Zap size={16} className="text-amber-400 animate-bounce" />
      </div>

      {/* Tug-of-War Meter */}
      <div
        style={{
          width: '280px',
          height: '14px',
          backgroundColor: 'rgba(20, 24, 32, 0.9)',
          border: '1.5px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '8px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}
      >
        {/* Player Power (Left to Right, Red/Gold) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, #dc2626, #f59e0b)',
            transition: 'width 0.08s ease',
            boxShadow: '0 0 12px #f59e0b',
          }}
        />

        {/* Rival Plasma (Right to Left, Cyan) */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${100 - progressPct}%`,
            background: 'linear-gradient(270deg, #0284c7, #06b6d4)',
            transition: 'width 0.08s ease',
          }}
        />

        {/* Center Clash Sparks Indicator */}
        <div
          style={{
            position: 'absolute',
            left: `${progressPct}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            boxShadow: '0 0 14px #ffffff, 0 0 24px #f59e0b',
            zIndex: 3,
            transition: 'left 0.08s ease',
          }}
        />
      </div>

      {/* Labels */}
      <div
        style={{
          width: '280px',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textShadow: '0 1px 3px rgba(0,0,0,0.9)',
        }}
      >
        <span style={{ color: '#f87171' }}>PLAYER ({progressPct}%)</span>
        <span style={{ color: '#38bdf8' }}>TARGET ({100 - progressPct}%)</span>
      </div>
    </div>
  );
};
