/**
 * BeamClashSystem.ts
 * Shared beam metadata, intersection and lifecycle registry used by beam
 * abilities. The player beam and every clashing emitter register real
 * world-space origins/endpoints here so clashes are not hardcoded per hero.
 */

import * as THREE from 'three';
import { TargetDummy } from '../TargetDummy';
import { WorldCollision } from './WorldCollision';

export interface BeamSource {
  id: string;
  ownerId: string;
  character: string;
  origin: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  active: boolean;
  canClash: boolean;
}

export interface BeamOpponent {
  id: string;
  ownerId: string;
  character: string;
  origin: THREE.Vector3;
  radius: number;
  active: boolean;
  canClash: boolean;
  target: TargetDummy | null;
}

export interface BeamClashIntersection {
  beamId: string;
  opponentId: string;
  opponent: BeamOpponent;
  target: TargetDummy | null;
  point: THREE.Vector3;
  distance: number;
  along: number;
}

export interface BeamClashSession {
  beamId: string;
  opponentId: string;
  point: THREE.Vector3;
  age: number;
}

export class BeamClashSystem {
  private beams = new Map<string, BeamSource>();
  private opponents = new Map<string, BeamOpponent>();
  private sessions = new Map<string, BeamClashSession>();

  public setBeam(source: BeamSource): void {
    this.beams.set(source.id, source);
  }

  public removeBeam(id: string): void {
    this.beams.delete(id);
    this.sessions.delete(id);
  }

  public setOpponent(opponent: BeamOpponent): void {
    this.opponents.set(opponent.id, opponent);
  }

  public removeOpponent(id: string): void {
    this.opponents.delete(id);
  }

  public syncRivalOpponents(dummies: TargetDummy[], character: string): void {
    const alive = new Set<string>();
    for (const dummy of dummies) {
      if (!dummy.isRival) continue;
      const id = `rival-${dummy.id}`;
      alive.add(id);
      this.setOpponent({
        id,
        ownerId: 'rival',
        character,
        origin: dummy.getCenter(),
        radius: dummy.radius,
        active: !dummy.isDead,
        canClash: !dummy.isDead && dummy.rivalCooldown <= 0,
        target: dummy,
      });
    }
    for (const id of Array.from(this.opponents.keys())) {
      if (id.startsWith('rival-') && !alive.has(id)) this.opponents.delete(id);
    }
  }

  public findIntersection(
    beamId: string,
    maxDistance = Number.POSITIVE_INFINITY
  ): BeamClashIntersection | null {
    const beam = this.beams.get(beamId);
    if (!beam || !beam.active || !beam.canClash) return null;

    let best: BeamClashIntersection | null = null;
    for (const opponent of this.opponents.values()) {
      if (!opponent.active || !opponent.canClash) continue;
      const distance = WorldCollision.distanceToSegment(
        beam.origin,
        beam.end,
        opponent.origin
      );
      if (distance > opponent.radius + beam.radius + 0.55) continue;

      const t = WorldCollision.closestTOnSegment(
        beam.origin,
        beam.end,
        opponent.origin
      );
      if (t < 0 || t > 1) continue;
      const along = t * beam.origin.distanceTo(beam.end);
      if (along > maxDistance) continue;

      const point = beam.origin.clone().lerp(opponent.origin, 0.5);
      if (!best || distance < best.distance) {
        best = {
          beamId,
          opponentId: opponent.id,
          opponent,
          target: opponent.target,
          point,
          distance,
          along,
        };
      }
    }
    return best;
  }

  public beginSession(intersection: BeamClashIntersection): boolean {
    const existing = this.sessions.get(intersection.beamId);
    if (
      existing &&
      existing.opponentId === intersection.opponentId
    ) {
      existing.point.copy(intersection.point);
      return false;
    }
    this.sessions.set(intersection.beamId, {
      beamId: intersection.beamId,
      opponentId: intersection.opponentId,
      point: intersection.point.clone(),
      age: 0,
    });
    return true;
  }

  public updateSession(beamId: string, point: THREE.Vector3, dt: number): BeamClashSession | null {
    const session = this.sessions.get(beamId);
    if (!session) return null;
    session.point.copy(point);
    session.age += dt;
    return session;
  }

  public endSession(beamId: string): BeamClashSession | null {
    const session = this.sessions.get(beamId) || null;
    this.sessions.delete(beamId);
    return session;
  }

  public hasSession(beamId: string): boolean {
    return this.sessions.has(beamId);
  }

  public getSession(beamId: string): BeamClashSession | null {
    return this.sessions.get(beamId) || null;
  }

  public reset(): void {
    this.beams.clear();
    this.opponents.clear();
    this.sessions.clear();
  }
}

export const beamClashSystem = new BeamClashSystem();
