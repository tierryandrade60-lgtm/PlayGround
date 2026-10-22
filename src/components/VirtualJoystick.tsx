import React, { useRef, useEffect, useState, useCallback } from 'react';

interface VirtualJoystickProps {
  onMove: (x: number, y: number, active: boolean) => void;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove }) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [thumbPos, setThumbPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);

  // Proportions & travel radius
  const BASE_SIZE = 136; // px
  const MAX_RADIUS = 48; // px

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) return;
    
    e.preventDefault();
    e.stopPropagation();

    const baseEl = baseRef.current;
    if (!baseEl) return;

    activePointerIdRef.current = e.pointerId;
    baseEl.setPointerCapture(e.pointerId);
    setIsActive(true);

    const rect = baseEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance > MAX_RADIUS) {
      dx = (dx / distance) * MAX_RADIUS;
      dy = (dy / distance) * MAX_RADIUS;
    }

    setThumbPos({ x: dx, y: dy });
    onMove(dx / MAX_RADIUS, dy / MAX_RADIUS, true);
  }, [onMove]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    const baseEl = baseRef.current;
    if (!baseEl) return;

    const rect = baseEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance > MAX_RADIUS) {
      dx = (dx / distance) * MAX_RADIUS;
      dy = (dy / distance) * MAX_RADIUS;
    }

    setThumbPos({ x: dx, y: dy });
    onMove(dx / MAX_RADIUS, dy / MAX_RADIUS, true);
  }, [onMove]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    const baseEl = baseRef.current;
    if (baseEl && baseEl.hasPointerCapture(e.pointerId)) {
      try {
        baseEl.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    }

    activePointerIdRef.current = null;
    setIsActive(false);
    setThumbPos({ x: 0, y: 0 });
    onMove(0, 0, false);
  }, [onMove]);

  // Keyboard mirroring on desktop
  useEffect(() => {
    const keysDown: { [key: string]: boolean } = {};

    const updateKeyboardJoystick = () => {
      if (activePointerIdRef.current !== null) return;

      let kx = 0;
      let ky = 0;
      if (keysDown['KeyW'] || keysDown['ArrowUp']) ky -= 1;
      if (keysDown['KeyS'] || keysDown['ArrowDown']) ky += 1;
      if (keysDown['KeyA'] || keysDown['ArrowLeft']) kx -= 1;
      if (keysDown['KeyD'] || keysDown['ArrowRight']) kx += 1;

      const len = Math.hypot(kx, ky);
      if (len > 0.05) {
        const nx = (kx / len) * (MAX_RADIUS * 0.95);
        const ny = (ky / len) * (MAX_RADIUS * 0.95);
        setThumbPos({ x: nx, y: ny });
        setIsActive(true);
      } else {
        setThumbPos({ x: 0, y: 0 });
        setIsActive(false);
      }
    };

    const onKd = (e: KeyboardEvent) => {
      keysDown[e.code] = true;
      updateKeyboardJoystick();
    };

    const onKu = (e: KeyboardEvent) => {
      keysDown[e.code] = false;
      updateKeyboardJoystick();
    };

    const onBlur = () => {
      for (const k in keysDown) delete keysDown[k];
      updateKeyboardJoystick();
    };

    window.addEventListener('keydown', onKd);
    window.addEventListener('keyup', onKu);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKd);
      window.removeEventListener('keyup', onKu);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={{
        position: 'fixed',
        bottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        left: 'max(24px, env(safe-area-inset-left, 24px))',
        width: `${BASE_SIZE}px`,
        height: `${BASE_SIZE}px`,
        borderRadius: '50%',
        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.12)',
        border: isActive ? '1.5px solid rgba(255, 255, 255, 0.45)' : '1.5px solid rgba(255, 255, 255, 0.28)',
        boxShadow: isActive ? '0 0 16px rgba(255, 255, 255, 0.12)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        zIndex: 50,
        cursor: 'pointer',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
      }}
    >
      {/* Movable Thumb Knob */}
      <div
        style={{
          width: '54px',
          height: '54px',
          borderRadius: '50%',
          background: isActive
            ? 'radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.95), rgba(210, 220, 235, 0.70))'
            : 'radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.82), rgba(200, 210, 225, 0.55))',
          border: isActive
            ? '1.5px solid rgba(255, 255, 255, 0.85)'
            : '1.5px solid rgba(255, 255, 255, 0.55)',
          boxShadow: isActive
            ? '0 4px 12px rgba(0, 0, 0, 0.25), 0 0 8px rgba(255, 255, 255, 0.3)'
            : '0 3px 8px rgba(0, 0, 0, 0.18)',
          transform: `translate(${thumbPos.x}px, ${thumbPos.y}px)`,
          pointerEvents: 'none',
          transition: isActive ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0.8, 0.3, 1)',
        }}
      />
    </div>
  );
};
