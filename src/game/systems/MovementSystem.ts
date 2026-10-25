/**
 * MovementSystem.ts
 * Shared movement resolution: horizontal sliding against solid structure
 * boxes, walkable-surface discovery (gravity support) and facing/speed helpers.
 *
 * All queries treat the character as a vertical body spanning [feet, feet + height]
 * with a horizontal radius, so collisions always match the real geometry and
 * height of the objects instead of an inflated single-point test.
 */

import * as THREE from 'three';

export interface MovementStep {
  position: THREE.Vector3;
  collided: boolean;
  /** World height of the tallest box that blocked this step (used for flight clearance). */
  blockedBoxTop: number | null;
  /** The tallest box that blocked this step, when any. */
  blockedBox: THREE.Box3 | null;
}

export interface BodyProfile {
  /** Horizontal collision radius of the character. */
  radius: number;
  /** Vertical body span measured from the feet upwards. */
  height: number;
  /** Maximum ledge height the character can walk up onto in one step. */
  stepHeight: number;
}

export const DEFAULT_BODY_HEIGHT = 1.8;
export const DEFAULT_STEP_HEIGHT = 0.85;
export const GROUND_LEVEL = 0;

const EPS = 1e-4;
const SKIN = 0.001;

const FREE_STEP: MovementStep = Object.freeze({
  position: new THREE.Vector3(),
  collided: false,
  blockedBoxTop: null,
  blockedBox: null,
});

export class MovementSystem {
  private taller(current: THREE.Box3 | null, candidate: THREE.Box3): THREE.Box3 {
    return current === null || candidate.max.y > current.max.y ? candidate : current;
  }
  /**
   * Tallest solid box blocking the character body at (x, z), or null when the
   * position is free. Ledges reachable within `stepHeight` never block: they
   * are climbed through the support resolution instead.
   */
  private blockingBoxAt(
    x: number,
    z: number,
    feetY: number,
    boxes: THREE.Box3[],
    radius: number,
    stepHeight: number,
    bodyHeight: number
  ): THREE.Box3 | null {
    const bodyTop = feetY + bodyHeight;
    let blockingBox: THREE.Box3 | null = null;

    for (const box of boxes) {
      if (!box || box.isEmpty()) continue;

      // Walkable ledge: climbing it is handled by getSupportHeight().
      if (box.max.y <= feetY + stepHeight + EPS) continue;
      // Geometry entirely above the head never blocks.
      if (box.min.y >= bodyTop - EPS) continue;

      if (
        x > box.min.x - radius &&
        x < box.max.x + radius &&
        z > box.min.z - radius &&
        z < box.max.z + radius
      ) {
        if (!blockingBox || box.max.y > blockingBox.max.y) {
          blockingBox = box;
        }
      }
    }

    return blockingBox;
  }

  /**
   * Highest walkable surface at or below `feetY + stepHeight` under the
   * character. The baseplate (y = 0) is always a valid floor, so the
   * character can never fall or sink below the ground.
   *
   * A box only supports the character when its top surface is directly above
   * the character centre, which makes walking off an edge release the support
   * cleanly instead of snapping the character back onto the ledge.
   */
  public getSupportHeight(
    x: number,
    z: number,
    feetY: number,
    boxes: THREE.Box3[],
    _radius: number,
    stepHeight: number = DEFAULT_STEP_HEIGHT
  ): number {
    let best = GROUND_LEVEL;

    for (const box of boxes) {
      if (!box || box.isEmpty()) continue;

      if (x <= box.min.x || x >= box.max.x || z <= box.min.z || z >= box.max.z) {
        continue;
      }

      const top = box.max.y;
      if (top > best && top <= feetY + stepHeight + EPS) {
        best = top;
      }
    }

    return best;
  }

