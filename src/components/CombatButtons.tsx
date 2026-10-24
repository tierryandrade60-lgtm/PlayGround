import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Flame, Shield, Zap, Sparkles, Sword, Rocket, Crosshair, Orbit, Wind, Plane } from 'lucide-react';
import { audioSystem } from '../game/AudioSystem';
import { CooldownSystem } from '../game/systems/CooldownSystem';
import { getCombatButtonProfile } from '../game/systems/AbilityButtonSystem';

export interface CombatButtonsProps {
  onAttack: () => boolean;
  onAbility?: (id: number) => boolean;
  onCancelAbility?: (id: number) => boolean;
  onDash?: () => boolean;
  onToggleFlight?: () => boolean;
  isFlying?: boolean;
  powerSet?: 'ironman' | 'agatha' | 'vision';
  gameScene?: any;
}

interface AbilityState {
  id: number;
  name: string;
  icon: React.ReactNode;
  cooldownTotal: number;
  cooldownRemaining: number;
  isToggle: boolean;
  cancelDelay: number;
  active: boolean;
  lockRemaining: number;
}

const getAbilityIcon = (powerSet: 'ironman' | 'agatha' | 'vision', id: number): React.ReactNode => {
  if (powerSet === 'agatha') {
    if (id === 1) return <Zap size={19} className="text-purple-300" />;
    if (id === 2) return <Orbit size={19} className="text-violet-300" />;
    if (id === 3) return <Shield size={19} className="text-fuchsia-300" />;
    return <Crosshair size={19} className="text-pink-400" />;
  }
  if (powerSet === 'ironman') {
    if (id === 1) return <Rocket size={19} className="text-amber-400" />;
    if (id === 2) return <Flame size={19} className="text-red-400" />;
    if (id === 3) return <Crosshair size={19} className="text-yellow-400" />;
    return <Orbit size={19} className="text-cyan-400" />;
  }
  if (powerSet === 'vision') {
    if (id === 1) return <Sparkles size={19} className="text-yellow-200" />;
    if (id === 2) return <Wind size={19} className="text-amber-200" />;
    if (id === 3) return <Plane size={19} className="text-yellow-300" />;
    return <Crosshair size={19} className="text-amber-300" />;
  }
  if (id === 1) return <Flame size={19} className="text-amber-400" />;
  if (id === 2) return <Shield size={19} className="text-cyan-400" />;
  if (id === 3) return <Zap size={19} className="text-yellow-300" />;
  return <Sparkles size={19} className="text-purple-400" />;
};

const getInitialAbilities = (powerSet: 'ironman' | 'agatha' | 'vision'): AbilityState[] =>
  getCombatButtonProfile(powerSet).abilities.map((ability) => ({
    id: ability.id,
    name: ability.name,
    icon: getAbilityIcon(powerSet, ability.id),
    cooldownTotal: ability.cooldown,
    cooldownRemaining: 0,
    isToggle: ability.toggle ?? false,
    cancelDelay: ability.cancelDelay ?? 0.5,
    active: false,
    lockRemaining: 0,
  }));

