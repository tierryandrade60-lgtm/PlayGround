/**
 * Headless physics validation for the reworked collision system.
 * Mirrors the GameScene controller loop (horizontal move -> vertical resolve).
 */
import * as THREE from 'three';
import {
  movementSystem,
  DEFAULT_BODY_HEIGHT,
  DEFAULT_STEP_HEIGHT,
} from './src/game/systems/MovementSystem';

const RADIUS = 0.45;
const GRAVITY = 26;
const MAX_FALL = 22;
const HOVER = 3.6;
const CLEARANCE = 0.08;
const OBSTACLE_CLEARANCE = 0.55;
const ALT_DAMP = 6.0;

function box(cx: number, cy: number, cz: number, w: number, h: number, d: number): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
    new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2)
  );
}

// Same default structures as GameScene.setupTestingStructures()
const structureBoxes: THREE.Box3[] = [
  box(-12, 3, -15, 4, 6, 4), // large block, top 6
  box(14, 0.4, -16, 14, 0.8, 8), // wide platform, top 0.8
  box(-8, 1.5, -25, 3, 3, 3), // medium block, top 3
  box(8, 0.75, -22, 1.5, 1.5, 1.5), // small block, top 1.5
  box(0, 2.5, -28, 0.6, 5, 6), // thin wall, top 5
];

class Player {
  pos = new THREE.Vector3(0, 0, 0);
  velY = 0;
  isFlying = false;
  grounded = true;
  obstacle: THREE.Box3 | null = null;

  step(dt: number, moveDir: THREE.Vector3, speed: number): void {
    // --- horizontal (mirrors GameScene step 3) ---
    let blocked: THREE.Box3 | null = null;
    if (speed > 0) {
      const step = movementSystem.moveWithCollision(
        this.pos,
        moveDir,
        speed * dt,
        structureBoxes,
        RADIUS,
        { radius: RADIUS, height: DEFAULT_BODY_HEIGHT, stepHeight: DEFAULT_STEP_HEIGHT }
      );
      this.pos.x = step.position.x;
      this.pos.z = step.position.z;
      blocked = step.blockedBox;
    }
    if (this.isFlying && blocked) this.obstacle = blocked;
    else if (!this.isFlying) this.obstacle = null;

    // --- vertical (mirrors GameScene resolveVerticalState) ---
    const stepHeight = DEFAULT_STEP_HEIGHT;
    const support = movementSystem.getSupportHeight(
      this.pos.x,
      this.pos.z,
      this.pos.y,
      structureBoxes,
      RADIUS,
      stepHeight
    );

    if (this.isFlying) {
      let desired = Math.max(HOVER, support + CLEARANCE);
      if (this.obstacle) {
        const ob = this.obstacle;
        const m = RADIUS + 0.05;
        const near =
          this.pos.x > ob.min.x - m &&
          this.pos.x < ob.max.x + m &&
          this.pos.z > ob.min.z - m &&
          this.pos.z < ob.max.z + m;
        const climbed = this.pos.y >= ob.max.y + OBSTACLE_CLEARANCE * 0.5;
        if (near && !climbed) desired = Math.max(desired, ob.max.y + OBSTACLE_CLEARANCE);
        else this.obstacle = null;
      }
      // dampAltitude(current, target, dt) = damp toward target
      const t = 1 - Math.exp(-ALT_DAMP * dt);
      let y = this.pos.y + (desired - this.pos.y) * t;
      if (y < support) y = support;
      this.pos.y = y;
      this.velY = 0;
      this.grounded = Math.abs(y - support) < 0.02;
      return;
    }

    this.velY = Math.max(-MAX_FALL, this.velY - GRAVITY * dt);
    let nextY = this.pos.y + this.velY * dt;
    const landing = movementSystem.getSupportHeight(
      this.pos.x,
      this.pos.z,
      Math.max(nextY, this.pos.y),
      structureBoxes,
      RADIUS,
      stepHeight
    );
    if (nextY <= landing) {
      nextY = landing;
      this.velY = 0;
      this.grounded = true;
    } else {
      this.grounded = nextY - landing < 0.02;
    }
    this.pos.y = nextY;
  }
}