  /**
   * Pushes an already intersecting position back outside of every solid box
   * using the shortest horizontal escape, so the character can never stay
   * stuck inside geometry.
   */
  public resolvePenetration(
    x: number,
    z: number,
    feetY: number,
    boxes: THREE.Box3[],
    radius: number,
    stepHeight: number,
    bodyHeight: number = DEFAULT_BODY_HEIGHT
  ): { x: number; z: number } {
    if (this.blockingBoxAt(x, z, feetY, boxes, radius, stepHeight, bodyHeight) === null) {
      return { x, z };
    }

    let bestX = x;
    let bestZ = z;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const box of boxes) {
      if (!box || box.isEmpty()) continue;
      if (box.max.y <= feetY + stepHeight + EPS) continue;
      if (box.min.y >= feetY + bodyHeight - EPS) continue;
      if (
        x <= box.min.x - radius ||
        x >= box.max.x + radius ||
        z <= box.min.z - radius ||
        z >= box.max.z + radius
      ) {
        continue;
      }

      const candidates: Array<[number, number]> = [
        [box.min.x - radius - SKIN, z],
        [box.max.x + radius + SKIN, z],
        [x, box.min.z - radius - SKIN],
        [x, box.max.z + radius + SKIN],
      ];

      for (const [cx, cz] of candidates) {
        if (this.blockingBoxAt(cx, cz, feetY, boxes, radius, stepHeight, bodyHeight) !== null) {
          continue;
        }
        const distance = (cx - x) * (cx - x) + (cz - z) * (cz - z);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestX = cx;
          bestZ = cz;
        }
      }
    }

    return { x: bestX, z: bestZ };
  }

  /**
   * Moves the character horizontally with axis-separated collision so it slides
   * along walls instead of stopping dead, never tunnels through solids and
   * always escapes pre-existing penetration.
   */
  public moveWithCollision(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number,
    collisionBoxes: THREE.Box3[],
    radius: number,
    profile?: Partial<BodyProfile>
  ): MovementStep {
    const stepHeight = profile?.stepHeight ?? DEFAULT_STEP_HEIGHT;
    const bodyHeight = profile?.height ?? DEFAULT_BODY_HEIGHT;

    if (distance <= 0 || direction.lengthSq() <= 0) {
      return { ...FREE_STEP, position: position.clone() };
    }

    const dirLength = Math.hypot(direction.x, direction.z);
    if (dirLength <= EPS) {
      return { ...FREE_STEP, position: position.clone() };
    }

    const feetY = position.y;

    // 1) Escape any pre-existing overlap so the character is never stuck inside geometry.
    const escaped = this.resolvePenetration(
      position.x,
      position.z,
      feetY,
      collisionBoxes,
      radius,
      stepHeight,
      bodyHeight
    );
    let x = escaped.x;
    let z = escaped.z;

    // 2) Axis-separated movement for natural wall sliding.
    const stepX = (direction.x / dirLength) * distance;
    const stepZ = (direction.z / dirLength) * distance;
    let blockedBox: THREE.Box3 | null = null;

    const candidateX = x + stepX;
    const blockX = this.blockingBoxAt(
      candidateX,
      z,
      feetY,
      collisionBoxes,
      radius,
      stepHeight,
      bodyHeight
    );
    if (blockX === null) {
      x = candidateX;
    } else {
      blockedBox = this.taller(blockedBox, blockX);
    }

    const candidateZ = z + stepZ;
    const blockZ = this.blockingBoxAt(
      x,
      candidateZ,
      feetY,
      collisionBoxes,
      radius,
      stepHeight,
      bodyHeight
    );
    if (blockZ === null) {
      z = candidateZ;
    } else {
      blockedBox = this.taller(blockedBox, blockZ);
    }

    const next = position.clone();
    next.x = x;
    next.z = z;

    return {
      position: next,
      collided: blockedBox !== null,
      blockedBoxTop: blockedBox ? blockedBox.max.y : null,
      blockedBox,
    };
  }

  public facingDirection(rotationY: number): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(rotationY), 0, -Math.cos(rotationY));
  }

  public getEffectiveSpeed(isFlying: boolean, groundSpeed: number, flightSpeed: number): number {
    return isFlying ? flightSpeed : groundSpeed;
  }
}

export const movementSystem = new MovementSystem();
