import React, { useState } from 'react';
import { Settings, X, Volume2, VolumeX, Eye, Crosshair, Camera, RotateCcw } from 'lucide-react';
import { settingsManager, GameSettings, GraphicsQuality, ReticlePosition, DEFAULT_SETTINGS } from '../game/SettingsManager';
import { audioSystem } from '../game/AudioSystem';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<GameSettings>(settingsManager.get());

  if (!isOpen) return null;

  const updateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    settingsManager.update({ [key]: value });
  };

  const handleResetCamera = () => {
    audioSystem.playUiClick();
    updateSetting('cameraSensitivity', DEFAULT_SETTINGS.cameraSensitivity);
    updateSetting('cameraShake', DEFAULT_SETTINGS.cameraShake);
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
          maxWidth: '520px',
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
            <Settings size={18} className="text-gray-300" />
            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, letterSpacing: '0.04em' }}>
              SETTINGS
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
              transition: 'background 0.15s, color 0.15s',
            }}
            className="hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Settings Body - Scrollable */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* A. Sound Volume */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {settings.volume === 0 ? <VolumeX size={16} className="text-gray-400" /> : <Volume2 size={16} className="text-cyan-400" />}
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Sound Volume</span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#9ca3af' }}>{settings.volume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.volume}
              onChange={(e) => updateSetting('volume', parseInt(e.target.value, 10))}
              style={{
                width: '100%',
                accentColor: '#38bdf8',
                cursor: 'pointer',
                height: '6px',
                borderRadius: '3px',
              }}
            />
          </div>

          {/* B. Graphics Quality */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Eye size={16} className="text-emerald-400" />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Graphics Quality</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['low', 'medium', 'high'] as GraphicsQuality[]).map((lvl) => {
                const active = settings.graphics === lvl;
                return (
                  <button
                    key={lvl}
                    onClick={() => {
                      audioSystem.playUiClick();
                      updateSetting('graphics', lvl);
                    }}
                    style={{
                      padding: '8px 4px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      border: active ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                      backgroundColor: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                      color: active ? '#ffffff' : '#9ca3af',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* C. Aim Settings */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Crosshair size={16} className="text-amber-400" />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Aim & Reticle</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Aim Assist Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <span style={{ fontSize: '13px' }}>Aim Assist Target Lock</span>
                <button
                  onClick={() => {
                    audioSystem.playUiClick();
                    updateSetting('aimAssist', !settings.aimAssist);
                  }}
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: settings.aimAssist ? '#0284c7' : 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      position: 'absolute',
                      top: '3px',
                      left: settings.aimAssist ? '21px' : '3px',
                      transition: 'left 0.2s ease',
                    }}
                  />
                </button>
              </div>

              {/* Reticle Style Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>Reticle Style</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {(
                    [
                      { id: 'dot', label: 'Clean Dot' },
                      { id: 'crosshair', label: 'Crosshair (4 Lines)' },
                    ] as const
                  ).map((item) => {
                    const active = (settings.reticleStyle || 'dot') === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          audioSystem.playUiClick();
                          updateSetting('reticleStyle', item.id);
                        }}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: active ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                          backgroundColor: active ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                          color: active ? '#ffffff' : '#9ca3af',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* D. Camera Settings */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Camera size={16} className="text-purple-400" />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Camera</span>
              </div>
              <button
                onClick={handleResetCamera}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
                className="hover:text-white"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            </div>

            {/* Sensitivity Slider */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                <span>Sensitivity</span>
                <span>{settings.cameraSensitivity.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={settings.cameraSensitivity}
                onChange={(e) => updateSetting('cameraSensitivity', parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: '#c084fc',
                  cursor: 'pointer',
                  height: '6px',
                  borderRadius: '3px',
                }}
              />
            </div>

            {/* Camera Shake Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <span style={{ fontSize: '13px' }}>Attack & Impact Camera Shake</span>
              <button
                onClick={() => {
                  audioSystem.playUiClick();
                  updateSetting('cameraShake', !settings.cameraShake);
                }}
                style={{
                  width: '42px',
                  height: '24px',
                  borderRadius: '12px',
                  backgroundColor: settings.cameraShake ? '#9333ea' : 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    position: 'absolute',
                    top: '3px',
                    left: settings.cameraShake ? '21px' : '3px',
                    transition: 'left 0.2s ease',
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
