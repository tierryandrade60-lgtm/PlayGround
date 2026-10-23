/**
 * WorldCollision.ts
 * Shared solid-geometry queries for powers, projectiles, effects and
 * knockback. Single source of truth for "what is solid":
 * - structure boxes (test structures + Build Mode placements), synced from
 *   GameScene every frame;
 * - AgathaRunicWard colliders (4 walls + floor, plus its ceiling) which are
 *   registered while the ward is active;
 * - the ground plane (y = GROUND_HIT_Y).
 *
 * All fast movers use segment tests (slab method) between their previous and
 * current position, so nothing can tunnel through thin geometry, and line-of-
 * sight helpers gate beam/AoE damage so it never crosses surfaces it should
 * not cross.
 */

import * as THREE from 'three';

/** Height at which projectiles splash against the ground (matches legacy checks). */
export const GROUND_HIT_Y = 0.05;

export interface SolidHit {
  /** World impact point on the surface. */
  point: THREE.Vector3;
  /** Distance travelled along the segment until the impact. */
  distance: number;
  /** Outward surface normal (zero vector when the segment started inside). */
  normal: THREE.Vector3;
  /** Box that was hit, or null when the ground plane was hit. */
  box: THREE.Box3 | null;
}

const AXIS_X = 0;
const AXIS_Y = 1;
const AXIS_Z = 2;

const ZERO_NORMAL = new THREE.Vector3();

function segmentBoxHit(
  from: THREE.Vector3,
  to: THREE.Vector3,
  box: THREE.Box3,
  radius: number,
  out: { t: number; axis: number; sign: number; inside: boolean }
): boolean {
  const minX = box.min.x - radius;
  const maxX = box.max.x + radius;
  const minY = box.min.y - radius;
  const maxY = box.max.y + radius;
  const minZ = box.min.z - radius;
  const maxZ = box.max.z + radius;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;

  let tNear = 0;
  let tFar = 1;
  let nearAxis = -1;
  let nearSign = 1;

  const originInside =
    from.x > minX && from.x < maxX &&
    from.y > minY && from.y < maxY &&
    from.z > minZ && from.z < maxZ;

  if (Math.abs(dx) < 1e-9) {
    if (from.x <= minX || from.x >= maxX) return false;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - from.x) * inv;
    let t2 = (maxX - from.x) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tNear) {
      tNear = t1;
      nearAxis = AXIS_X;
      nearSign = sign;
    }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return false;
  }

  if (Math.abs(dy) < 1e-9) {
    if (from.y <= minY || from.y >= maxY) return false;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - from.y) * inv;
    let t2 = (maxY - from.y) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tNear) {
      tNear = t1;
      nearAxis = AXIS_Y;
      nearSign = sign;
    }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return false;
  }

  if (Math.abs(dz) < 1e-9) {
    if (from.z <= minZ || from.z >= maxZ) return false;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - from.z) * inv;
    let t2 = (maxZ - from.z) * inv;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tNear) {
      tNear = t1;
      nearAxis = AXIS_Z;
      nearSign = sign;
    }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return false;
  }

  if (tFar < 0 || tNear > 1) return false;

  out.t = tNear < 0 ? 0 : tNear;
  // A segment starting on the face and moving away (beam origin pressed
  // against a wall) is not an impact. Starting on the face and moving in, or
  // beginning strictly inside, still counts immediately.
  if (!originInside && out.t < 1e-4 && tFar < 1e-4) return false;
  out.axis = nearAxis;
  out.sign = nearSign;
  out.inside = originInside;
  return true;
}

export class WorldCollision {
  private structureBoxes: THREE.Box3[] = [];
  private wardBoxes: THREE.Box3[] = [];
  private wardCeilingBox: THREE.Box3 | null = null;

  private movementCache: THREE.Box3[] = [];
  private solidCache: THREE.Box3[] = [];

