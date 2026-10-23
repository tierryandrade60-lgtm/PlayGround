/**
 * RealProjectScripts.ts
 * Authentic Project Scripts Catalog & Code Hierarchy.
 * Uses Vite ?raw imports to load authentic, un-truncated source files directly.
 */

// Individual Agatha Abilities & Config
import agathaConfigSource from './abilities/agatha/AgathaConfig.ts?raw';
import agathaArcaneBlastSource from './abilities/agatha/AgathaArcaneBlast.ts?raw';
import agathaDarkDrainSource from './abilities/agatha/AgathaDarkDrain.ts?raw';
import agathaChaosOrbSource from './abilities/agatha/AgathaChaosOrb.ts?raw';
import agathaRunicWardSource from './abilities/agatha/AgathaRunicWard.ts?raw';
import agathaTelekineticChokeSource from './abilities/agatha/AgathaTelekineticChoke.ts?raw';
import agathaShadowStepSource from './abilities/agatha/AgathaShadowStep.ts?raw';
import agathaAbilitiesSource from './AgathaAbilities.ts?raw';

// Individual Iron Man Abilities & Config
import ironManConfigSource from './abilities/ironman/IronManConfig.ts?raw';
import ironManRepulsorSource from './abilities/ironman/IronManRepulsor.ts?raw';
import ironManMicroMissilesSource from './abilities/ironman/IronManMicroMissiles.ts?raw';
import ironManUnibeamSource from './abilities/ironman/IronManUnibeam.ts?raw';
import ironManDualBeamsSource from './abilities/ironman/IronManDualBeams.ts?raw';
import ironManBeamFxSource from './abilities/ironman/IronManBeamFx.ts?raw';
import ironManSpinningLasersSource from './abilities/ironman/IronManSpinningLasers.ts?raw';
import ironManAbilitiesSource from './IronManAbilities.ts?raw';

// Centralized Restrictions & Core Game Systems
import gameplayRestrictionsSource from './GameplayRestrictions.ts?raw';
import targetDummySource from './TargetDummy.ts?raw';
import projectileSource from './ProjectileSystem.ts?raw';
import stickmanRigSource from './StickmanRig.ts?raw';
import animControllerSource from './AnimationController.ts?raw';
import gameSceneSource from './GameScene.ts?raw';
import audioSystemSource from './AudioSystem.ts?raw';
import audioManifestSource from './audio/AudioManifest.ts?raw';

// HUD & Interface Components
import combatButtonsSource from '../components/CombatButtons.tsx?raw';
import virtualJoystickSource from '../components/VirtualJoystick.tsx?raw';
import aimReticleSource from '../components/AimReticle.tsx?raw';
import powerSelectModalSource from '../components/PowerSelectModal.tsx?raw';
import settingsModalSource from '../components/SettingsModal.tsx?raw';
import orientationGuardSource from '../components/OrientationGuard.tsx?raw';

// Shared singletons (inspectable; rebuild required for changes)
import settingsManagerSource from './SettingsManager.ts?raw';
import liveConfigManagerSource from './LiveConfigManager.ts?raw';
import buildModeManagerSource from './BuildModeManager.ts?raw';

// Centralized gameplay systems
import dealDamageSystemSource from './systems/DealDamageSystem.ts?raw';
import flightSystemSource from './systems/FlightSystem.ts?raw';
import agathaFlightConfigSource from './systems/flight/AgathaFlightConfig.ts?raw';
import ironManFlightConfigSource from './systems/flight/IronManFlightConfig.ts?raw';
import movementSystemSource from './systems/MovementSystem.ts?raw';
import worldCollisionSource from './systems/WorldCollision.ts?raw';
import cooldownSystemSource from './systems/CooldownSystem.ts?raw';
import abilityButtonSystemSource from './systems/AbilityButtonSystem.ts?raw';
import soundSystemSource from './systems/SoundSystem.ts?raw';

export type ScriptCategory =
  | 'Configurações'
  | 'Habilidades'
  | 'Controladores'
  | 'Restrições'
  | 'Combate'
  | 'Interface & HUD'
  | 'Sistemas';

