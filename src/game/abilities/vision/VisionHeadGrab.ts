/**
 * VisionHeadGrab.ts
 * Vision's independent head-grab ability. It validates a nearby target,
 * positions Vision directly in front of it, locks both participants, animates
 * both hands around the target's head, deals configurable damage ticks and
 * always releases the target/restrictions on end, death or invalidation.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { worldCollision } from '../../systems/WorldCollision';
import { activeVisionConfig } from './VisionConfig';
import type { VisionAbilityContext } from './VisionAbilityContext';

type AimProvider = () => { pos: THREE.Vector3; target: TargetDummy | null };
type DamageHandler = (
  dummy: TargetDummy,
  damage: number,
  hitPosition: THREE.Vector3,
  knockback?: THREE.Vector3
) => void;
type ImpactHandler = (position: THREE.Vector3, color: number) => void;

const SOURCE = 'vision-head-grab';

interface GrabState {
  target: TargetDummy;
  elapsed: number;
  damageTimer: number;
  damageTicksDone: number;
  startPosition: THREE.Vector3;
  desiredPosition: THREE.Vector3;
  facingYaw: number;
  targetYaw: number;
}

export class VisionHeadGrab {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAim: AimProvider;
  private onDamage: DamageHandler;
  private onImpact: ImpactHandler;
  private onShake: (amount: number) => void;
  private context: VisionAbilityContext;

  private state: GrabState | null = null;
  private cooldownRemaining = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    getAim: AimProvider,
    onDamage: DamageHandler,
    onImpact: ImpactHandler,
    onShake: (amount: number) => void,
    context: VisionAbilityContext = {}
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.getAim = getAim;
    this.onDamage = onDamage;
    this.onImpact = onImpact;
    this.onShake = onShake;
    this.context = context;
  }

  public get isActive(): boolean {
    return this.state !== null;
  }

  public get isReady(): boolean {
    return this.cooldownRemaining <= 0 && !this.isActive;
  }

  public get target(): TargetDummy | null {
    return this.state?.target ?? null;
  }

  private playerPosition(): THREE.Vector3 {
    const fromContext = this.context.getPlayerPosition?.();
    if (fromContext) return fromContext.clone();
    return this.stickman.root.position.clone();
  }

  private playerYaw(): number {
    if (this.context.getPlayerRotation) return this.context.getPlayerRotation();
    return this.stickman.root.rotation.y;
  }

  private horizontalDistance(a: THREE.Vector3, b: THREE.Vector3): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  private findTarget(dummies: TargetDummy[]): TargetDummy | null {
    const config = activeVisionConfig.headGrab;
    const playerPos = this.playerPosition();
    const playerChest = playerPos.clone().add(new THREE.Vector3(0, 1.25, 0));
    const candidates = dummies.filter((dummy) => {
      if (!dummy || dummy.isDead || !dummy.group.visible) return false;
      return this.horizontalDistance(playerPos, dummy.group.position) <= config.range;
    });
    if (candidates.length === 0) return null;

    const aimed = this.getAim().target;
    const ordered = aimed && candidates.includes(aimed)
      ? [aimed, ...candidates.filter((dummy) => dummy !== aimed)]
      : candidates.sort(
          (a, b) =>
            this.horizontalDistance(playerPos, a.group.position) -
            this.horizontalDistance(playerPos, b.group.position)
        );

    for (const dummy of ordered) {
      if (!config.requireLineOfSight) return dummy;
      const head = dummy.getHeadPosition();
      if (!worldCollision.isSegmentBlocked(playerChest, head, 0.08)) return dummy;
    }
    return null;
  }

  public trigger(dummies: TargetDummy[]): boolean {
    if (this.disposed || this.state || this.cooldownRemaining > 0) return false;
    const config = activeVisionConfig.headGrab;
    const target = this.findTarget(dummies);
    if (!target) return false;

    const playerPos = this.playerPosition();
    const targetPos = target.group.position;
    const direction = targetPos.clone().sub(playerPos);
    direction.y = 0;
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, -1);
    direction.normalize();

    const desiredPosition = targetPos.clone().addScaledVector(direction, -config.standDistance);
    desiredPosition.y = targetPos.y;
    const facingYaw = Math.atan2(-direction.x, -direction.z);
    const targetYaw = Math.atan2(direction.x, direction.z);

    this.state = {
      target,
      elapsed: 0,
      damageTimer: 0,
      damageTicksDone: 0,
      startPosition: playerPos.clone(),
      desiredPosition,
      facingYaw,
      targetYaw,
    };
    this.cooldownRemaining = Math.max(0.1, config.cooldown);

    target.setHeadGrabbed(true);
    target.group.rotation.y = targetYaw;

    if (config.lockPlayer) {
      gameplayRestrictions.applyRestriction('NoMovement', SOURCE, config.duration + 0.5);
      gameplayRestrictions.applyRestriction('NoFlight', SOURCE, config.duration + 0.5);
      gameplayRestrictions.applyRestriction('Anchored', SOURCE, config.duration + 0.5);
    }
    this.context.setPlayerRotation?.(facingYaw);
    this.context.setHeadGrabPose?.(true);
    audioSystem.playArcaneChokeStart?.();
    audioSystem.playArcaneChokeTick?.();
    return true;
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    const state = this.state;
    if (!state) return;

    const config = activeVisionConfig.headGrab;
    state.elapsed += dt;
    const target = state.target;

    if (
      target.isDead ||
      !target.group.visible ||
      !dummies.includes(target) ||
      (config.breakOnTargetDeath && !target.group.visible)
    ) {
      this.finish('invalid-target');
      return;
    }

    const playerPos = this.playerPosition();
    if (this.horizontalDistance(playerPos, target.group.position) > config.breakRange) {
      this.finish('out-of-range');
      return;
    }

    const approach = Math.min(1, state.elapsed / Math.max(0.05, config.approachTime));
    const eased = approach * approach * (3 - 2 * approach);
    if (approach < 1) {
      const position = state.startPosition.clone().lerp(state.desiredPosition, eased);
      this.context.setPlayerPosition?.(position);
    }
    this.context.setPlayerRotation?.(state.facingYaw);

    const livePlayer = this.playerPosition();
    const forward = new THREE.Vector3(
      -Math.sin(state.facingYaw),
      0,
      -Math.cos(state.facingYaw)
    );
    const grabPosition = livePlayer.clone().addScaledVector(forward, config.standDistance);
    grabPosition.y = target.group.position.y;
    target.group.position.copy(grabPosition);
    target.group.rotation.y = state.targetYaw;
    target.updateHeadGrabPose(state.elapsed);

    state.damageTimer += dt;
    const tickInterval = Math.max(
      0.12,
      (config.duration - 0.3) / Math.max(1, Math.floor(config.damageTicks))
    );
    if (
      state.damageTicksDone < Math.max(1, Math.floor(config.damageTicks)) &&
      state.elapsed >= 0.28 + state.damageTicksDone * tickInterval
    ) {
      state.damageTicksDone += 1;
      const tickDamage = config.damage / Math.max(1, Math.floor(config.damageTicks));
      const head = target.getHeadPosition();
      this.onDamage(target, tickDamage, head);
      this.onImpact(head, config.grabColor);
      this.onShake(0.012);
      audioSystem.playArcaneChokeTick?.();
    }

    if (state.elapsed >= Math.max(0.2, config.duration)) {
      this.finish('completed');
    }
  }

  private finish(_reason: string): void {
    const state = this.state;
    this.state = null;
    gameplayRestrictions.clearRestrictionsBySource(SOURCE);
    if (state) {
      state.target.setHeadGrabbed(false);
      state.target.group.rotation.y = state.targetYaw;
    }
    this.context.setHeadGrabPose?.(false);
  }

  public cancel(): boolean {
    if (!this.state) return false;
    this.finish('cancelled');
    return true;
  }

  public dispose(): void {
    this.disposed = true;
    this.finish('disposed');
    this.cooldownRemaining = 0;
  }
}