  private readonly scratch = { t: 0, axis: -1, sign: 1, inside: false };
  private readonly hit: SolidHit = {
    point: new THREE.Vector3(),
    distance: 0,
    normal: new THREE.Vector3(),
    box: null,
  };

  public setStructureBoxes(boxes: THREE.Box3[] | null | undefined): void {
    this.structureBoxes = boxes ?? [];
    this.rebuild();
  }

  public setWard(
    wallsAndFloor: THREE.Box3[],
    ceiling: THREE.Box3 | null
  ): void {
    this.wardBoxes = wallsAndFloor;
    this.wardCeilingBox = ceiling;
    this.rebuild();
  }

  public clearWard(): void {
    if (this.wardBoxes.length === 0 && this.wardCeilingBox === null) return;
    this.wardBoxes = [];
    this.wardCeilingBox = null;
    this.rebuild();
  }

  /** Ceiling collider of the active ward (null when no ward is active). */
  public get wardCeiling(): THREE.Box3 | null {
    return this.wardCeilingBox;
  }

  /** Boxes that block horizontal character/dummy movement (no ceiling). */
  public getMovementBoxes(): THREE.Box3[] {
    return this.movementCache;
  }

  /** Every solid box, including the ward ceiling (projectiles / beams). */
  public getBoxes(): THREE.Box3[] {
    return this.solidCache;
  }

  private rebuild(): void {
    const movement: THREE.Box3[] = [];
    const solid: THREE.Box3[] = [];

    for (const box of this.structureBoxes) {
      if (!box || box.isEmpty()) continue;
      movement.push(box);
      solid.push(box);
    }
    for (const box of this.wardBoxes) {
      if (!box || box.isEmpty()) continue;
      movement.push(box);
      solid.push(box);
    }
    if (this.wardCeilingBox && !this.wardCeilingBox.isEmpty()) {
      solid.push(this.wardCeilingBox);
    }

    this.movementCache = movement;
    this.solidCache = solid;
  }

  /**
   * Nearest surface hit between two world points (structures + ward + ground),
   * inflating every box by `radius`. Returns null when the segment is free.
   */
  public segmentHit(
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number = 0
  ): SolidHit | null {
    let bestT = Number.POSITIVE_INFINITY;
    let bestBox: THREE.Box3 | null = null;
    let bestAxis = -1;
    let bestSign = 1;
    let bestInside = false;

    for (const box of this.solidCache) {
      if (
        !segmentBoxHit(from, to, box, radius, this.scratch) ||
        this.scratch.t >= bestT
      ) {
        continue;
      }
      bestT = this.scratch.t;
      bestBox = box;
      bestAxis = this.scratch.axis;
      bestSign = this.scratch.sign;
      bestInside = this.scratch.inside;
    }

    // Ground plane: only downward crossings count, so geometry lying on the
    // floor never triggers a phantom hit for flat horizontal segments.
    const dy = to.y - from.y;
    if (from.y > GROUND_HIT_Y && dy < 0) {
      const t = (GROUND_HIT_Y - from.y) / dy;
      if (t >= 0 && t <= 1 && t < bestT) {
        bestT = t;
        bestBox = null;
        bestAxis = AXIS_Y;
        bestSign = 1;
        bestInside = false;
      }
    }

    if (!bestBox && bestT === Number.POSITIVE_INFINITY) {
      return null;
    }

    this.hit.point.lerpVectors(from, to, bestT);
    this.hit.distance = bestT * from.distanceTo(to);
    this.hit.box = bestBox;
    this.hit.normal.set(0, 0, 0);
    if (bestAxis === AXIS_X) this.hit.normal.x = bestSign;
    else if (bestAxis === AXIS_Y) this.hit.normal.y = bestSign;
    else if (bestAxis === AXIS_Z) this.hit.normal.z = bestSign;
    if (bestInside) this.hit.normal.copy(ZERO_NORMAL);
    return this.hit;
  }

