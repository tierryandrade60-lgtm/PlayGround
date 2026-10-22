import * as THREE from 'three';

/**
 * 3D White Clay Humanoid Character Rig (R15 Articulated Rig)
 * 
 * Oriented facing forward (-Z) into the world/arena:
 * - Right side is at +X (casting hand aligns with right-hand HUD & reticle)
 * - Left side is at -X
 * - Forward is -Z (feet & gaze point forward)
 * - Backward is +Z (away from screen / towards camera)
 */

export interface StickmanNodes {
  root: THREE.Group;
  pelvis: THREE.Group;
  waistJoint: THREE.Group;
  upperTorso: THREE.Group;
  neckJoint: THREE.Group;
  head: THREE.Group;
  
  // Left arm (-X)
  leftShoulder: THREE.Group;
  leftUpperArm: THREE.Group;
  leftElbow: THREE.Group;
  leftLowerArm: THREE.Group;
  leftWrist: THREE.Group;
  leftHand: THREE.Group & { fingers?: THREE.Group[] };
  
  // Right arm (+X, casting hand)
  rightShoulder: THREE.Group;
  rightUpperArm: THREE.Group;
  rightElbow: THREE.Group;
  rightLowerArm: THREE.Group;
  rightWrist: THREE.Group;
  rightHand: THREE.Group & { fingers?: THREE.Group[] };

  // Articulated Hand Fingers
  fingers?: THREE.Group[];
  leftFingers?: THREE.Group[];
  rightFingers?: THREE.Group[];
  
  // Left leg (-X)
  leftHip: THREE.Group;
  leftUpperLeg: THREE.Group;
  leftKnee: THREE.Group;
  leftLowerLeg: THREE.Group;
  leftAnkle: THREE.Group;
  leftFoot: THREE.Group;
  
  // Right leg (+X)
  rightHip: THREE.Group;
  rightUpperLeg: THREE.Group;
  rightKnee: THREE.Group;
  rightLowerLeg: THREE.Group;
  rightAnkle: THREE.Group;
  rightFoot: THREE.Group;

  // Repulsor & Flight Thrusters
  thrusters: {
    leftFoot: ThrusterEffect;
    rightFoot: ThrusterEffect;
    leftHand: ThrusterEffect;
    rightHand: ThrusterEffect;
  };
}

export interface ThrusterEffect {
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  outerMesh: THREE.Mesh;
  light: THREE.PointLight;
  setIntensity: (intensity: number, customColor?: string | null) => void;
}

