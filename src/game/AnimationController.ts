import * as THREE from 'three';
import { StickmanNodes } from './StickmanRig';

export class AnimationController {
  private nodes: StickmanNodes;
  private walkPhase: number = 0;
  private idleTime: number = 0;
  private walkBlend: number = 0; // 0 = idle, 1 = walk

  // Attack animation state
  private isAttacking: boolean = false;
  private attackTime: number = 0;
  private readonly attackDuration: number = 0.42;
  private attackAimPitch: number = 0;
  private attackReleased: boolean = false;
  private onAttackRelease: (() => void) | null = null;

  // Rapid repulsor / arcane arm-raising animation state
  private isRepulsorActive: boolean = false;
  private repulsorHand: 'left' | 'right' = 'right';
  private repulsorTime: number = 0;
  private readonly repulsorDuration: number = 0.22;
  private repulsorPitch: number = 0;

  // Sustained ability poses (Iron Man & Agatha Harkness)
  public dualBeamActive: boolean = false;
  public dualBeamPitch: number = 0;
  public spinningLasersActive: boolean = false;
  public darkDrainActive: boolean = false;
  public arcaneChokeActive: boolean = false;
  public chaosOrbActive: boolean = false;
  public chaosOrbTime: number = 0;
  public runicWardActive: boolean = false;
  public runicWardTime: number = 0;
  public isAgatha: boolean = false;

  // Flight & Dash locomotion states
  public isFlying: boolean = false;
  public flightBlend: number = 0; // 0 = ground, 1 = flying
  public flightRoll: number = 0; // banking into turns
  public isDashing: boolean = false;

  // Base pelvis height when standing
  private readonly basePelvisY: number = 1.15;

  // Kinematic smoothing state
  private smoothedSpeed: number = 0;

  constructor(nodes: StickmanNodes) {
    this.nodes = nodes;
  }

  public triggerRepulsor(hand: 'left' | 'right', aimPitch: number): void {
    this.isRepulsorActive = true;
    this.repulsorHand = hand;
    this.repulsorTime = 0;
    this.repulsorPitch = THREE.MathUtils.clamp(aimPitch, -0.6, 0.6);
  }

  public triggerAttack(aimPitch: number, onRelease: () => void): void {
    this.isAttacking = true;
    this.attackTime = 0;
    this.attackAimPitch = THREE.MathUtils.clamp(aimPitch, -0.6, 0.6);
    this.attackReleased = false;
    this.onAttackRelease = onRelease;
  }

  public triggerChaosOrb(aimPitch: number): void {
    this.chaosOrbActive = true;
    this.chaosOrbTime = 0;
    this.attackAimPitch = THREE.MathUtils.clamp(aimPitch, -0.6, 0.6);
  }

  public triggerRunicWard(): void {
    this.runicWardActive = true;
    this.runicWardTime = 0;
  }

  public getIsAttacking(): boolean {
    return this.isAttacking;
  }

  /**
   * Applies realistic finger curling to a hand's fingers or nodes.
   * Safe against missing fingers, non-iterable structures, null inputs, or varying rig structures.
   */
  public applyFingerCurl(handOrSide?: any, curlAmount: number = 0): void {
    try {
      let fingers: any[] = [];
      if (Array.isArray(handOrSide)) {
        fingers = handOrSide;
      } else if (handOrSide && Array.isArray(handOrSide.fingers)) {
        fingers = handOrSide.fingers;
      } else if (handOrSide && Array.isArray(handOrSide.userData?.fingers)) {
        fingers = handOrSide.userData.fingers;
      } else if (handOrSide === 'left' || handOrSide === this.nodes?.leftHand) {
        fingers = (this.nodes?.leftHand as any)?.fingers || (this.nodes as any)?.leftFingers || [];
      } else if (handOrSide === 'right' || handOrSide === this.nodes?.rightHand) {
        fingers = (this.nodes?.rightHand as any)?.fingers || (this.nodes as any)?.rightFingers || [];
      } else if (this.nodes) {
        fingers = (this.nodes as any).fingers || [];
      }

      if (!fingers || !Array.isArray(fingers)) {
        return;
      }

      for (const finger of fingers) {
        if (finger && finger.rotation) {
          finger.rotation.x = THREE.MathUtils.lerp(finger.rotation.x || 0, curlAmount, 0.35);
        }
      }
    } catch {
      // Safe guard: animation loop should never crash on finger styling
    }
  }