export type RuntimeIntegration = 'hot-swap' | 'restart-required' | 'read-only';

export interface ProjectScriptInfo {
  id: string;
  name: string;
  filePath: string;
  category: ScriptCategory;
  summary: string;
  originalSource: string;
  fileExtension: 'ts' | 'tsx';
  dependencies: string[];
  character?: 'agatha' | 'ironman' | 'shared';
  isUserCreated?: boolean;
  runtimeIntegration?: RuntimeIntegration;
  keywords?: string[];
}

/**
 * Returns the source that was genuinely applied to the runtime.
 * Drafts are intentionally ignored here: showing a draft as "effective" is
 * what made the old editor report edits that the game never executed.
 */
export function getEffectiveScriptSource(scriptId: string, defaultSource: string): string {
  try {
    const saved =
      localStorage.getItem(`script_applied_${scriptId}`) ||
      localStorage.getItem(`script_source_${scriptId}`);
    if (saved) return saved;
  } catch {
    // ignore
  }
  return defaultSource;
}

export const SCRIPT_TABS: { id: ScriptCategory; label: string }[] = [
  { id: 'Habilidades', label: 'Habilidades' },
  { id: 'Configurações', label: 'Configurações' },
  { id: 'Controladores', label: 'Controladores' },
  { id: 'Restrições', label: 'Restrições & Status' },
  { id: 'Combate', label: 'Combate & Física' },
  { id: 'Interface & HUD', label: 'Interface & HUD' },
  { id: 'Sistemas', label: 'Sistemas Globais' },
];