export const CombatButtons: React.FC<CombatButtonsProps> = ({
  onAttack,
  onAbility,
  onCancelAbility,
  onDash,
  onToggleFlight,
  isFlying = false,
  powerSet = 'ironman',
  gameScene,
}) => {
  const cooldownSystem = useRef(new CooldownSystem()).current;
  const [attackCooldown, setAttackCooldown] = useState(0);
  const [dashCooldown, setDashCooldown] = useState(0);
  const [isAttackPressed, setIsAttackPressed] = useState(false);
  const [abilities, setAbilities] = useState<AbilityState[]>(() => getInitialAbilities(powerSet));

  // Sync abilities and reset shared cooldowns when powerSet changes
  useEffect(() => {
    cooldownSystem.reset();
    setAbilities(getInitialAbilities(powerSet));
    setAttackCooldown(0);
    setDashCooldown(0);
  }, [powerSet, cooldownSystem]);

  // Tick cooldowns
  useEffect(() => {
    let last = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      cooldownSystem.update(dt);
      setAttackCooldown(cooldownSystem.getRemaining('attack'));
      setDashCooldown(cooldownSystem.getRemaining('dash'));
      setAbilities((prev) =>
        prev.map((ab) => {
          let isToggle = ab.isToggle;
          let cancelDelay = ab.cancelDelay;
          if (gameScene) {
            if (typeof gameScene.isAbilityToggle === 'function') {
              isToggle = gameScene.isAbilityToggle(ab.id);
            }
            if (typeof gameScene.getAbilityCancelDelay === 'function') {
              cancelDelay = gameScene.getAbilityCancelDelay(ab.id);
            }
          }
          const lockRemaining = Math.max(0, ab.lockRemaining - dt);
          let active = ab.active;
          let cooldownRemaining = cooldownSystem.getRemaining(`ability-${ab.id}`);
          // Detect natural end of toggle ability
          if (active && gameScene && typeof gameScene.isAbilityActive === 'function') {
            if (!gameScene.isAbilityActive(ab.id)) {
              active = false;
              if (cooldownRemaining <= 0) {
                cooldownSystem.start(`ability-${ab.id}`, ab.cooldownTotal);
                cooldownRemaining = ab.cooldownTotal;
              }
            }
          }
          return {
            ...ab,
            isToggle,
            cancelDelay,
            lockRemaining,
            active,
            cooldownRemaining,
          };
        })
      );
    }, 30);

    return () => clearInterval(interval);
  }, [cooldownSystem, gameScene]);

  const handleAttackPress = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!cooldownSystem.isReady('attack')) return;

    setIsAttackPressed(true);
    const launched = onAttack();
    if (launched) {
      const attackSeconds = getCombatButtonProfile(powerSet).attackCooldown;
      cooldownSystem.start('attack', attackSeconds);
      setAttackCooldown(attackSeconds);
    }
  }, [cooldownSystem, onAttack, powerSet]);

  const handleAttackRelease = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAttackPressed(false);
  }, []);

  const handleAbilityPress = useCallback((id: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const ab = abilities.find((a) => a.id === id);
    if (!ab) return;

    // Toggle ability already active -> cancel (only after lock expires)
    if (ab.isToggle && ab.active) {
      if (ab.lockRemaining > 0) return; // locked (dark) for 0.5s
      audioSystem.playUiClick();
      const cancelled = onCancelAbility ? onCancelAbility(id) : (onAbility ? onAbility(id) : false);
      if (cancelled) {
        setAbilities((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, active: false, lockRemaining: 0, cooldownRemaining: a.cooldownTotal }
              : a
          )
        );
        cooldownSystem.start(`ability-${id}`, ab.cooldownTotal);
      }
      return;
    }

    if (!cooldownSystem.isReady(`ability-${id}`)) return;

    audioSystem.playUiClick();
    const launched = onAbility ? onAbility(id) : true;
    if (launched) {
      if (ab.isToggle) {
        // Activate toggle: lock button dark for cancelDelay, no cooldown
        cooldownSystem.clear(`ability-${id}`);
        setAbilities((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  active: true,
                  lockRemaining: a.cancelDelay ?? 0.5,
                  cooldownRemaining: 0,
                }
              : a
          )
        );
      } else {
        cooldownSystem.start(`ability-${id}`, ab.cooldownTotal);
        setAbilities((prev) =>
          prev.map((a) => (a.id === id ? { ...a, cooldownRemaining: a.cooldownTotal } : a))
        );
      }
    }
  }, [abilities, cooldownSystem, onAbility, onCancelAbility]);

  const handleDashPress = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!cooldownSystem.isReady('dash')) return;
    const launched = onDash ? onDash() : false;
    if (launched) {
      const dashSeconds = getCombatButtonProfile(powerSet).dashCooldown;
      cooldownSystem.start('dash', dashSeconds);
      setDashCooldown(dashSeconds);
    }
  }, [cooldownSystem, onDash, powerSet]);

  const handleFlightPress = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleFlight) {
      onToggleFlight();
    }
  }, [onToggleFlight]);

  // Arc parameters strictly in upper-left quadrant (↖️ ⬅️ ⬆️) from Attack button
  const ATTACK_CX = 206;
  const ATTACK_CY = 166;
  const ORBIT_RADIUS = 76;
  const angles = abilities.length >= 4 ? [-6, 28, 62, 96] : abilities.length === 3 ? [-6, 28, 62] : [-6, 28];

  const maxAttackCd = getCombatButtonProfile(powerSet).attackCooldown;
  const dashCooldownTotal = getCombatButtonProfile(powerSet).dashCooldown;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        right: 'max(16px, env(safe-area-inset-right, 16px))',
        width: '260px',
        height: '220px',
        pointerEvents: 'none',
        zIndex: 50,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* Flight Mode Toggle Button (Iron Man & Agatha Harkness) */}
      {(powerSet === 'ironman' || powerSet === 'agatha') && (
        <div
          onPointerDown={handleFlightPress}
          style={{
            position: 'absolute',
            left: '60px',
            top: '86px',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: isFlying
              ? powerSet === 'agatha'
                ? 'radial-gradient(circle at 35% 35%, #7e22ce, #3b0764)'
                : 'radial-gradient(circle at 35% 35%, #0284c7, #075985)'
              : 'radial-gradient(circle at 35% 35%, #232c3d, #111722)',
            border: isFlying
              ? powerSet === 'agatha'
                ? '2px solid #c084fc'
                : '2px solid #38bdf8'
              : '1.5px solid rgba(255, 255, 255, 0.22)',
            boxShadow: isFlying
              ? powerSet === 'agatha'
                ? '0 0 16px rgba(168, 85, 247, 0.75), 0 3px 8px rgba(0,0,0,0.45)'
                : '0 0 16px rgba(56, 189, 248, 0.75), 0 3px 8px rgba(0,0,0,0.45)'
              : '0 3px 8px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          className="active:scale-90"
          title={isFlying ? (powerSet === 'agatha' ? 'Descer (Pousar)' : 'Land') : (powerSet === 'agatha' ? 'Voo Arcano (Levitar)' : 'Flight')}
        >
          <Plane size={19} className={isFlying ? (powerSet === 'agatha' ? 'text-fuchsia-200 drop-shadow' : 'text-sky-200 drop-shadow') : 'text-slate-300'} />
          <span style={{ fontSize: '7.5px', fontWeight: 800, color: isFlying ? (powerSet === 'agatha' ? '#f3e8ff' : '#bae6fd') : '#94a3b8', letterSpacing: '0.04em' }}>
            {isFlying ? (powerSet === 'agatha' ? 'LEVITANDO' : 'FLYING') : (powerSet === 'agatha' ? 'VOO ARC.' : 'FLIGHT')}
          </span>
        </div>
      )}

      {/* Thruster Dash / Passo das Sombras Button */}
      <div
        onPointerDown={handleDashPress}
        style={{
          position: 'absolute',
          left: '60px',
          top: '144px',
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: dashCooldown > 0
            ? 'radial-gradient(circle at 35% 35%, #23272e, #12151a)'
            : powerSet === 'agatha'
            ? 'radial-gradient(circle at 35% 35%, #6b21a8, #2e1065)'
            : 'radial-gradient(circle at 35% 35%, #d97706, #78350f)',
          border: dashCooldown > 0
            ? '1.5px solid rgba(255, 255, 255, 0.18)'
            : powerSet === 'agatha'
            ? '2px solid rgba(192, 132, 252, 0.9)'
            : '2px solid rgba(251, 191, 36, 0.85)',
          boxShadow: dashCooldown > 0
            ? '0 2px 6px rgba(0,0,0,0.4)'
            : powerSet === 'agatha'
            ? '0 3px 12px rgba(168, 85, 247, 0.5), 0 0 10px rgba(192, 132, 252, 0.4)'
            : '0 3px 12px rgba(245, 158, 11, 0.45), 0 0 8px rgba(251, 191, 36, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          cursor: dashCooldown > 0 ? 'not-allowed' : 'pointer',
          overflow: 'hidden',
          transition: 'all 0.12s ease',
        }}
        className="active:scale-90"
        title={powerSet === 'agatha' ? 'Passo das Sombras (Teleporte)' : powerSet === 'vision' ? 'Phasing Dash (Atravessa Estruturas)' : 'Thruster Dash / Evade'}
      >
        {/* Radial Cooldown */}
        {dashCooldown > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: `conic-gradient(rgba(0, 0, 0, 0.65) ${(dashCooldown / Math.max(0.1, dashCooldownTotal)) * 100}%, transparent ${(dashCooldown / Math.max(0.1, dashCooldownTotal)) * 100}%)`,
              pointerEvents: 'none',
            }}
          />
        )}
        <Wind size={19} className={dashCooldown > 0 ? 'text-slate-500' : powerSet === 'agatha' ? 'text-purple-200' : 'text-amber-200'} />
        <span
          style={{
            fontSize: '7.5px',
            fontWeight: 800,
            color: dashCooldown > 0 ? '#94a3b8' : powerSet === 'agatha' ? '#f3e8ff' : '#fef3c7',
            letterSpacing: '0.04em',
            zIndex: 2,
          }}
        >
          {dashCooldown > 0 ? dashCooldown.toFixed(1) : powerSet === 'agatha' ? 'PASSO' : powerSet === 'vision' ? 'FASE' : 'DASH'}
        </span>
      </div>

      {/* Four Ability Buttons in Upper-Left Quadrant Arc (↖️ ⬅️ ⬆️) */}
      {abilities.map((ab, idx) => {
        const rad = (angles[idx] * Math.PI) / 180;
        const x = ATTACK_CX - ORBIT_RADIUS * Math.cos(rad);
        const y = ATTACK_CY - ORBIT_RADIUS * Math.sin(rad);
        const onCd = ab.cooldownRemaining > 0;
        const isActive = ab.active;
        const isLocked = isActive && ab.lockRemaining > 0;
        // Dark while on cooldown OR while toggle ability is still active
        const isDark = onCd || (ab.isToggle && isActive);
        const cdPct = onCd ? (ab.cooldownRemaining / ab.cooldownTotal) * 100 : 0;

        return (
          <div
            key={ab.id}
            onPointerDown={(e) => handleAbilityPress(ab.id, e)}
            style={{
              position: 'absolute',
              left: `${x - 19}px`,
              top: `${y - 19}px`,
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: isDark
                ? 'radial-gradient(circle at 35% 35%, #2a2d33, #16181b)'
                : powerSet === 'agatha'
                ? 'radial-gradient(circle at 35% 35%, #4c1d95, #1e0933)'
                : powerSet === 'ironman'
                ? 'radial-gradient(circle at 35% 35%, #3d2a1d, #1a1412)'
                : powerSet === 'vision'
                ? 'radial-gradient(circle at 35% 35%, #4a3d12, #201b09)'
                : 'radial-gradient(circle at 35% 35%, #343a46, #1b1e24)',
              border: isDark
                ? '1.5px solid rgba(255, 255, 255, 0.15)'
                : powerSet === 'agatha'
                ? '1.5px solid rgba(192, 132, 252, 0.75)'
                : powerSet === 'ironman'
                ? '1.5px solid rgba(245, 158, 11, 0.55)'
                : powerSet === 'vision'
                ? '1.5px solid rgba(253, 224, 71, 0.75)'
                : '1.5px solid rgba(255, 255, 255, 0.45)',
              boxShadow: isDark
                ? '0 2px 6px rgba(0, 0, 0, 0.4)'
                : powerSet === 'agatha'
                ? '0 3px 10px rgba(0, 0, 0, 0.35), 0 0 10px rgba(168, 85, 247, 0.4)'
                : powerSet === 'ironman'
                ? '0 3px 10px rgba(0, 0, 0, 0.35), 0 0 8px rgba(245, 158, 11, 0.25)'
                : powerSet === 'vision'
                ? '0 3px 10px rgba(0, 0, 0, 0.35), 0 0 10px rgba(253, 224, 71, 0.35)'
                : '0 3px 10px rgba(0, 0, 0, 0.35), 0 0 8px rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
              cursor: isDark ? 'not-allowed' : 'pointer',
              overflow: 'hidden',
              transition: 'transform 0.1s ease, filter 0.15s ease',
            }}
            className="active:scale-90"
            title={ab.name}
          >
            {/* Radial Cooldown Overlay */}
            {onCd && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: `conic-gradient(rgba(0, 0, 0, 0.75) ${cdPct}%, transparent ${cdPct}%)`,
                  pointerEvents: 'none',
                }}
              />
            )}

            <div style={{ position: 'relative', zIndex: 2, opacity: isDark ? 0.4 : 1 }}>
              {ab.icon}
            </div>

            {/* Cooldown Text */}
            {onCd && (
              <span
                style={{
                  position: 'absolute',
                  zIndex: 3,
                  fontSize: '9.5px',
                  fontWeight: 700,
                  color: '#ffffff',
                  textShadow: '0 1px 3px rgba(0,0,0,0.85)',
                }}
              >
                {ab.cooldownRemaining.toFixed(1)}
              </span>
            )}
          </div>
        );
      })}

      {/* Main ATTACK Button (80px) */}
      <div
        onPointerDown={handleAttackPress}
        onPointerUp={handleAttackRelease}
        onPointerCancel={handleAttackRelease}
        style={{
          position: 'absolute',
          left: `${ATTACK_CX - 40}px`,
          top: `${ATTACK_CY - 40}px`,
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: isAttackPressed
            ? 'radial-gradient(circle at 35% 35%, #1f2b38, #0e1620)'
            : powerSet === 'agatha'
            ? 'radial-gradient(circle at 35% 35%, #581c87, #1e0933)'
            : powerSet === 'ironman'
            ? 'radial-gradient(circle at 35% 35%, #7f1d1d, #2b0b0b)'
            : powerSet === 'vision'
            ? 'radial-gradient(circle at 35% 35%, #7a5a0a, #2b2106)'
            : 'radial-gradient(circle at 35% 35%, #2c3e50, #16202c)',
          border: attackCooldown > 0
            ? '2.5px solid rgba(255, 255, 255, 0.25)'
            : powerSet === 'agatha'
            ? '2.5px solid rgba(192, 132, 252, 0.95)'
            : powerSet === 'ironman'
            ? '2.5px solid rgba(239, 68, 68, 0.9)'
            : powerSet === 'vision'
            ? '2.5px solid rgba(253, 224, 71, 0.9)'
            : '2.5px solid rgba(72, 202, 228, 0.85)',
          boxShadow: isAttackPressed
            ? powerSet === 'agatha'
              ? '0 2px 8px rgba(0, 0, 0, 0.5), 0 0 16px rgba(168, 85, 247, 0.55)'
              : '0 2px 8px rgba(0, 0, 0, 0.5), 0 0 16px rgba(239, 68, 68, 0.45)'
            : powerSet === 'agatha'
            ? '0 6px 20px rgba(0, 0, 0, 0.45), 0 0 22px rgba(168, 85, 247, 0.5)'
            : powerSet === 'ironman'
            ? '0 6px 20px rgba(0, 0, 0, 0.45), 0 0 18px rgba(239, 68, 68, 0.35)'
            : powerSet === 'vision'
            ? '0 6px 20px rgba(0, 0, 0, 0.45), 0 0 22px rgba(253, 224, 71, 0.45)'
            : '0 6px 20px rgba(0, 0, 0, 0.45), 0 0 22px rgba(72, 202, 228, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          cursor: 'pointer',
          overflow: 'hidden',
          transform: isAttackPressed ? 'scale(0.92)' : 'scale(1)',
          transition: 'transform 0.08s ease, border-color 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        {/* Radial Cooldown sweep */}
        {attackCooldown > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: `conic-gradient(rgba(0, 0, 0, 0.65) ${(attackCooldown / maxAttackCd) * 100}%, transparent ${(attackCooldown / maxAttackCd) * 100}%)`,
              pointerEvents: 'none',
            }}
          />
        )}

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {powerSet === 'agatha' ? (
            <Sparkles size={28} className="text-purple-300 drop-shadow-sm" />
          ) : powerSet === 'ironman' ? (
            <Zap size={28} className="text-red-300 drop-shadow-sm" />
          ) : powerSet === 'vision' ? (
            <Sparkles size={28} className="text-yellow-200 drop-shadow-sm" />
          ) : (
            <Sword size={28} className="text-cyan-300 drop-shadow-sm" />
          )}
          <span
            style={{
              fontSize: '9px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: powerSet === 'agatha' ? '#f3e8ff' : powerSet === 'vision' ? '#fef9c3' : '#fecaca',
              marginTop: '2px',
            }}
          >
            {powerSet === 'agatha' ? 'RAJADA' : powerSet === 'vision' ? 'SOLAR' : 'ATTACK'}
          </span>
        </div>
      </div>
    </div>
  );
};