  /** True when a solid surface or the ground sits between the two points. */
  public isSegmentBlocked(
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number = 0
  ): boolean {
    return this.segmentHit(from, to, radius) !== null;
  }

  /** True when the point is inside any solid (within `radius` of its surface). */
  public isPointInSolid(point: THREE.Vector3, radius: number = 0): boolean {
    for (const box of this.solidCache) {
      if (
        point.x > box.min.x - radius && point.x < box.max.x + radius &&
        point.y > box.min.y - radius && point.y < box.max.y + radius &&
        point.z > box.min.z - radius && point.z < box.max.z + radius
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Parametric position (0..1) of the closest approach of `point` to the
   * segment `from`→`to`, used to decide which impact comes first.
   */
  public static closestTOnSegment(
    from: THREE.Vector3,
    to: THREE.Vector3,
    point: THREE.Vector3
  ): number {
    const abx = to.x - from.x;
    const aby = to.y - from.y;
    const abz = to.z - from.z;
    const lengthSq = abx * abx + aby * aby + abz * abz;
    if (lengthSq < 1e-9) return 0;
    const t =
      ((point.x - from.x) * abx +
        (point.y - from.y) * aby +
        (point.z - from.z) * abz) /
      lengthSq;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }

  /** Distance from `point` to the segment `from`→`to`. */
  public static distanceToSegment(
    from: THREE.Vector3,
    to: THREE.Vector3,
    point: THREE.Vector3
  ): number {
    const t = WorldCollision.closestTOnSegment(from, to, point);
    const cx = from.x + (to.x - from.x) * t;
    const cy = from.y + (to.y - from.y) * t;
    const cz = from.z + (to.z - from.z) * t;
    return Math.hypot(point.x - cx, point.y - cy, point.z - cz);
  }
}

let activeWorldCollision = new WorldCollision();

/**
 * Live singleton used by every module (projectiles, beams, abilities, HUD).
 *
 * It is a stable Proxy so applying an edited WorldCollision module can swap the
 * implementation underneath without breaking any of the already-imported
 * references. All reads/writes are forwarded to the current instance.
 */
export const worldCollision: WorldCollision = new Proxy({} as WorldCollision, {
  get(_target, property) {
    const instance = activeWorldCollision as unknown as Record<PropertyKey, unknown>;
    const value = instance[property];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(activeWorldCollision) : value;
  },
  set(_target, property, value) {
    (activeWorldCollision as unknown as Record<PropertyKey, unknown>)[property] = value;
    return true;
  },
  has(_target, property) {
    return property in (activeWorldCollision as unknown as object);
  },
});

export function getWorldCollisionInstance(): WorldCollision {
  return activeWorldCollision;
}

/**
 * Replaces the live collision singleton. Runtime state that must survive the
 * swap (structure boxes / ward colliders) is copied to the new instance.
 */
export function installWorldCollisionInstance(instance: WorldCollision): void {
  if (!instance || typeof instance !== 'object') {
    throw new Error('Instância de WorldCollision inválida.');
  }
  const required = ['setStructureBoxes', 'setWard', 'getMovementBoxes', 'getBoxes', 'segmentHit', 'isSegmentBlocked', 'isPointInSolid'];
  for (const method of required) {
    if (typeof (instance as unknown as Record<string, unknown>)[method] !== 'function') {
      throw new Error(`WorldCollision editada não implementa "${method}".`);
    }
  }
  const previous = activeWorldCollision;
  try {
    instance.setStructureBoxes(previous.getMovementBoxes().filter((box) => !!box));
  } catch {
    // State transfer is best-effort; the game re-publishes boxes every frame.
  }
  try {
    const ceiling = previous.wardCeiling;
    if (ceiling) instance.setWard([], ceiling);
  } catch {
    // Ward state is recreated by the Runic Ward module when needed.
  }
  activeWorldCollision = instance;
}