  /**
   * Updates animations with organic kinematic damping, spinal contrapposto,
   * natural breathing weight, fluid leg strides, and dynamic combat follow-through.
   */
  public update(dt: number, speed: number): void {
    this.idleTime += dt;
    this.smoothedSpeed = THREE.MathUtils.damp(this.smoothedSpeed, speed, 12.0, dt);

    // Smoothly blend between Idle, Walk, and Flight states
    const targetWalkBlend = (!this.isFlying && this.smoothedSpeed > 0.03) ? Math.min(1.0, this.smoothedSpeed) : 0;
    const blendSpeed = targetWalkBlend > this.walkBlend ? 9.0 : 7.0;
    this.walkBlend = THREE.MathUtils.damp(this.walkBlend, targetWalkBlend, blendSpeed, dt);

    const targetFlightBlend = this.isFlying ? 1.0 : 0.0;
    this.flightBlend = THREE.MathUtils.damp(this.flightBlend, targetFlightBlend, 8.5, dt);

    // Advance walk cycle phase proportional to actual movement speed with organic foot cadence
    if (this.walkBlend > 0.001) {
      const cadence = (7.4 + this.smoothedSpeed * 2.2) * Math.max(0.35, this.smoothedSpeed);
      this.walkPhase += cadence * dt;
    }

    const t = this.idleTime;
    const phi = this.walkPhase;
    const blend = this.walkBlend;
    const invBlend = 1 - blend;

    // ==========================================
    // 1. ORGANIC IDLE POSE (Fluid Breathing & Natural Sway)
    // ==========================================
    const breath = Math.sin(t * 1.8);
    const slowSway = Math.sin(t * 0.9);
    const microJitter = Math.cos(t * 3.1) * 0.002;

    // Agatha floating occult idle vs classic/ironman grounded stance
    const agathaFloat = this.isAgatha ? Math.sin(t * 2.2) * 0.035 : 0;
    const idlePelvisY = this.basePelvisY + breath * 0.012 + agathaFloat;
    const idlePelvisX = slowSway * 0.008 + microJitter;
    const idlePelvisRotZ = slowSway * 0.018;
    const idlePelvisRotY = slowSway * 0.022;

    // Torso contrapposto breathing: chest expands, shoulders relax
    const idleWaistRotX = -breath * 0.032 - (this.isAgatha ? 0.05 : 0);
    const idleWaistRotY = -idlePelvisRotY * 0.6;
    const idleWaistRotZ = -idlePelvisRotZ * 0.6;

    // Head idle tracks horizon gently
    const idleHeadRotX = breath * 0.022;
    const idleHeadRotY = -slowSway * 0.028;

    // Arms idle: curved elbows, soft wrist drape, relaxed fingers
    const agathaArmSpread = this.isAgatha ? 0.18 : 0;
    const agathaWristCurl = this.isAgatha ? Math.sin(t * 2.5) * 0.15 : 0;

    // Left arm (-X)
    const idleLeftShoulderRotX = breath * 0.03 + (this.isAgatha ? 0.22 : 0);
    const idleLeftShoulderRotZ = -0.14 - breath * 0.018 - agathaArmSpread;
    const idleLeftElbowRotX = 0.26 - breath * 0.025 + (this.isAgatha ? 0.35 : 0);
    const idleLeftWristRotX = -0.06 + agathaWristCurl;

    // Right arm (+X)
    const idleRightShoulderRotX = breath * 0.03 + (this.isAgatha ? 0.22 : 0);
    const idleRightShoulderRotZ = 0.14 + breath * 0.018 + agathaArmSpread;
    const idleRightElbowRotX = 0.26 - breath * 0.025 + (this.isAgatha ? 0.35 : 0);
    const idleRightWristRotX = -0.06 - agathaWristCurl;

    // Legs idle: grounded with natural slight knee flex
    const idleLeftHipRotX = 0.02;
    const idleLeftKneeRotX = -0.04;
    const idleLeftAnkleRotX = 0.02;

    const idleRightHipRotX = 0.02;
    const idleRightKneeRotX = -0.04;
    const idleRightAnkleRotX = 0.02;

    // ==========================================
    // 2. FLUID STRIDE LOCOMOTION (Facing -Z)
    // ==========================================
    // Pelvis walk: vertical bounce and dynamic hip roll
    const walkBounce = -0.042 * Math.abs(Math.sin(phi));
    const walkPelvisY = this.basePelvisY + walkBounce;
    const walkPelvisX = Math.sin(phi) * 0.024;
    const walkPelvisRotY = -Math.sin(phi) * 0.11;
    const walkPelvisRotZ = Math.sin(phi) * 0.035;

    // Torso lean into motion & contrapposto spinal twist
    const walkWaistRotX = -0.08 - this.smoothedSpeed * 0.05;
    const walkWaistRotY = Math.sin(phi) * 0.12;
    const walkWaistRotZ = -Math.sin(phi) * 0.025;

    // Head balances counter-twist for steady horizon gaze
    const walkHeadRotX = 0.04;
    const walkHeadRotY = -walkWaistRotY * 0.55;

    // Leg stride: smooth sine stride with progressive knee bending & toe rolling
    const strideAmp = 0.62;

    // Right Leg (+X)
    const walkRightHipRotX = Math.sin(phi) * strideAmp;
    const rightSwing = Math.max(0, Math.sin(phi + 0.32));
    const walkRightKneeRotX = -Math.pow(rightSwing, 1.6) * 0.95;
    const walkRightAnkleRotX = Math.sin(phi) * 0.24 - 0.06;

    // Left Leg (-X) (opposite phase)
    const walkLeftHipRotX = -Math.sin(phi) * strideAmp;
    const leftSwing = Math.max(0, -Math.sin(phi - 0.32));
    const walkLeftKneeRotX = -Math.pow(leftSwing, 1.6) * 0.95;
    const walkLeftAnkleRotX = -Math.sin(phi) * 0.24 - 0.06;

    // Arms: coordinated opposite to legs with secondary elbow lag
    const armSwingAmp = 0.55;
    const walkRightShoulderRotX = -Math.sin(phi) * armSwingAmp;
    const walkRightShoulderRotZ = 0.16;
    const walkRightElbowRotX = 0.32 + Math.max(0, -Math.sin(phi)) * 0.42;

    const walkLeftShoulderRotX = Math.sin(phi) * armSwingAmp;
    const walkLeftShoulderRotZ = -0.16;
    const walkLeftElbowRotX = 0.32 + Math.max(0, Math.sin(phi)) * 0.42;

    const leftWristRotX = Math.cos(phi) * 0.15;
    const rightWristRotX = -Math.cos(phi) * 0.15;

    // Blend base locomotion into rig nodes
    const n = this.nodes;

    n.pelvis.position.y = idlePelvisY * invBlend + walkPelvisY * blend;
    n.pelvis.position.x = idlePelvisX * invBlend + walkPelvisX * blend;
    n.pelvis.rotation.y = idlePelvisRotY * invBlend + walkPelvisRotY * blend;
    n.pelvis.rotation.z = idlePelvisRotZ * invBlend + walkPelvisRotZ * blend;

    let targetWaistRotX = idleWaistRotX * invBlend + walkWaistRotX * blend;
    let targetWaistRotY = idleWaistRotY * invBlend + walkWaistRotY * blend;
    let targetWaistRotZ = idleWaistRotZ * invBlend + walkWaistRotZ * blend;

    let targetHeadRotX = idleHeadRotX * invBlend + walkHeadRotX * blend;
    let targetHeadRotY = idleHeadRotY * invBlend + walkHeadRotY * blend;

    // Left Arm base
    let targetLeftShoulderRotX = idleLeftShoulderRotX * invBlend + walkLeftShoulderRotX * blend;
    let targetLeftShoulderRotY = 0;
    let targetLeftShoulderRotZ = idleLeftShoulderRotZ * invBlend + walkLeftShoulderRotZ * blend;
    let targetLeftElbowRotX = idleLeftElbowRotX * invBlend + walkLeftElbowRotX * blend;
    let targetLeftWristRotX = idleLeftWristRotX * invBlend + leftWristRotX * blend;

    // Right Arm base
    let targetRightShoulderRotX = idleRightShoulderRotX * invBlend + walkRightShoulderRotX * blend;
    let targetRightShoulderRotY = 0;
    let targetRightShoulderRotZ = idleRightShoulderRotZ * invBlend + walkRightShoulderRotZ * blend;
    let targetRightElbowRotX = idleRightElbowRotX * invBlend + walkRightElbowRotX * blend;
    let targetRightWristRotX = idleRightWristRotX * invBlend + rightWristRotX * blend;

    // Legs
    n.leftHip.rotation.x = idleLeftHipRotX * invBlend + walkLeftHipRotX * blend;
    n.leftKnee.rotation.x = idleLeftKneeRotX * invBlend + walkLeftKneeRotX * blend;
    n.leftAnkle.rotation.x = idleLeftAnkleRotX * invBlend + walkLeftAnkleRotX * blend;

    n.rightHip.rotation.x = idleRightHipRotX * invBlend + walkRightHipRotX * blend;
    n.rightKnee.rotation.x = idleRightKneeRotX * invBlend + walkRightKneeRotX * blend;
    n.rightAnkle.rotation.x = idleRightAnkleRotX * invBlend + walkRightAnkleRotX * blend;

    // ==========================================
    // 3. FLIGHT & DASH LOCOMOTION LAYER
    // ==========================================
    const fb = this.flightBlend;
    if (fb > 0.001) {
      const flightLegPitch = -0.32 - (this.isDashing ? 0.45 : this.smoothedSpeed * 0.28);
      n.leftHip.rotation.x = THREE.MathUtils.lerp(n.leftHip.rotation.x, flightLegPitch, fb);
      n.rightHip.rotation.x = THREE.MathUtils.lerp(n.rightHip.rotation.x, flightLegPitch, fb);
      n.leftKnee.rotation.x = THREE.MathUtils.lerp(n.leftKnee.rotation.x, -0.15, fb);
      n.rightKnee.rotation.x = THREE.MathUtils.lerp(n.rightKnee.rotation.x, -0.15, fb);
      n.leftAnkle.rotation.x = THREE.MathUtils.lerp(n.leftAnkle.rotation.x, 0.45, fb);
      n.rightAnkle.rotation.x = THREE.MathUtils.lerp(n.rightAnkle.rotation.x, 0.45, fb);

      if (!this.isAttacking && !this.isRepulsorActive && !this.dualBeamActive && !this.spinningLasersActive && !this.chaosOrbActive && !this.runicWardActive) {
        const armFlightX = -0.36 - (this.isDashing ? 0.55 : this.smoothedSpeed * 0.32);
        targetLeftShoulderRotX = THREE.MathUtils.lerp(targetLeftShoulderRotX, armFlightX, fb);
        targetLeftShoulderRotZ = THREE.MathUtils.lerp(targetLeftShoulderRotZ, -0.24, fb);
        targetLeftElbowRotX = THREE.MathUtils.lerp(targetLeftElbowRotX, 0.18, fb);
        targetLeftWristRotX = THREE.MathUtils.lerp(targetLeftWristRotX, -0.24, fb);

        targetRightShoulderRotX = THREE.MathUtils.lerp(targetRightShoulderRotX, armFlightX, fb);
        targetRightShoulderRotZ = THREE.MathUtils.lerp(targetRightShoulderRotZ, 0.24, fb);
        targetRightElbowRotX = THREE.MathUtils.lerp(targetRightElbowRotX, 0.18, fb);
        targetRightWristRotX = THREE.MathUtils.lerp(targetRightWristRotX, -0.24, fb);
      }

      const forwardLean = -0.36 * (this.isDashing ? 1.6 : Math.max(0.22, this.smoothedSpeed));
      targetWaistRotX = THREE.MathUtils.lerp(targetWaistRotX, forwardLean, fb);
      targetHeadRotX = THREE.MathUtils.lerp(targetHeadRotX, -forwardLean * 0.8, fb);

      n.pelvis.rotation.z += this.flightRoll * fb;
      targetWaistRotZ += this.flightRoll * 0.48 * fb;
    }

    // ==========================================
    // 4. ATTACK ANIMATION LAYER (Smooth Thrust & Recoil)
    // ==========================================
    if (this.isAttacking) {
      this.attackTime += dt;
      const progress = this.attackTime / this.attackDuration;

      if (this.attackTime >= 0.12 && !this.attackReleased) {
        this.attackReleased = true;
        if (this.onAttackRelease) {
          this.onAttackRelease();
        }
      }

      if (progress < 0.28) {
        // Anticipation windup
        const p = progress / 0.28;
        const w = Math.sin(p * Math.PI * 0.5);
        targetRightShoulderRotX = THREE.MathUtils.lerp(targetRightShoulderRotX, -0.48, w);
        targetRightShoulderRotZ = THREE.MathUtils.lerp(targetRightShoulderRotZ, 0.30, w);
        targetRightElbowRotX = THREE.MathUtils.lerp(targetRightElbowRotX, 1.30, w);
        targetLeftShoulderRotX = THREE.MathUtils.lerp(targetLeftShoulderRotX, 0.25, w);
        targetWaistRotY -= 0.22 * w;
        targetWaistRotX += 0.08 * w;
      } else if (progress < 0.55) {
        // Dynamic forward thrust
        const p = (progress - 0.28) / 0.27;
        const smoothP = p * p * (3 - 2 * p); // Smoothstep curve
        const castArmX = 1.48 + this.attackAimPitch;
        targetRightShoulderRotX = THREE.MathUtils.lerp(-0.48, castArmX, smoothP);
        targetRightShoulderRotY = 0.12;
        targetRightShoulderRotZ = 0.06;
        targetRightElbowRotX = THREE.MathUtils.lerp(1.30, 0.06, smoothP);
        targetRightWristRotX = -0.22;
        targetLeftShoulderRotX = THREE.MathUtils.lerp(0.25, -0.32, smoothP);
        targetLeftElbowRotX = 0.65;
        targetWaistRotY += 0.26 * smoothP;
        targetWaistRotX -= 0.12 * smoothP;
        targetHeadRotX += this.attackAimPitch * 0.45;
      } else if (progress <= 1.0) {
        // Natural follow-through recovery
        const p = (progress - 0.55) / 0.45;
        const decay = 1 - Math.sin(p * Math.PI * 0.5);
        const castArmX = 1.48 + this.attackAimPitch;
        targetRightShoulderRotX = THREE.MathUtils.lerp(targetRightShoulderRotX, castArmX, decay);
        targetRightShoulderRotY = THREE.MathUtils.lerp(0, 0.12, decay);
        targetRightShoulderRotZ = THREE.MathUtils.lerp(targetRightShoulderRotZ, 0.06, decay);
        targetRightElbowRotX = THREE.MathUtils.lerp(targetRightElbowRotX, 0.06, decay);
        targetWaistRotY += 0.26 * decay;
      } else {
        this.isAttacking = false;
      }
    }

    // Fast repulsor / arcane arm-raising
    if (this.isRepulsorActive) {
      this.repulsorTime += dt;
      if (this.repulsorTime >= this.repulsorDuration) {
        this.isRepulsorActive = false;
      } else {
        const p = this.repulsorTime / this.repulsorDuration;
        const w = Math.sin(p * Math.PI);
        if (this.repulsorHand === 'right') {
          targetRightShoulderRotX = THREE.MathUtils.lerp(targetRightShoulderRotX, 1.48 + this.repulsorPitch, w);
          targetRightShoulderRotY = THREE.MathUtils.lerp(targetRightShoulderRotY, 0.08, w);
          targetRightShoulderRotZ = THREE.MathUtils.lerp(targetRightShoulderRotZ, 0.06, w);
          targetRightElbowRotX = THREE.MathUtils.lerp(targetRightElbowRotX, 0.08, w);
          targetRightWristRotX = THREE.MathUtils.lerp(targetRightWristRotX, -0.22, w);
          targetWaistRotY += 0.10 * w;
        } else {
          targetLeftShoulderRotX = THREE.MathUtils.lerp(targetLeftShoulderRotX, 1.48 + this.repulsorPitch, w);
          targetLeftShoulderRotY = THREE.MathUtils.lerp(targetLeftShoulderRotY, -0.08, w);
          targetLeftShoulderRotZ = THREE.MathUtils.lerp(targetLeftShoulderRotZ, -0.06, w);
          targetLeftElbowRotX = THREE.MathUtils.lerp(targetLeftElbowRotX, 0.08, w);
          targetLeftWristRotX = THREE.MathUtils.lerp(targetLeftWristRotX, -0.22, w);
          targetWaistRotY -= 0.10 * w;
        }
      }
    }

    // ==========================================
    // 5. ABILITY POSES (Dual Beam, Lasers, Chaos Orb, Runic Ward, Choke)
    // ==========================================
    if (this.dualBeamActive) {
      const beamElev = this.dualBeamPitch;
      targetRightShoulderRotX = 1.48 + beamElev;
      targetRightShoulderRotY = 0.05;
      targetRightShoulderRotZ = 0.06;
      targetRightElbowRotX = 0.06;
      targetRightWristRotX = -0.15;

      targetLeftShoulderRotX = 1.48 + beamElev;
      targetLeftShoulderRotY = -0.05;
      targetLeftShoulderRotZ = -0.06;
      targetLeftElbowRotX = 0.06;
      targetLeftWristRotX = -0.15;

      targetWaistRotX = -0.08;
      targetHeadRotX = beamElev * 0.4;
    } else if (this.spinningLasersActive) {
      targetRightShoulderRotX = 0;
      targetRightShoulderRotY = 0;
      targetRightShoulderRotZ = 1.50;
      targetRightElbowRotX = 0.02;

      targetLeftShoulderRotX = 0;
      targetLeftShoulderRotY = 0;
      targetLeftShoulderRotZ = -1.50;
      targetLeftElbowRotX = 0.02;
    } else if (this.darkDrainActive) {
      const drainPulse = Math.sin(t * 14) * 0.08;
      targetRightShoulderRotX = 1.38 + drainPulse;
      targetRightShoulderRotY = 0.25;
      targetRightShoulderRotZ = 0.35;
      targetRightElbowRotX = 0.35;
      targetRightWristRotX = -0.30;

      targetLeftShoulderRotX = 1.38 + drainPulse;
      targetLeftShoulderRotY = -0.25;
      targetLeftShoulderRotZ = -0.35;
      targetLeftElbowRotX = 0.35;
      targetLeftWristRotX = -0.30;

      targetWaistRotX = -0.15;
      targetHeadRotX = 0.18;
    } else if (this.arcaneChokeActive) {
      const chokeTremor = (Math.random() - 0.5) * 0.04;
      targetRightShoulderRotX = 1.58 + chokeTremor;
      targetRightShoulderRotY = 0.08;
      targetRightShoulderRotZ = 0.14;
      targetRightElbowRotX = 0.12;
      targetRightWristRotX = -0.38;

      targetLeftShoulderRotX = 1.58 - chokeTremor;
      targetLeftShoulderRotY = -0.08;
      targetLeftShoulderRotZ = -0.14;
      targetLeftElbowRotX = 0.12;
      targetLeftWristRotX = -0.38;

      targetWaistRotX = -0.05;
      targetHeadRotX = 0.22;
    }

    // Apply upper body rotations
    n.waistJoint.rotation.x = targetWaistRotX;
    n.waistJoint.rotation.y = targetWaistRotY;
    n.waistJoint.rotation.z = targetWaistRotZ;

    n.head.rotation.x = targetHeadRotX;
    n.head.rotation.y = targetHeadRotY;

    n.leftShoulder.rotation.x = targetLeftShoulderRotX;
    n.leftShoulder.rotation.y = targetLeftShoulderRotY;
    n.leftShoulder.rotation.z = targetLeftShoulderRotZ;
    n.leftElbow.rotation.x = targetLeftElbowRotX;
    n.leftWrist.rotation.x = targetLeftWristRotX;

    n.rightShoulder.rotation.x = targetRightShoulderRotX;
    n.rightShoulder.rotation.y = targetRightShoulderRotY;
    n.rightShoulder.rotation.z = targetRightShoulderRotZ;
    n.rightElbow.rotation.x = targetRightElbowRotX;
    n.rightWrist.rotation.x = targetRightWristRotX;

    // Articulated finger curling based on locomotion and active spells
    let leftFingerCurl = 0.22;
    let rightFingerCurl = 0.22;
    if (this.isFlying) {
      leftFingerCurl = 0.10;
      rightFingerCurl = 0.10;
    }
    if (this.isRepulsorActive) {
      if (this.repulsorHand === 'right') rightFingerCurl = -0.12;
      else leftFingerCurl = -0.12;
    }
    if (this.isAgatha) {
      leftFingerCurl = 0.38 + Math.sin(t * 3.2) * 0.12;
      rightFingerCurl = 0.38 + Math.cos(t * 3.2) * 0.12;
    }
    if (this.arcaneChokeActive) {
      leftFingerCurl = 0.82;
      rightFingerCurl = 0.82;
    }
    this.applyFingerCurl(n.leftHand, leftFingerCurl);
    this.applyFingerCurl(n.rightHand, rightFingerCurl);
  }
}