function insideAnySolid(p: THREE.Vector3, radius = RADIUS): boolean {
  for (const b of structureBoxes) {
    if (p.y >= b.max.y - 1e-6) continue; // standing on top is fine
    if (p.y + DEFAULT_BODY_HEIGHT <= b.min.y + 1e-6) continue;
    if (
      p.x > b.min.x - radius + 1e-6 &&
      p.x < b.max.x + radius - 1e-6 &&
      p.z > b.min.z - radius + 1e-6 &&
      p.z < b.max.z + radius - 1e-6
    ) {
      return true;
    }
  }
  return false;
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const DT = 1 / 60;

// ---------------------------------------------------------------- A: flat walk
{
  const p = new Player();
  for (let i = 0; i < 120; i++) p.step(DT, new THREE.Vector3(0, 0, -1), 6.4);
  check('A. walks on flat ground at y=0', Math.abs(p.pos.y) < 1e-6, `y=${p.pos.y.toFixed(4)}`);
  check('A. advances the full distance', Math.abs(p.pos.z - (-12.8)) < 0.05, `z=${p.pos.z.toFixed(3)}`);
  check('A. stays grounded', p.grounded);
}

// ------------------------------------------------------- B: wall front collision
{
  const p = new Player();
  p.pos.set(0, 0, -20);
  for (let i = 0; i < 240; i++) p.step(DT, new THREE.Vector3(0, 0, -1), 6.4);
  const limit = -25 + RADIUS; // wall front face at z=-25
  check(
    'B. stops in front of the thin wall',
    p.pos.z >= limit - 1e-6 && !insideAnySolid(p.pos),
    `z=${p.pos.z.toFixed(3)} limit=${limit.toFixed(3)}`
  );
  check('B. never penetrates while pushing', !insideAnySolid(p.pos));
}

// ------------------------------------------------------------ C: wall sliding
{
  // Walk diagonally into the large block: the blocked axis stops, the free
  // axis keeps moving => the character slides along the block face.
  const p = new Player();
  p.pos.set(-16, 0, -10);
  const dir = new THREE.Vector3(0.6, 0, -0.8).normalize();
  for (let i = 0; i < 240; i++) p.step(DT, dir, 6.4);
  check(
    'C. slides along the block face instead of sticking',
    Math.abs(p.pos.x - (-14.45)) < 0.08 && p.pos.z < -17.4,
    `x=${p.pos.x.toFixed(3)} z=${p.pos.z.toFixed(3)}`
  );
  check('C. no penetration while sliding', !insideAnySolid(p.pos));
}

// ------------------------------------------------- D: walk onto the platform
{
  const p = new Player();
  p.pos.set(14, 0, -8);
  let minY = 0;
  let onPlatformY = Number.NaN;
  for (let i = 0; i < 240; i++) {
    p.step(DT, new THREE.Vector3(0, 0, -1), 6.4);
    minY = Math.min(minY, p.pos.y);
    if (p.pos.z < -16 && p.pos.z > -19 && Number.isNaN(onPlatformY)) onPlatformY = p.pos.y;
  }
  check('D. climbs onto the platform top (y=0.8)', Math.abs(onPlatformY - 0.8) < 1e-6, `y=${onPlatformY.toFixed(4)}`);
  check('D. stands on the platform surface', p.pos.z < -20, `z=${p.pos.z.toFixed(3)}`);
  check('D. never sinks below the surface', minY >= -1e-6, `minY=${minY.toFixed(4)}`);

  // walk off the far side (continue towards -z, past the platform edge at z=-20)
  for (let i = 0; i < 300; i++) p.step(DT, new THREE.Vector3(0, 0, -1), 6.4);
  check('D. falls back to the ground after the edge', Math.abs(p.pos.y) < 1e-6, `y=${p.pos.y.toFixed(4)}`);
  check('D. rests on the ground', p.grounded && p.velY === 0);
}

// ----------------------------------------------------- E: dash never tunnels
{
  const p = new Player();
  p.pos.set(0, 0, -20);
  let everInside = false;
  for (let i = 0; i < 120; i++) {
    p.step(DT, new THREE.Vector3(0, 0, -1), 19.5); // dash speed
    if (insideAnySolid(p.pos)) everInside = true;
  }
  check('E. dash cannot tunnel through the wall', !everInside, `z=${p.pos.z.toFixed(3)}`);
  check('E. dash stops at the wall face', p.pos.z >= -25 + RADIUS - 1e-6, `z=${p.pos.z.toFixed(3)}`);
}

// ------------------------------------------------- F: flight climbs the block
{
  const p = new Player();
  p.pos.set(-12, 0, -8);
  p.isFlying = true;
  let maxOverBlock = 0;
  let crossed = false;
  for (let i = 0; i < 600; i++) {
    p.step(DT, new THREE.Vector3(0, 0, -1), 8.8);
    if (p.pos.z < -15 && p.pos.z > -22) maxOverBlock = Math.max(maxOverBlock, p.pos.y);
    if (p.pos.z < -20) crossed = true;
    if (insideAnySolid(p.pos)) {
      check('F. never enters the large block while flying', false, `y=${p.pos.y.toFixed(2)} z=${p.pos.z.toFixed(2)}`);
      break;
    }
  }
  check('F. flies over the 6-unit block', crossed, `final z=${p.pos.z.toFixed(2)} maxOver=${maxOverBlock.toFixed(2)}`);
  check('F. clears the block top', maxOverBlock >= 6 - 1e-6, `maxY=${maxOverBlock.toFixed(3)}`);

  // stop flying over the block -> land on its top
  p.isFlying = false;
  for (let i = 0; i < 240; i++) {
    p.step(DT, new THREE.Vector3(0, 0, 0), 0);
    if (insideAnySolid(p.pos)) {
      check('F. lands on the block top after landing', false, `y=${p.pos.y.toFixed(2)}`);
      break;
    }
  }
  check(
    'F. lands exactly on the block top (y=6)',
    Math.abs(p.pos.y - 6) < 1e-6 && p.grounded,
    `y=${p.pos.y.toFixed(4)}`
  );
}

// -------------------------------------------- G: standing on a block, walk off
{
  const p = new Player();
  p.pos.set(-12, 6, -15); // top of the large block
  for (let i = 0; i < 200; i++) p.step(DT, new THREE.Vector3(1, 0, 0), 6.4);
  check(
    'G. leaves the block and lands on a surface below',
    p.pos.x > -9 && (Math.abs(p.pos.y) < 1e-6 || Math.abs(p.pos.y - 0.8) < 1e-6),
    `x=${p.pos.x.toFixed(2)} y=${p.pos.y.toFixed(4)}`
  );
  check('G. no fall-through below ground', p.pos.y >= -1e-9);
}

// ------------------------------------------- H: escape pre-existing penetration
{
  const p = new Player();
  p.pos.set(-12, 1, -15); // inside the large block
  p.step(DT, new THREE.Vector3(0, 0, -1), 6.4);
  check('H. escapes penetration out of a solid', !insideAnySolid(p.pos), `pos=${p.pos.x.toFixed(2)},${p.pos.y.toFixed(2)},${p.pos.z.toFixed(2)}`);
}

// -------------------------------------------- I: no jitter while idle on ground
{
  const p = new Player();
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 300; i++) {
    p.step(DT, new THREE.Vector3(0, 0, 0), 0);
    minY = Math.min(minY, p.pos.y);
    maxY = Math.max(maxY, p.pos.y);
  }
  check('I. perfectly stable when idle (no trembling)', minY === 0 && maxY === 0, `[${minY}, ${maxY}]`);
}

// ------------------------------- J: step up a 0.8 ledge without floating above
{
  const p = new Player();
  p.pos.set(14, 0, -11.9); // just outside the platform front edge (z=-12)
  p.step(DT, new THREE.Vector3(0, 0, -1), 6.4);
  check('J. steps up onto the 0.8 ledge in one move', Math.abs(p.pos.y - 0.8) < 1e-6, `y=${p.pos.y.toFixed(4)} z=${p.pos.z.toFixed(3)}`);
  check('J. does not float above the ledge', p.pos.y <= 0.8 + 1e-6);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