export function createStickmanRig(): StickmanNodes {
  const root = new THREE.Group();
  root.name = 'StickmanRoot';

  // Smooth clay porcelain material matching the reference image
  const clayMat = new THREE.MeshStandardMaterial({
    color: 0xedf0f4,
    roughness: 0.58,
    metalness: 0.04,
  });

  // Reusable capsule geometry helper for rounded clay limbs
  function createLimbMesh(radius: number, length: number): THREE.Mesh {
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 20, 24);
    const mesh = new THREE.Mesh(geo, clayMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = -length / 2;
    return mesh;
  }

  // --- LOWER TORSO (Pelvis) ---
  const pelvis = new THREE.Group();
  pelvis.name = 'LowerTorso';
  pelvis.position.y = 1.15;
  root.add(pelvis);

  // Lower torso mesh
  const lowerTorsoMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.125, 0.16, 20, 24),
    clayMat
  );
  lowerTorsoMesh.castShadow = true;
  lowerTorsoMesh.receiveShadow = true;
  lowerTorsoMesh.position.y = 0.08;
  pelvis.add(lowerTorsoMesh);

  // --- WAIST JOINT & UPPER TORSO ---
  const waistJoint = new THREE.Group();
  waistJoint.name = 'WaistJoint';
  waistJoint.position.set(0, 0.19, 0);
  pelvis.add(waistJoint);

  const upperTorso = new THREE.Group();
  upperTorso.name = 'UpperTorso';
  waistJoint.add(upperTorso);

  const upperTorsoMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.14, 0.28, 20, 24),
    clayMat
  );
  upperTorsoMesh.castShadow = true;
  upperTorsoMesh.receiveShadow = true;
  upperTorsoMesh.position.y = 0.17;
  upperTorso.add(upperTorsoMesh);

  // --- NECK & HEAD ---
  const neckJoint = new THREE.Group();
  neckJoint.name = 'NeckJoint';
  neckJoint.position.set(0, 0.35, 0);
  upperTorso.add(neckJoint);

  const neckMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.08, 0.10, 20),
    clayMat
  );
  neckMesh.castShadow = true;
  neckMesh.position.y = 0.04;
  neckJoint.add(neckMesh);

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0.12, 0);
  neckJoint.add(head);

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 36, 32),
    clayMat
  );
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.position.y = 0.22;
  head.add(headMesh);

  // --- LEFT ARM (-X) ---
  const leftShoulder = new THREE.Group();
  leftShoulder.name = 'LeftShoulder';
  leftShoulder.position.set(-0.18, 0.28, 0);
  upperTorso.add(leftShoulder);

  const leftUpperArm = new THREE.Group();
  leftUpperArm.name = 'LeftUpperArm';
  leftShoulder.add(leftUpperArm);
  const leftUpperArmMesh = createLimbMesh(0.058, 0.32);
  leftUpperArm.add(leftUpperArmMesh);

  const leftElbow = new THREE.Group();
  leftElbow.name = 'LeftElbow';
  leftElbow.position.set(0, -0.32, 0);
  leftUpperArm.add(leftElbow);

  const leftLowerArm = new THREE.Group();
  leftLowerArm.name = 'LeftLowerArm';
  leftElbow.add(leftLowerArm);
  const leftLowerArmMesh = createLimbMesh(0.052, 0.30);
  leftLowerArm.add(leftLowerArmMesh);

  const leftWrist = new THREE.Group();
  leftWrist.name = 'LeftWrist';
  leftWrist.position.set(0, -0.30, 0);
  leftLowerArm.add(leftWrist);

  const leftHand = new THREE.Group() as THREE.Group & { fingers?: THREE.Group[] };
  leftHand.name = 'LeftHand';
  leftWrist.add(leftHand);
  
  const leftHandPalm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.05, 0.06, 16, 16),
    clayMat
  );
  leftHandPalm.castShadow = true;
  leftHandPalm.position.y = -0.05;
  leftHand.add(leftHandPalm);

  const leftThumb = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.022, 0.04, 12, 12),
    clayMat
  );
  leftThumb.castShadow = true;
  // Thumb on left hand: points inward (+X) and slightly forward (-Z)
  leftThumb.position.set(0.038, -0.04, -0.02);
  leftThumb.rotation.z = -0.45;
  leftHand.add(leftThumb);

  // Helper for articulated fingers with rotation pivot at knuckle
  function createFingerNode(name: string, radius: number, length: number, posX: number, posY: number, posZ: number): THREE.Group {
    const fingerGroup = new THREE.Group();
    fingerGroup.name = name;
    fingerGroup.position.set(posX, posY, posZ);

    const fingerMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, Math.max(0.005, length - radius * 2), 12, 12),
      clayMat
    );
    fingerMesh.castShadow = true;
    fingerMesh.position.y = -length / 2;
    fingerGroup.add(fingerMesh);
    return fingerGroup;
  }

  // 4 Articulated fingers on left hand (Index, Middle, Ring, Pinky)
  const leftFingers: THREE.Group[] = [
    createFingerNode('LeftIndexFinger', 0.012, 0.046, 0.022, -0.08, -0.01),
    createFingerNode('LeftMiddleFinger', 0.012, 0.050, 0.007, -0.082, -0.01),
    createFingerNode('LeftRingFinger', 0.011, 0.046, -0.008, -0.08, -0.01),
    createFingerNode('LeftPinkyFinger', 0.010, 0.038, -0.022, -0.076, -0.01),
  ];
  leftFingers.forEach((f) => leftHand.add(f));
  leftHand.fingers = leftFingers;
  leftHand.userData.fingers = leftFingers;

  // --- RIGHT ARM (+X, Casting arm) ---
  const rightShoulder = new THREE.Group();
  rightShoulder.name = 'RightShoulder';
  rightShoulder.position.set(0.18, 0.28, 0);
  upperTorso.add(rightShoulder);

  const rightUpperArm = new THREE.Group();
  rightUpperArm.name = 'RightUpperArm';
  rightShoulder.add(rightUpperArm);
  const rightUpperArmMesh = createLimbMesh(0.058, 0.32);
  rightUpperArm.add(rightUpperArmMesh);

  const rightElbow = new THREE.Group();
  rightElbow.name = 'RightElbow';
  rightElbow.position.set(0, -0.32, 0);
  rightUpperArm.add(rightElbow);

  const rightLowerArm = new THREE.Group();
  rightLowerArm.name = 'RightLowerArm';
  rightElbow.add(rightLowerArm);
  const rightLowerArmMesh = createLimbMesh(0.052, 0.30);
  rightLowerArm.add(rightLowerArmMesh);

  const rightWrist = new THREE.Group();
  rightWrist.name = 'RightWrist';
  rightWrist.position.set(0, -0.30, 0);
  rightLowerArm.add(rightWrist);

  const rightHand = new THREE.Group() as THREE.Group & { fingers?: THREE.Group[] };
  rightHand.name = 'RightHand';
  rightWrist.add(rightHand);

  const rightHandPalm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.05, 0.06, 16, 16),
    clayMat
  );
  rightHandPalm.castShadow = true;
  rightHandPalm.position.y = -0.05;
  rightHand.add(rightHandPalm);

  const rightThumb = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.022, 0.04, 12, 12),
    clayMat
  );
  rightThumb.castShadow = true;
  // Thumb on right hand: points inward (-X) and slightly forward (-Z)
  rightThumb.position.set(-0.038, -0.04, -0.02);
  rightThumb.rotation.z = 0.45;
  rightHand.add(rightThumb);

  // 4 Articulated fingers on right hand (Index, Middle, Ring, Pinky)
  const rightFingers: THREE.Group[] = [
    createFingerNode('RightIndexFinger', 0.012, 0.046, -0.022, -0.08, -0.01),
    createFingerNode('RightMiddleFinger', 0.012, 0.050, -0.007, -0.082, -0.01),
    createFingerNode('RightRingFinger', 0.011, 0.046, 0.008, -0.08, -0.01),
    createFingerNode('RightPinkyFinger', 0.010, 0.038, 0.022, -0.076, -0.01),
  ];
  rightFingers.forEach((f) => rightHand.add(f));
  rightHand.fingers = rightFingers;
  rightHand.userData.fingers = rightFingers;

  // --- LEFT LEG (-X) ---
  const leftHip = new THREE.Group();
  leftHip.name = 'LeftHip';
  leftHip.position.set(-0.105, 0.02, 0);
  pelvis.add(leftHip);

  const leftUpperLeg = new THREE.Group();
  leftUpperLeg.name = 'LeftUpperLeg';
  leftHip.add(leftUpperLeg);
  const leftUpperLegMesh = createLimbMesh(0.072, 0.54);
  leftUpperLeg.add(leftUpperLegMesh);

  const leftKnee = new THREE.Group();
  leftKnee.name = 'LeftKnee';
  leftKnee.position.set(0, -0.54, 0);
  leftUpperLeg.add(leftKnee);

  const leftLowerLeg = new THREE.Group();
  leftLowerLeg.name = 'LeftLowerLeg';
  leftKnee.add(leftLowerLeg);
  const leftLowerLegMesh = createLimbMesh(0.064, 0.52);
  leftLowerLeg.add(leftLowerLegMesh);

  const leftAnkle = new THREE.Group();
  leftAnkle.name = 'LeftAnkle';
  leftAnkle.position.set(0, -0.52, 0);
  leftLowerLeg.add(leftAnkle);

  const leftFoot = new THREE.Group();
  leftFoot.name = 'LeftFoot';
  leftAnkle.add(leftFoot);
  // Rounded clay foot pointing forward (-Z)
  const leftFootGeo = new THREE.CapsuleGeometry(0.06, 0.14, 16, 16);
  const leftFootMesh = new THREE.Mesh(leftFootGeo, clayMat);
  leftFootMesh.castShadow = true;
  leftFootMesh.rotation.x = Math.PI / 2;
  leftFootMesh.position.set(0, -0.045, -0.07); // -Z forward!
  leftFoot.add(leftFootMesh);

  // --- RIGHT LEG (+X) ---
  const rightHip = new THREE.Group();
  rightHip.name = 'RightHip';
  rightHip.position.set(0.105, 0.02, 0);
  pelvis.add(rightHip);

  const rightUpperLeg = new THREE.Group();
  rightUpperLeg.name = 'RightUpperLeg';
  rightHip.add(rightUpperLeg);
  const rightUpperLegMesh = createLimbMesh(0.072, 0.54);
  rightUpperLeg.add(rightUpperLegMesh);

  const rightKnee = new THREE.Group();
  rightKnee.name = 'RightKnee';
  rightKnee.position.set(0, -0.54, 0);
  rightUpperLeg.add(rightKnee);

  const rightLowerLeg = new THREE.Group();
  rightLowerLeg.name = 'RightLowerLeg';
  rightKnee.add(rightLowerLeg);
  const rightLowerLegMesh = createLimbMesh(0.064, 0.52);
  rightLowerLeg.add(rightLowerLegMesh);

  const rightAnkle = new THREE.Group();
  rightAnkle.name = 'RightAnkle';
  rightAnkle.position.set(0, -0.52, 0);
  rightLowerLeg.add(rightAnkle);

  const rightFoot = new THREE.Group();
  rightFoot.name = 'RightFoot';
  rightAnkle.add(rightFoot);
  const rightFootGeo = new THREE.CapsuleGeometry(0.06, 0.14, 16, 16);
  const rightFootMesh = new THREE.Mesh(rightFootGeo, clayMat);
  rightFootMesh.castShadow = true;
  rightFootMesh.rotation.x = Math.PI / 2;
  rightFootMesh.position.set(0, -0.045, -0.07); // -Z forward!
  rightFoot.add(rightFootMesh);

  // --- REPULSOR & FLIGHT THRUSTERS ---
  function createThrusterEffect(): ThrusterEffect {
    const group = new THREE.Group();
    // Inner high-heat core cone
    const coreGeo = new THREE.ConeGeometry(0.045, 0.28, 10);
    coreGeo.translate(0, -0.14, 0); // apex at 0, flares to -0.28
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    // Outer plasma flare cone with additive glow
    const outerGeo = new THREE.ConeGeometry(0.09, 0.44, 10);
    outerGeo.translate(0, -0.22, 0);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x00e1ff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    group.add(outerMesh);

    const light = new THREE.PointLight(0x00e1ff, 0, 3.5);
    light.position.set(0, -0.15, 0);
    group.add(light);
    group.visible = false;

    const setIntensity = (intensity: number, customColor?: string | null) => {
      if (intensity <= 0.02) {
        group.visible = false;
        light.intensity = 0;
        return;
      }
      group.visible = true;
      const col = customColor ? new THREE.Color(customColor) : new THREE.Color(0x00d2ff);
      outerMat.color.copy(col);
      light.color.copy(col);
      light.intensity = Math.min(2.5, intensity * 1.8);
      const s = THREE.MathUtils.clamp(intensity, 0.4, 2.2);
      const flicker = 1.0 + (Math.random() - 0.5) * 0.18;
      outerMesh.scale.set(s * flicker, s * flicker * 1.1, s * flicker);
      coreMesh.scale.set(s * 0.75, s * 0.85 * flicker, s * 0.75);
    };

    return { group, coreMesh, outerMesh, light, setIntensity };
  }

  const leftFootThruster = createThrusterEffect();
  leftFootThruster.group.position.set(0, -0.06, -0.02);
  leftFootThruster.group.rotation.x = 0.22; // slight backward angle for propulsion
  leftFoot.add(leftFootThruster.group);

  const rightFootThruster = createThrusterEffect();
  rightFootThruster.group.position.set(0, -0.06, -0.02);
  rightFootThruster.group.rotation.x = 0.22;
  rightFoot.add(rightFootThruster.group);

  const leftHandThruster = createThrusterEffect();
  leftHandThruster.group.position.set(0, -0.08, 0);
  leftHandThruster.group.rotation.x = Math.PI / 2; // points out from palm
  leftHand.add(leftHandThruster.group);

  const rightHandThruster = createThrusterEffect();
  rightHandThruster.group.position.set(0, -0.08, 0);
  rightHandThruster.group.rotation.x = Math.PI / 2;
  rightHand.add(rightHandThruster.group);

  const thrusters = {
    leftFoot: leftFootThruster,
    rightFoot: rightFootThruster,
    leftHand: leftHandThruster,
    rightHand: rightHandThruster,
  };

  return {
    root,
    pelvis,
    waistJoint,
    upperTorso,
    neckJoint,
    head,
    leftShoulder,
    leftUpperArm,
    leftElbow,
    leftLowerArm,
    leftWrist,
    leftHand,
    rightShoulder,
    rightUpperArm,
    rightElbow,
    rightLowerArm,
    rightWrist,
    rightHand,
    leftHip,
    leftUpperLeg,
    leftKnee,
    leftLowerLeg,
    leftAnkle,
    leftFoot,
    rightHip,
    rightUpperLeg,
    rightKnee,
    rightLowerLeg,
    rightAnkle,
    rightFoot,
    thrusters,
    fingers: [...leftFingers, ...rightFingers],
    leftFingers,
    rightFingers,
  };
}