export const PROJECT_SCRIPTS: ProjectScriptInfo[] = [
  // ==========================================
  // 1. HABILIDADES INDIVIDUAIS (Agatha Harkness)
  // ==========================================
  {
    id: 'agatha-arcane-blast',
    name: 'Rajada Arcana (Ataque Básico)',
    filePath: '/src/game/abilities/agatha/AgathaArcaneBlast.ts',
    category: 'Habilidades',
    character: 'agatha',
    summary:
      'Disparo de projéteis arcanos alternados entre as mãos com trajetória de teleguiamento (homing), brilho violeta profundo e impacto sonoro.',
    originalSource: agathaArcaneBlastSource,
    fileExtension: 'ts',
    dependencies: ['AgathaConfig', 'TargetDummy', 'StickmanRig', 'AudioSystem'],
    keywords: ['agatha', 'arcano', 'rajada', 'ataque', 'basico', 'arcane', 'blast', 'projetil', 'homing'],
  },
  {
    id: 'agatha-dark-drain',
    name: 'Dreno Sombrio (Habilidade 1)',
    filePath: '/src/game/abilities/agatha/AgathaDarkDrain.ts',
    category: 'Habilidades',
    character: 'agatha',
    summary:
      'Canalização de tentáculos de sifão de vida com duração de 3 segundos. Aplica restrições autênticas Anchored e NoFlight e drena alvos próximos.',
    originalSource: agathaDarkDrainSource,
    fileExtension: 'ts',
    dependencies: ['AgathaConfig', 'TargetDummy', 'GameplayRestrictions', 'AudioSystem'],
    keywords: ['agatha', 'dreno', 'sombrio', 'drain', 'sifao', 'vida', 'dark'],
  },
  {
    id: 'agatha-chaos-orb',
    name: 'Orbe do Caos (Habilidade 2)',
    filePath: '/src/game/abilities/agatha/AgathaChaosOrb.ts',
    category: 'Habilidades',
    character: 'agatha',
    summary:
      'Esfera mágica lenta e massiva que detona em impacto ou alcance máximo, gerando uma onda de choque radial com dano em área (AoE).',
    originalSource: agathaChaosOrbSource,
    fileExtension: 'ts',
    dependencies: ['AgathaConfig', 'TargetDummy', 'AudioSystem'],
    keywords: ['agatha', 'orbe', 'caos', 'chaos', 'orb', 'aoe', 'explosao'],
  },
  {
    id: 'agatha-runic-ward',
    name: 'Escudo Rúnico (Habilidade 3)',
    filePath: '/src/game/abilities/agatha/AgathaRunicWard.ts',
    category: 'Habilidades',
    character: 'agatha',
    summary:
      'Barreira de proteção icosaédrica com anéis rúnicos que repele inimigos no lançamento e aplica a restrição genuína IsShield para mitigação de dano.',
    originalSource: agathaRunicWardSource,
    fileExtension: 'ts',
    dependencies: ['AgathaConfig', 'TargetDummy', 'GameplayRestrictions', 'AudioSystem'],
    keywords: ['agatha', 'escudo', 'runic', 'ward', 'shield', 'barreira'],
  },
  {
    id: 'agatha-choke',
    name: 'Estrangulamento Telecinético (Habilidade 4)',
    filePath: '/src/game/abilities/agatha/AgathaTelekineticChoke.ts',
    category: 'Habilidades',
    character: 'agatha',
    summary:
      'Prende o boneco alvo em suspensão telecinética com cordões de energia e anel cervical, aplicando Stunned, Anchored e NoMovement com dano contínuo.',
    originalSource: agathaTelekineticChokeSource,
    fileExtension: 'ts',
    dependencies: ['AgathaConfig', 'TargetDummy', 'GameplayRestrictions', 'AudioSystem'],
    keywords: ['agatha', 'estrangulamento', 'telecinetico', 'choke', 'stun', 'status'],
  },
  {
    id: 'agatha-shadow-step',
    name: 'Passo das Sombras (Esquiva / Dash)',
    filePath: '/src/game/abilities/agatha/AgathaShadowStep.ts',
    category: 'Habilidades',
    character: 'agatha',
    summary:
      'Teletransporte instantâneo através da dimensão sombria na direção do movimento, respeitando caixas de colisão de estruturas.',
    originalSource: agathaShadowStepSource,
    fileExtension: 'ts',
    dependencies: ['AgathaConfig', 'AudioSystem'],
    keywords: ['agatha', 'passo', 'sombra', 'shadow', 'dash', 'esquiva', 'teleporte'],
  },

  // ==========================================
  // HABILIDADES INDIVIDUAIS (Homem de Ferro)
  // ==========================================
  {
    id: 'ironman-repulsor',
    name: 'Disparo de Repulsor (Ataque Básico)',
    filePath: '/src/game/abilities/ironman/IronManRepulsor.ts',
    category: 'Habilidades',
    character: 'ironman',
    summary:
      'Tiros rápidos de plasma das palmas com recuo físico, teleguiamento dinâmico em alvos travados e faíscas de impacto.',
    originalSource: ironManRepulsorSource,
    fileExtension: 'ts',
    dependencies: ['IronManConfig', 'TargetDummy', 'AudioSystem'],
    keywords: ['ironman', 'homem de ferro', 'repulsor', 'ataque', 'basico', 'projetil'],
  },
  {
    id: 'ironman-micro-missiles',
    name: 'Salva de Micro-mísseis (Habilidade 1)',
    filePath: '/src/game/abilities/ironman/IronManMicroMissiles.ts',
    category: 'Habilidades',
    character: 'ironman',
    summary:
      'Disparo de micro-mísseis guiados que sobem em arco vertical antes de mergulhar em direção ao alvo inimigo.',
    originalSource: ironManMicroMissilesSource,
    fileExtension: 'ts',
    dependencies: ['IronManConfig', 'TargetDummy', 'AudioSystem'],
    keywords: ['ironman', 'missil', 'misseis', 'missile', 'volley', 'salva'],
  },
  {
    id: 'ironman-unibeam',
    name: 'Canhão Unibeam (Habilidade 3)',
    filePath: '/src/game/abilities/ironman/IronManUnibeam.ts',
    category: 'Habilidades',
    character: 'ironman',
    summary:
      'Raio concentrado de altíssima energia disparado a partir do Reator Arc do peito com grande impulso e impacto visual.',
    originalSource: ironManUnibeamSource,
    fileExtension: 'ts',
    dependencies: ['IronManConfig', 'TargetDummy', 'AudioSystem'],
    keywords: ['ironman', 'unibeam', 'raio', 'peito', 'beam', 'dano'],
  },

  {
    id: 'ironman-dual-beams',
    name: 'Feixes Duplos & Beam Clash (Habilidade 2)',
    filePath: '/src/game/abilities/ironman/IronManDualBeams.ts',
    category: 'Habilidades',
    character: 'ironman',
    summary:
      'Feixes contínuos das duas mãos com colisão real, dano sustentado e Beam Clash exclusivo contra o NPC rival, com disco de impacto e sem minigame.',
    originalSource: ironManDualBeamsSource,
    fileExtension: 'ts',
    dependencies: ['IronManConfig', 'IronManBeamFx', 'WorldCollision', 'TargetDummy', 'StickmanRig', 'SoundSystem'],
    keywords: ['ironman', 'feixes', 'duplos', 'dual', 'beam', 'clash', 'duelo'],
  },
  {
    id: 'ironman-beam-fx',
    name: 'Efeitos de Beam & Disco de Clash',
    filePath: '/src/game/abilities/ironman/IronManBeamFx.ts',
    category: 'Habilidades',
    character: 'ironman',
    summary:
      'Camadas de núcleo, brilho e aura para os feixes, anéis de energia e disco circular de impacto com bordas, raios e partículas.',
    originalSource: ironManBeamFxSource,
    fileExtension: 'ts',
    dependencies: [],
    keywords: ['ironman', 'beam', 'feixe', 'fx', 'clash', 'disco', 'particulas'],
  },
  {
    id: 'ironman-spinning-lasers',
    name: 'Lasers Giratórios (Habilidade 4)',
    filePath: '/src/game/abilities/ironman/IronManSpinningLasers.ts',
    category: 'Habilidades',
    character: 'ironman',
    summary:
      'Dois lasers de corte acompanham uma rotação completa de 360°, atingindo cada alvo uma vez por conjuração com recuo e impacto.',
    originalSource: ironManSpinningLasersSource,
    fileExtension: 'ts',
    dependencies: ['IronManConfig', 'TargetDummy', 'StickmanRig', 'SoundSystem'],
    keywords: ['ironman', 'lasers', 'giratorios', 'spinning', 'corte', '360'],
  },

  // ==========================================
  // 2. CONFIGURAÇÕES AJUSTÁVEIS (Parâmetros)
  // ==========================================
  {
    id: 'agatha-config',
    name: 'Configuração de Poderes da Agatha',
    filePath: '/src/game/abilities/agatha/AgathaConfig.ts',
    category: 'Configurações',
    character: 'agatha',
    summary:
      'Parâmetros numéricos editáveis: dano do Rajada Arcana, dps do Dreno Sombrio, raio de explosão do Orbe do Caos, vida do Escudo e cooldowns.',
    originalSource: agathaConfigSource,
    fileExtension: 'ts',
    dependencies: [],
    keywords: ['agatha', 'configuracao', 'config', 'dano', 'cooldown', 'parametros'],
  },
  {
    id: 'ironman-config',
    name: 'Configuração de Armas do Homem de Ferro',
    filePath: '/src/game/abilities/ironman/IronManConfig.ts',
    category: 'Configurações',
    character: 'ironman',
    summary:
      'Parâmetros numéricos editáveis: dano e velocidade do repulsor, contagem de mísseis, potência do Unibeam e duração dos feixes duplos.',
    originalSource: ironManConfigSource,
    fileExtension: 'ts',
    dependencies: [],
    keywords: ['ironman', 'configuracao', 'config', 'dano', 'cooldown', 'parametros'],
  },

  // ==========================================
  // 3. CONTROLADORES DE PERSONAGEM
  // ==========================================
  {
    id: 'agatha-abilities',
    name: 'Controlador de Agatha Harkness',
    filePath: '/src/game/AgathaAbilities.ts',
    category: 'Controladores',
    character: 'agatha',
    summary:
      'Coordenador principal que gerencia o ciclo de vida, instanciação e disparo de todas as habilidades mágicas da Agatha no jogo.',
    originalSource: agathaAbilitiesSource,
    fileExtension: 'ts',
    dependencies: ['StickmanRig', 'TargetDummy', 'AudioSystem', 'GameplayRestrictions'],
    keywords: ['agatha', 'controlador', 'controller', 'habilidades', 'poderes'],
  },
  {
    id: 'ironman-abilities',
    name: 'Controlador de Armadura Homem de Ferro',
    filePath: '/src/game/IronManAbilities.ts',
    category: 'Controladores',
    character: 'ironman',
    summary:
      'Coordenador de armas do Homem de Ferro: feixes contínuos, micro-mísseis, Unibeam, lasers giratórios e o minigame Beam Clash.',
    originalSource: ironManAbilitiesSource,
    fileExtension: 'ts',
    dependencies: ['StickmanRig', 'TargetDummy', 'AudioSystem'],
    keywords: ['ironman', 'homem de ferro', 'controlador', 'controller', 'armas'],
  },
  {
    id: 'animation-controller',
    name: 'Controlador de Cinemática & Animações',
    filePath: '/src/game/AnimationController.ts',
    category: 'Controladores',
    summary:
      'Orquestra a locomoção procedural, respiração ociosa, poses de repulsor, levitação mágica da Agatha e inclinação aerodinâmica de voo.',
    originalSource: animControllerSource,
    fileExtension: 'ts',
    dependencies: ['StickmanRig'],
    keywords: ['animacao', 'animation', 'controlador', 'cinematica', 'voo', 'flight'],
  },

  // ==========================================
  // 4. RESTRIÇÕES & STATUS DE GAMEPLAY
  // ==========================================
  {
    id: 'gameplay-restrictions',
    name: 'Sistema de Restrições & Status',
    filePath: '/src/game/GameplayRestrictions.ts',
    category: 'Restrições',
    summary:
      'Sistema centralizado e tipado para aplicação de status: NoPowers, NoMovement, NoFlight, NoBasicAttack, IsShield, Anchored, Invulnerable, Stunned, Silenced.',
    originalSource: gameplayRestrictionsSource,
    fileExtension: 'ts',
    dependencies: [],
    keywords: ['restricoes', 'restrictions', 'status', 'stun', 'invulneravel', 'escudo'],
  },

  // ==========================================
  // 5. COMBATE & FÍSICA
  // ==========================================
  {
    id: 'target-dummy',
    name: 'Boneco de Treino & Alvos',
    filePath: '/src/game/TargetDummy.ts',
    category: 'Combate',
    summary:
      'Alvos de argila com física de mola para recuo, barras de vida billboarded, suporte a Beam Clash rival e aplicação de restrições de invulnerabilidade e escudo.',
    originalSource: targetDummySource,
    fileExtension: 'ts',
    dependencies: ['AudioSystem', 'GameplayRestrictions'],
    keywords: ['alvo', 'target', 'boneco', 'dummy', 'vida', 'dano', 'colisao'],
  },
  {
    id: 'projectile-system',
    name: 'Sistema de Projéteis & Colisões',
    filePath: '/src/game/ProjectileSystem.ts',
    category: 'Combate',
    summary:
      'Trajetórias balísticas clássicas, teleguiamento, projeção de números de dano 3D flutuantes e partículas InstancedMesh.',
    originalSource: projectileSource,
    fileExtension: 'ts',
    dependencies: ['TargetDummy', 'AudioSystem'],
    keywords: ['projetil', 'projectile', 'colisao', 'particulas', 'dano'],
  },

  // ==========================================
  // 6. INTERFACE & HUD
  // ==========================================
  {
    id: 'combat-buttons',
    name: 'HUD de Combate & Botões Touch',
    filePath: '/src/components/CombatButtons.tsx',
    category: 'Interface & HUD',
    summary:
      'Disposição semicircular ergonômica com botão de ataque primário central, 4 habilidades radiais, anéis dinâmicos de cooldown em SVG e esquiva.',
    originalSource: combatButtonsSource,
    fileExtension: 'tsx',
    dependencies: ['AudioSystem'],
    keywords: ['hud', 'botoes', 'combate', 'interface', 'cooldown', 'touch'],
  },
  {
    id: 'aim-reticle',
    name: 'Mira & Marcadores de Travamento',
    filePath: '/src/components/AimReticle.tsx',
    category: 'Interface & HUD',
    summary:
      'Retículo central com colchetes de assistência de mira sobre alvos válidos e confirmação de acerto em X estilo Marvel Rivals.',
    originalSource: aimReticleSource,
    fileExtension: 'tsx',
    dependencies: ['GameScene', 'SettingsManager'],
    keywords: ['mira', 'reticle', 'aim', 'assistencia', 'hud'],
  },
  {
    id: 'virtual-joystick',
    name: 'Joystick Analógico Virtual',
    filePath: '/src/components/VirtualJoystick.tsx',
    category: 'Interface & HUD',
    summary:
      'Controle analógico com base dinâmica na tela sensível ao toque, filtragem de zona morta e vetores normatizados.',
    originalSource: virtualJoystickSource,
    fileExtension: 'tsx',
    dependencies: [],
    keywords: ['joystick', 'controle', 'touch', 'movimento', 'mobile'],
  },
  {
    id: 'power-select-modal',
    name: 'Modal de Seleção de Personagem',
    filePath: '/src/components/PowerSelectModal.tsx',
    category: 'Interface & HUD',
    summary:
      'Janela com troca instantânea entre Agatha Harkness, Homem de Ferro e Herói Clássico.',
    originalSource: powerSelectModalSource,
    fileExtension: 'tsx',
    dependencies: ['AudioSystem'],
    keywords: ['personagem', 'selecao', 'modal', 'power', 'agatha', 'ironman'],
  },
  {
    id: 'orientation-guard',
    name: 'Orientação & Tela Cheia (Mobile)',
    filePath: '/src/components/OrientationGuard.tsx',
    category: 'Interface & HUD',
    summary:
      'Aviso de orientação para dispositivos móveis e botão de tela cheia, com escuta de mudanças de orientação e visibilidade.',
    originalSource: orientationGuardSource,
    fileExtension: 'tsx',
    dependencies: [],
    keywords: ['orientacao', 'mobile', 'tela cheia', 'fullscreen', 'girar'],
  },
  {
    id: 'settings-modal',
    name: 'Modal de Configurações de Jogo',
    filePath: '/src/components/SettingsModal.tsx',
    category: 'Interface & HUD',
    summary:
      'Ajustes em tempo real de volume, sensibilidade de câmera, estilo de retículo, assistência de mira e gráficos.',
    originalSource: settingsModalSource,
    fileExtension: 'tsx',
    dependencies: ['SettingsManager', 'AudioSystem'],
    keywords: ['configuracoes', 'settings', 'modal', 'audio', 'camera'],
  },

  // ==========================================
  // 7. SISTEMAS GLOBAIS
  // ==========================================
  {
    id: 'deal-damage-system',
    name: 'Sistema Central de Dano',
    filePath: '/src/game/systems/DealDamageSystem.ts',
    category: 'Sistemas',
    summary:
      'Pipeline único de aplicação de dano, confirmação de acerto e números flutuantes usado por personagens, habilidades e projéteis.',
    originalSource: dealDamageSystemSource,
    fileExtension: 'ts',
    dependencies: ['TargetDummy', 'ProjectileSystem'],
    keywords: ['dano', 'damage', 'deal', 'hit', 'feedback', 'numeros'],
  },
  {
    id: 'flight-system',
    name: 'FlightSystem — Infraestrutura de Voo',
    filePath: '/src/game/systems/FlightSystem.ts',
    category: 'Sistemas',
    summary:
      'Centraliza altitude, amortecimento, inclinação e intensidade dos propulsores, consumindo perfis individuais por personagem.',
    originalSource: flightSystemSource,
    fileExtension: 'ts',
    dependencies: ['AgathaFlightConfig', 'IronManFlightConfig'],
    runtimeIntegration: 'hot-swap',
    keywords: ['voo', 'flight', 'altitude', 'propulsor', 'bank', 'hover'],
  },
  {
    id: 'agatha-flight-config',
    name: 'Configuração de Voo da Agatha',
    filePath: '/src/game/systems/flight/AgathaFlightConfig.ts',
    category: 'Configurações',
    character: 'agatha',
    summary:
      'Perfil de voo arcano da Agatha: altura de hover, oscilação, amortecimento, inclinação e ausência de propulsores mecânicos.',
    originalSource: agathaFlightConfigSource,
    fileExtension: 'ts',
    dependencies: ['FlightSystem'],
    runtimeIntegration: 'hot-swap',
    keywords: ['agatha', 'voo', 'flight', 'config', 'hover', 'arcano'],
  },
  {
    id: 'ironman-flight-config',
    name: 'Configuração de Voo do Homem de Ferro',
    filePath: '/src/game/systems/flight/IronManFlightConfig.ts',
    category: 'Configurações',
    character: 'ironman',
    summary:
      'Perfil de voo com propulsores nas mãos e pés, inclinação aerodinâmica e intensidades específicas do Homem de Ferro.',
    originalSource: ironManFlightConfigSource,
    fileExtension: 'ts',
    dependencies: ['FlightSystem'],
    runtimeIntegration: 'hot-swap',
    keywords: ['ironman', 'voo', 'flight', 'config', 'propulsor', 'thruster'],
  },
  {
    id: 'movement-system',
    name: 'Sistema de Movimento & Colisão',
    filePath: '/src/game/systems/MovementSystem.ts',
    category: 'Sistemas',
    summary:
      'Resolve deslocamento horizontal contra caixas de estrutura, direção de facing e velocidade efetiva de solo/voo.',
    originalSource: movementSystemSource,
    fileExtension: 'ts',
    dependencies: ['GameScene'],
    runtimeIntegration: 'hot-swap',
    keywords: ['movimento', 'movement', 'colisao', 'estrutura', 'speed'],
  },
  {
    id: 'world-collision',
    name: 'Colisão Universal do Mundo',
    filePath: '/src/game/systems/WorldCollision.ts',
    category: 'Sistemas',
    summary:
      'Fonte única de consultas de sólidos para projéteis, feixes, lasers e linha de visão, incluindo estruturas, chão e Runic Ward.',
    originalSource: worldCollisionSource,
    fileExtension: 'ts',
    dependencies: [],
    runtimeIntegration: 'hot-swap',
    keywords: ['colisao', 'collision', 'solido', 'projetil', 'beam', 'laser', 'ward'],
  },
  {
    id: 'cooldown-system',
    name: 'Sistema de Recarga',
    filePath: '/src/game/systems/CooldownSystem.ts',
    category: 'Sistemas',
    summary:
      'Contador determinístico de recargas compartilhado pelo HUD de combate, com início, atualização e consulta por chave.',
    originalSource: cooldownSystemSource,
    fileExtension: 'ts',
    dependencies: [],
    runtimeIntegration: 'hot-swap',
    keywords: ['cooldown', 'recarga', 'habilidades', 'hud', 'tempo'],
  },
  {
    id: 'ability-button-system',
    name: 'Sistema de Botões de Habilidade',
    filePath: '/src/game/systems/AbilityButtonSystem.ts',
    category: 'Sistemas',
    summary:
      'Metadados centrais dos botões de combate: nomes, identificadores, recargas de ataque, dash e habilidades por personagem.',
    originalSource: abilityButtonSystemSource,
    fileExtension: 'ts',
    dependencies: ['CooldownSystem'],
    runtimeIntegration: 'hot-swap',
    keywords: ['botao', 'button', 'habilidades', 'hud', 'combate', 'recarga'],
  },
  {
    id: 'sound-system',
    name: 'SoundSystem — Áudio Central',
    filePath: '/src/game/systems/SoundSystem.ts',
    category: 'Sistemas',
    summary:
      'Fachada semântica para o AudioSystem existente, mantendo uma única implementação Web Audio para todo o jogo.',
    originalSource: soundSystemSource,
    fileExtension: 'ts',
    dependencies: ['AudioSystem'],
    runtimeIntegration: 'hot-swap',
    keywords: ['som', 'sound', 'audio', 'efeitos', 'central'],
  },
  {
    id: 'settings-manager',
    name: 'Gerenciador de Configurações',
    filePath: '/src/game/SettingsManager.ts',
    category: 'Sistemas',
    summary:
      'Singleton de configurações persistidas (volume, câmera, gráficos e assistência). Alterações exigem rebuild por ser importado diretamente pela aplicação.',
    originalSource: settingsManagerSource,
    fileExtension: 'ts',
    dependencies: [],
    runtimeIntegration: 'hot-swap',
    keywords: ['settings', 'configuracoes', 'singleton', 'persistencia'],
  },
  {
    id: 'live-config-manager',
    name: 'Gerenciador de Configuração ao Vivo',
    filePath: '/src/game/LiveConfigManager.ts',
    category: 'Sistemas',
    summary:
      'Singleton de ajustes ao vivo de câmera, combate e sistema, com serialização para o build. Inspeção somente leitura.',
    originalSource: liveConfigManagerSource,
    fileExtension: 'ts',
    dependencies: [],
    runtimeIntegration: 'hot-swap',
    keywords: ['live config', 'ajustes', 'singleton', 'camera', 'combate'],
  },
  {
    id: 'build-mode-manager',
    name: 'Gerenciador do Modo Construção',
    filePath: '/src/game/BuildModeManager.ts',
    category: 'Sistemas',
    summary:
      'Estado do editor de cena, seleção, transformações, snapshots e exportação de cena. Inspeção somente leitura.',
    originalSource: buildModeManagerSource,
    fileExtension: 'ts',
    dependencies: [],
    runtimeIntegration: 'hot-swap',
    keywords: ['build mode', 'editor', 'cena', 'transformacao', 'snapshot'],
  },
  {
    id: 'game-scene',
    name: 'Cena Principal Three.js (GameScene)',
    filePath: '/src/game/GameScene.ts',
    category: 'Sistemas',
    summary:
      'Cena 3D completa com loop de renderização a 60 FPS, física, colisão de caixas, iluminação solar sombreada e integração com o motor de scripts.',
    originalSource: gameSceneSource,
    fileExtension: 'ts',
    dependencies: ['AudioSystem', 'SettingsManager', 'GameplayRestrictions'],
    runtimeIntegration: 'restart-required',
    keywords: ['cena', 'scene', 'threejs', 'render', 'fisica', 'camera', 'loop'],
  },
  {
    id: 'stickman-rig',
    name: 'Esqueleto Stickman Articulado R15',
    filePath: '/src/game/StickmanRig.ts',
    category: 'Sistemas',
    summary:
      'Modelo humanoide articulado em porcelana branca com juntas anatômicas e propulsores nas mãos e pés.',
    originalSource: stickmanRigSource,
    fileExtension: 'ts',
    dependencies: [],
    runtimeIntegration: 'hot-swap',
    keywords: ['esqueleto', 'rig', 'stickman', 'modelo', 'personagem'],
  },
  {
    id: 'audio-manifest',
    name: 'Manifesto Central de Áudio',
    filePath: '/src/game/audio/AudioManifest.ts',
    category: 'Sistemas',
    summary:
      'Registro tipado de efeitos, caminhos locais, ganhos, limites de polifonia e loops contínuos usado pelo AudioSystem.',
    originalSource: audioManifestSource,
    fileExtension: 'ts',
    dependencies: [],
    runtimeIntegration: 'hot-swap',
    keywords: ['audio', 'manifesto', 'sons', 'sfx', 'loops', 'volume'],
  },
  {
    id: 'audio-system',
    name: 'Sistema de Áudio Cinematográfico',
    filePath: '/src/game/AudioSystem.ts',
    category: 'Sistemas',
    summary:
      'Motor Web Audio baseado em samples locais com cache assíncrono, unlock por gesto, volume global, polifonia limitada e loops contínuos para habilidades.',
    originalSource: audioSystemSource,
    fileExtension: 'ts',
    dependencies: ['AudioManifest'],
    runtimeIntegration: 'hot-swap',
    keywords: ['audio', 'som', 'sons', 'volume', 'samples', 'loops', 'web audio'],
  },
];
