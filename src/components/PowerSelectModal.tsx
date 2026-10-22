import React from 'react';
import { X, Sparkles, Shield, Rocket, Zap, Crosshair, Orbit, Flame } from 'lucide-react';
import { audioSystem } from '../game/AudioSystem';

export type PowerSetType = 'ironman' | 'agatha' | 'classic';

interface PowerSelectModalProps {
  isOpen: boolean;
  activeSet: PowerSetType;
  onSelect: (set: PowerSetType) => void;
  onClose: () => void;
}

export const PowerSelectModal: React.FC<PowerSelectModalProps> = ({
  isOpen,
  activeSet,
  onSelect,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleSelect = (set: PowerSetType) => {
    audioSystem.playUiClick();
    onSelect(set);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 12, 16, 0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        touchAction: 'auto',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '500px',
          maxHeight: '90vh',
          backgroundColor: '#1b1d22',
          border: '1.5px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.2)',
          color: '#e2e4e8',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} className="text-purple-400" />
            <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, letterSpacing: '0.04em' }}>
              SELEÇÃO DE PERSONAGEM & PODERES
            </h2>
          </div>
          <button
            onClick={() => {
              audioSystem.playUiClick();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            className="hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* List of Power Sets */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Agatha Harkness Power Set */}
          <div
            onClick={() => handleSelect('agatha')}
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: activeSet === 'agatha' ? '1.5px solid #a855f7' : '1px solid rgba(168, 85, 247, 0.25)',
              backgroundColor: activeSet === 'agatha' ? 'rgba(168, 85, 247, 0.16)' : 'rgba(147, 51, 234, 0.05)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
            className="hover:border-purple-400/80"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(147, 51, 234, 0.25)',
                    border: '1px solid #c084fc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={15} className="text-purple-300" />
                </div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                  Agatha Harkness (Magia Negra & Arcana)
                </span>
              </div>
              {activeSet === 'agatha' && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    backgroundColor: '#a855f7',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}
                >
                  ATIVO
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#e9d5ff' }}>
                <Zap size={13} className="text-fuchsia-400 shrink-0" />
                <span>Rajada Arcana (Ataque Básico)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#e9d5ff' }}>
                <Zap size={13} className="text-purple-400 shrink-0" />
                <span>Drenagem Sombria (3s Sifão)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#e9d5ff' }}>
                <Orbit size={13} className="text-violet-300 shrink-0" />
                <span>Orbe do Caos (Explosão em Área)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#e9d5ff' }}>
                <Shield size={13} className="text-fuchsia-300 shrink-0" />
                <span>Barreira Rúnica (Escudo & Pulso)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#e9d5ff' }}>
                <Crosshair size={13} className="text-pink-400 shrink-0" />
                <span>Estrangulamento Arcano (3s)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#e9d5ff' }}>
                <Rocket size={13} className="text-violet-300 shrink-0" />
                <span>Passo das Sombras (Esquiva)</span>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#c084fc', margin: '2px 0 0 0' }}>
              ✦ Inclui Voo Arcano com levitação, fumaça escura e partículas roxas cinematográficas.
            </p>
          </div>

          {/* Iron Man Power Set */}
          <div
            onClick={() => handleSelect('ironman')}
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: activeSet === 'ironman' ? '1.5px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: activeSet === 'ironman' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.03)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
            className="hover:border-amber-400/80"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid #ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Rocket size={15} className="text-amber-400" />
                </div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                  Homem de Ferro (Arsenal Mark)
                </span>
              </div>
              {activeSet === 'ironman' && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    backgroundColor: '#f59e0b',
                    color: '#000000',
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}
                >
                  ATIVO
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1' }}>
                <Zap size={13} className="text-red-400 shrink-0" />
                <span>Repulsores Duplos (Rápido)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1' }}>
                <Rocket size={13} className="text-amber-400 shrink-0" />
                <span>Salva de 6 Mísseis Teleguiados</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1' }}>
                <Flame size={13} className="text-yellow-400 shrink-0" />
                <span>Raio Duplo & Choque de Energia</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1' }}>
                <Orbit size={13} className="text-cyan-400 shrink-0" />
                <span>Lasers Giratórios (360°)</span>
              </div>
            </div>
          </div>

          {/* Classic Hero Power Set */}
          <div
            onClick={() => handleSelect('classic')}
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: activeSet === 'classic' ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: activeSet === 'classic' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
            className="hover:border-cyan-400/80"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(56, 189, 248, 0.2)',
                    border: '1px solid #38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Shield size={15} className="text-cyan-400" />
                </div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                  Classic Power Set
                </span>
              </div>
              {activeSet === 'classic' && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    backgroundColor: '#38bdf8',
                    color: '#000000',
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <p style={{ fontSize: '11.5px', color: '#9ca3af', margin: '2px 0 0 0' }}>
              Standard energy blast attack with elemental abilities and training dummy targets.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
