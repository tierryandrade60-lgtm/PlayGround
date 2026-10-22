import React, { useEffect, useState } from 'react';
import { GameScene, TargetBracketInfo, ProjectedDamageNumber } from '../game/GameScene';
import { ReticleStyle } from '../game/SettingsManager';

interface AimReticleProps {
  gameScene: GameScene | null;
  reticleStyle?: ReticleStyle;
  aimAssistEnabled: boolean;
}

export const AimReticle: React.FC<AimReticleProps> = ({
  gameScene,
  reticleStyle = 'dot',
  aimAssistEnabled,
}) => {
  const [bracket, setBracket] = useState<TargetBracketInfo>({ visible: false, x: 0, y: 0, size: 0 });
  const [smoothBracket, setSmoothBracket] = useState({ x: 0, y: 0, size: 0, visible: false });
  const [damageNumbers, setDamageNumbers] = useState<ProjectedDamageNumber[]>([]);
  const [hitConfirmProgress, setHitConfirmProgress] = useState<number>(-1); // -1 = inactive, 0..1 = active

  useEffect(() => {
    let animId = 0;

    const tick = () => {
      if (gameScene) {
        // Update target bracket
        const targetBracket = gameScene.getActiveTargetBracket();
        setBracket(targetBracket);

        // Smoothly interpolate bracket tracking
        if (targetBracket.visible) {
          setSmoothBracket((prev) => {
            const lerpSpeed = prev.visible ? 0.35 : 1.0;
            return {
              visible: true,
              x: prev.visible ? prev.x + (targetBracket.x - prev.x) * lerpSpeed : targetBracket.x,
              y: prev.visible ? prev.y + (targetBracket.y - prev.y) * lerpSpeed : targetBracket.y,
              size: prev.visible ? prev.size + (targetBracket.size - prev.size) * lerpSpeed : targetBracket.size,
            };
          });
        } else {
          setSmoothBracket((prev) => ({ ...prev, visible: false }));
        }

        // Update damage numbers
        setDamageNumbers(gameScene.getProjectedDamageNumbers());

        // Update Marvel Rivals-style hit confirmation effect
        const now = performance.now();
        const elapsed = now - gameScene.lastHitConfirmTime;
        const duration = 180; // 180ms total animation

        if (elapsed < duration) {
          setHitConfirmProgress(elapsed / duration);
        } else {
          setHitConfirmProgress(-1);
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [gameScene]);

  // Hit-confirmation animation calculation
  const isHitActive = hitConfirmProgress >= 0 && hitConfirmProgress <= 1;
  const hitOpacity = isHitActive
    ? hitConfirmProgress < 0.2
      ? 1.0
      : Math.max(0, 1.0 - (hitConfirmProgress - 0.2) / 0.8)
    : 0;
  // Slight outward expansion: from 11px to 16px distance
  const hitDistance = isHitActive ? 11 + hitConfirmProgress * 5 : 11;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 40,
        overflow: 'hidden',
      }}
    >
      {/* Centered Main Reticle & Marvel Rivals Hit Confirmation */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 42,
        }}
      >
        {/* Style 1: Small Clean White Dot */}
        {reticleStyle === 'dot' && (
          <div
            style={{
              width: '4.5px',
              height: '4.5px',
              backgroundColor: '#ffffff',
              borderRadius: '50%',
              boxShadow: '0 0 2px rgba(0, 0, 0, 0.9), 0 0 1px #ffffff',
            }}
          />
        )}

        {/* Style 2: Four Thin Separated White Lines with Small Central Gap */}
        {reticleStyle === 'crosshair' && (
          <div style={{ position: 'relative', width: '24px', height: '24px' }}>
            {/* Top Line */}
            <div
              style={{
                position: 'absolute',
                top: '2px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '1.5px',
                height: '6px',
                backgroundColor: '#ffffff',
                boxShadow: '0 0 2px rgba(0,0,0,0.85)',
              }}
            />
            {/* Bottom Line */}
            <div
              style={{
                position: 'absolute',
                bottom: '2px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '1.5px',
                height: '6px',
                backgroundColor: '#ffffff',
                boxShadow: '0 0 2px rgba(0,0,0,0.85)',
              }}
            />
            {/* Left Line */}
            <div
              style={{
                position: 'absolute',
                left: '2px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '6px',
                height: '1.5px',
                backgroundColor: '#ffffff',
                boxShadow: '0 0 2px rgba(0,0,0,0.85)',
              }}
            />
            {/* Right Line */}
            <div
              style={{
                position: 'absolute',
                right: '2px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '6px',
                height: '1.5px',
                backgroundColor: '#ffffff',
                boxShadow: '0 0 2px rgba(0,0,0,0.85)',
              }}
            />
          </div>
        )}

        {/* Marvel Rivals Hit-Confirmation Effect: Four Symmetrical White Diagonal Marks */}
        {isHitActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: hitOpacity,
              transition: 'opacity 0.05s linear',
              pointerEvents: 'none',
            }}
          >
            {/* Top-Right Diagonal Mark (45°) */}
            <div
              style={{
                position: 'absolute',
                width: '1.75px',
                height: '7.5px',
                backgroundColor: '#ffffff',
                borderRadius: '1px',
                boxShadow: '0 0 3px rgba(0, 0, 0, 0.9), 0 0 2px #ffffff',
                transform: `translate(${hitDistance * 0.707}px, -${hitDistance * 0.707}px) rotate(45deg)`,
              }}
            />
            {/* Bottom-Right Diagonal Mark (135°) */}
            <div
              style={{
                position: 'absolute',
                width: '1.75px',
                height: '7.5px',
                backgroundColor: '#ffffff',
                borderRadius: '1px',
                boxShadow: '0 0 3px rgba(0, 0, 0, 0.9), 0 0 2px #ffffff',
                transform: `translate(${hitDistance * 0.707}px, ${hitDistance * 0.707}px) rotate(135deg)`,
              }}
            />
            {/* Bottom-Left Diagonal Mark (225°) */}
            <div
              style={{
                position: 'absolute',
                width: '1.75px',
                height: '7.5px',
                backgroundColor: '#ffffff',
                borderRadius: '1px',
                boxShadow: '0 0 3px rgba(0, 0, 0, 0.9), 0 0 2px #ffffff',
                transform: `translate(-${hitDistance * 0.707}px, ${hitDistance * 0.707}px) rotate(225deg)`,
              }}
            />
            {/* Top-Left Diagonal Mark (315°) */}
            <div
              style={{
                position: 'absolute',
                width: '1.75px',
                height: '7.5px',
                backgroundColor: '#ffffff',
                borderRadius: '1px',
                boxShadow: '0 0 3px rgba(0, 0, 0, 0.9), 0 0 2px #ffffff',
                transform: `translate(-${hitDistance * 0.707}px, -${hitDistance * 0.707}px) rotate(315deg)`,
              }}
            />
          </div>
        )}
      </div>

      {/* Four Elegant White Corner Brackets for Aim Assist Target */}
      {aimAssistEnabled && smoothBracket.visible && (
        <div
          style={{
            position: 'absolute',
            left: `${smoothBracket.x}px`,
            top: `${smoothBracket.y}px`,
            width: `${smoothBracket.size}px`,
            height: `${smoothBracket.size}px`,
            transform: 'translate(-50%, -50%)',
            transition: 'opacity 0.15s ease',
            pointerEvents: 'none',
            zIndex: 41,
          }}
        >
          {/* Top-Left Corner */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '12px',
              height: '12px',
              borderTop: '2px solid rgba(255, 255, 255, 0.95)',
              borderLeft: '2px solid rgba(255, 255, 255, 0.95)',
              filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))',
            }}
          />
          {/* Top-Right Corner */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '12px',
              height: '12px',
              borderTop: '2px solid rgba(255, 255, 255, 0.95)',
              borderRight: '2px solid rgba(255, 255, 255, 0.95)',
              filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))',
            }}
          />
          {/* Bottom-Left Corner */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '12px',
              height: '12px',
              borderBottom: '2px solid rgba(255, 255, 255, 0.95)',
              borderLeft: '2px solid rgba(255, 255, 255, 0.95)',
              filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))',
            }}
          />
          {/* Bottom-Right Corner */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: '12px',
              height: '12px',
              borderBottom: '2px solid rgba(255, 255, 255, 0.95)',
              borderRight: '2px solid rgba(255, 255, 255, 0.95)',
              filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))',
            }}
          />
        </div>
      )}

      {/* Floating Damage Numbers */}
      {damageNumbers.map((dn) => (
        <div
          key={dn.id}
          style={{
            position: 'absolute',
            left: `${dn.x}px`,
            top: `${dn.y}px`,
            transform: `translate(-50%, -50%) scale(${dn.scale})`,
            opacity: dn.opacity,
            fontSize: '18px',
            fontWeight: 900,
            color: '#ffd166',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 8px rgba(255, 209, 102, 0.5)',
            pointerEvents: 'none',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {dn.value}
        </div>
      ))}
    </div>
  );
};
