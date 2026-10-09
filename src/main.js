import * as THREE from "three";
import {VRButton} from "three/addons/webxr/VRButton.js";

let scene, camera, renderer, target;
let world, rig;
let controller0, controller1; 
let grip0, grip1;
let mini, marker;
let isDraggingMarker = false;

const DEBUG_WIM_LINE = false;
let debugLine = null;

function addBox(group, width, height, depth, x, y, z, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function createHouse(world) {
  const houseGroup = new THREE.Group();
  world.add(houseGroup);

  addBox(houseGroup, 10, 0.1, 5.0,  0.0, 0.0, -2.5, 0x2c3e50);
  addBox(houseGroup,  5, 0.1, 5.0, -2.5, 0.0,  2.5, 0x8b5a2b);
  addBox(houseGroup,  5, 0.1, 5.0,  2.5, 0.0,  2.5, 0xbdc3c7);

  const wallColor = 0xf5f6fa;
  addBox(houseGroup, 10.4, 2.5,  0.2,  0.0, 1.25, -5.1, wallColor); 
  addBox(houseGroup, 10.4, 2.5,  0.2,  0.0, 1.25,  5.1, wallColor);  
  addBox(houseGroup,  0.2, 2.5, 10.4, -5.1, 1.25,  0.0, wallColor); 
  addBox(houseGroup,  0.2, 2.5, 10.4,  5.1, 1.25,  0.0, wallColor);

  addBox(houseGroup, 3.5, 2.5, 0.2, -3.25, 1.25, 0.0, 0xaaddff);
  addBox(houseGroup, 3.0, 2.5, 0.2,  0.0,  1.25, 0.0, 0xaaddff);
  addBox(houseGroup, 2.5, 2.5, 0.2,  3.75, 1.25, 0.0, 0xaaddff);

  addBox(houseGroup, 0.2, 2.5, 1.5, 0.0, 1.25, 0.75, wallColor);
  addBox(houseGroup, 0.2, 2.5, 2.0, 0.0, 1.25, 4.0,  wallColor);

  addBox(houseGroup, 2.5, 0.5, 3.5, -3.5, 0.25, -3.0, 0x34495e);
  addBox(houseGroup, 2.0, 0.1, 0.8, -3.5, 0.55, -4.2, 0xffffff);

  addBox(houseGroup, 1.0, 0.8, 3.0, -4.5, 0.4, 2.5, 0x8e44ad); 
  addBox(houseGroup, 0.4, 0.6, 2.5, -0.5, 0.3, 2.5, 0x2c3e50); 
  addBox(houseGroup, 0.1, 1.0, 2.0, -0.5, 1.1, 2.5, 0x000000);

  addBox(houseGroup, 2.5, 0.9, 1.0, 2.5, 0.45, 2.5, 0xd35400);
  addBox(houseGroup, 1.2, 2.0, 1.2, 4.2, 1.0,  0.8, 0x7f8c8d);
}

function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  const world = new THREE.Group();
  scene.add(world);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 4, 3);
  scene.add(dirLight);

  scene.add(new THREE.GridHelper(30, 30, 0x444444, 0x2a2a2a));

  createHouse(world);

  // Beacon (Waypoint)
  const beaconGroup = new THREE.Group();
  beaconGroup.name = 'beacon';
  
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0x00dd00,
    transparent: true,
    opacity: 0.6,
    emissive: 0x005500
  });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5), beaconMaterial);
  pole.position.y = 1.25;
  beaconGroup.add(pole);

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(CONFIRM_RADIUS, 0.05, 16, 64), beaconMaterial);
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.05;
  beaconGroup.add(outerRing);

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(CONFIRM_RADIUS * 0.5, 0.03, 16, 64), beaconMaterial);
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.05;
  beaconGroup.add(innerRing);

  world.add(beaconGroup);

  return { scene, world, target: beaconGroup };
}

function main() {
  ({ scene, world, target } = buildScene());

  rig = new THREE.Group();
  scene.add(rig);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 100);
  camera.position.set(0.0, 1.6, 2);
  camera.lookAt(0, 0.5, 0);
  rig.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  renderer.xr.enabled = true;
  document.body.appendChild(VRButton.createButton(renderer));

  controller0 = renderer.xr.getController(0);
  controller1 = renderer.xr.getController(1);
  rig.add(controller0, controller1);

  grip0 = renderer.xr.getControllerGrip(0); // Left  (Esquerda)
  grip1 = renderer.xr.getControllerGrip(1); // Right (Direita)
  rig.add(grip0, grip1);

  buildWIM();

  controller1.addEventListener('selectstart', onWIMGrab);
  controller1.addEventListener('selectend',   onWIMRelease);


  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  startTrial();
  renderer.setAnimationLoop(animate);
}

// ---------------------------------------------------------------------------
// Target-pose generation
// ---------------------------------------------------------------------------

const TARGET_BOUNDS = {
  x: [-4.0, 4.0],
  y: [ 0.0, 0.0],
  z: [-4.0, 4.0],
};

function randomInRange([min, max]) {
  return min + Math.random() * (max - min);
}

function generateTargetPose() {
  target.position.set(
    randomInRange(TARGET_BOUNDS.x),
    randomInRange(TARGET_BOUNDS.y),
    randomInRange(TARGET_BOUNDS.z)
  );
}

// ---------------------------------------------------------------------------
// Tolerance check — provided
// ---------------------------------------------------------------------------

const CONFIRM_RADIUS = 1.2;
const tmpCameraPos = new THREE.Vector3();

function checkTolerance() {
  camera.getWorldPosition(tmpCameraPos);

  const dx = tmpCameraPos.x - target.position.x;
  const dz = tmpCameraPos.z - target.position.z;
  const positionError = Math.sqrt(dx * dx + dz * dz);
  const withinTolerance = positionError <= CONFIRM_RADIUS;

  return { positionError, orientationErrorDeg: 0, withinTolerance };
}

// ---------------------------------------------------------------------------
// HUD references
// ---------------------------------------------------------------------------

const participantIdInput = document.getElementById("participantId");
const mappingSelect = document.getElementById("mappingSelect");
const trialCountEl = document.getElementById("trialCount");
const confirmBtn = document.getElementById("confirmBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");

// ---------------------------------------------------------------------------
// Trial state machine
// ---------------------------------------------------------------------------

let trialNumber = 0, pathLength = 0, modeSwitches = 0;
let presentationOrderByMapping = { 1: 0, 2: 0 };
let trialStartTime = performance.now();

let lastCameraPosition = new THREE.Vector3();
let trialStartCameraPosition = new THREE.Vector3();

const rows = [];
const CSV_HEADER = [
  "participant_id",
  "mapping",
  "trial_number",
  "presentation_order",
  "completion_time_s",
  "path_length",
  "straight_line_distance",
  "path_ratio"
];

function startTrial() {
  trialStartTime = performance.now();
  pathLength = 0;
  modeSwitches = 0;

  generateTargetPose();

  if(typeof mini !== "undefined") {
    const miniBeacon = mini.getObjectByName('beacon');
    if(miniBeacon) {
      miniBeacon.position.copy(target.position);
    }
  }

  camera.getWorldPosition(trialStartCameraPosition);
  lastCameraPosition.copy(trialStartCameraPosition);
  trialCountEl.textContent = `Trial ${trialNumber + 1}`;
}

function confirmTrial() {
  const { withinTolerance } = checkTolerance();
  if(!withinTolerance) return;

  const completionTimeS = (performance.now() - trialStartTime) / 1000;
  const mapping = mappingSelect.value;

  const straightLineDist = trialStartCameraPosition.distanceTo(target.position);
  const pathRatio = (straightLineDist > 0) ? (pathLength / straightLineDist) : 1.0;

  trialNumber++;
  presentationOrderByMapping[mapping] = (presentationOrderByMapping[mapping] || 0) + 1;

  rows.push({
    participant_id: participantIdInput.value.trim() || "UNKNOWN",
    mapping,
    trial_number: trialNumber,
    presentation_order: presentationOrderByMapping[mapping],
    completion_time_s: completionTimeS.toFixed(3),
    path_length: pathLength.toFixed(4),
    straight_line_distance: straightLineDist.toFixed(4),
    path_ratio: pathRatio.toFixed(4),
  });

  startTrial();
}

let aButtonWasPressed = false;

function checkVRConfirmButton() {
  const session = renderer.xr.getSession();
  if (!session) return; 

  let aButtonPressedNow = false;

  for (const source of session.inputSources) {
    const gp = source.gamepad;
    if (!gp) continue;
    
    if (gp.buttons[4] && gp.buttons[4].pressed) {
      aButtonPressedNow = true;
    }
  }

  if (aButtonPressedNow && !aButtonWasPressed) {
    const { withinTolerance } = checkTolerance();
    if (withinTolerance) {
      confirmTrial();
    }
  }

  aButtonWasPressed = aButtonPressedNow;
}

confirmBtn.addEventListener("click", confirmTrial);
window.addEventListener("keydown", handleKeydown);
window.addEventListener("keyup", handleKeyUp);

let keys = {
  'a': 0, 'd': 0, 'w': 0, 's': 0, 'r': 0, 'f': 0,
  'u': 0, 'o': 0, 'j': 0, 'l': 0, 'i': 0, 'k': 0
};

function handleKeydown(e) {
  keys[e.key] = 1;
}

function handleKeyUp(e) {
  keys[e.key] = 0;
}

// ---------------------------------------------------------------------------
// CSV download
// ---------------------------------------------------------------------------

function buildCsv() {
  const lines = [CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      CSV_HEADER.map(function (key) {
        return row[key];
      }).join(",")
    );
  }
  return lines.join("\n");
}

downloadBtn.addEventListener("click", handleDownloadClick);

function handleDownloadClick() {
  const csv = buildCsv();
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const pid = participantIdInput.value.trim() || "UNKNOWN";
  a.href = url;
  a.download = `a1_${pid}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

function updateStatus() {
  const { positionError, orientationErrorDeg, withinTolerance } = checkTolerance();

  if (withinTolerance) {
    statusEl.textContent = `Dist: ${positionError.toFixed(2)}m | (Aperte A para o próximo)`;
  } else {
    statusEl.textContent = `Dist: ${positionError.toFixed(2)}m`;
  }
  statusEl.classList.toggle("in-tolerance", withinTolerance);

  const emmissiveColor = withinTolerance ? 0x00cc00 : 0x005500;
  target.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.emissive.setHex(emmissiveColor);
    }
  });
}

// ---------------------------------------------------------------------------
// WIM (World in Miniature)
// ---------------------------------------------------------------------------

function buildWIM() {
  const WIM_SCALE = 0.35 / 20.0; // WIM scale / Real World Scale

  mini = world.clone(true);

  const clonedLights = [];
  mini.traverse(o => { if(o.isLight) clonedLights.push(o); });
  clonedLights.forEach(l => l.removeFromParent());

  mini.scale.setScalar(WIM_SCALE);
  mini.position.set(0, 0.12, -0.05);

  grip0.add(mini);

  const pinShape = new THREE.Shape();
  pinShape.moveTo(0, 0);

  pinShape.bezierCurveTo(0.15, 0.15, 0.4, 0.3, 0.4, 0.6);
  pinShape.absarc(0.0, 0.6, 0.4, 0.0, Math.PI, false);
  pinShape.bezierCurveTo(-0.4, 0.3, -0.15, 0.15, 0.0, 0.0);

  const hole = new THREE.Path();
  hole.absarc(0.0, 0.6, 0.15, 0.0, Math.PI * 2, true);
  pinShape.holes.push(hole);

  const extrudeSettings = {
    depth: 0.1,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.02,
    bevelThickness: 0.02
  };

  const markerGeom = new THREE.ExtrudeGeometry(pinShape, extrudeSettings);

  const MARKER_HEIGHT = 0.04;
  markerGeom.scale(MARKER_HEIGHT, MARKER_HEIGHT, MARKER_HEIGHT);

  const markerMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x550000,
    roughness: 0.3,
    metalness: 0.1
  });

  marker = new THREE.Mesh(markerGeom, markerMaterial);
  marker.scale.setScalar(1 / WIM_SCALE);
  mini.add(marker);

  if(!DEBUG_WIM_LINE) return;

  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.0, 0.0, 0.0),
    new THREE.Vector3(0.0, 0.0, 0.0)
  ]);

  debugLine = new THREE.Line(lineGeometry, lineMaterial);
  scene.add(debugLine);
}

function onWIMGrab(event) {
  if(mappingSelect && mappingSelect.value != "1") return;

  const controller = event.target;

  const ctrlWorldPos = new THREE.Vector3();
  controller.getWorldPosition(ctrlWorldPos);

  const markerWorldPos = new THREE.Vector3();
  marker.getWorldPosition(markerWorldPos);

  if(ctrlWorldPos.distanceTo(markerWorldPos) < 0.1) {
    isDraggingMarker = true;
    controller.attach(marker);
  }
}

function onWIMRelease(event) {
  if(!isDraggingMarker) return;
  isDraggingMarker = false;

  mini.attach(marker);
  marker.position.y = 0;

  const targetWorldPos = world.localToWorld(marker.position.clone());
  camera.getWorldPosition(tmpCameraPos);

  rig.position.x += targetWorldPos.x - tmpCameraPos.x;
  rig.position.z += targetWorldPos.z - tmpCameraPos.z;
}

const joystickForward = new THREE.Vector3();
const joystickRight = new THREE.Vector3();
const JOYSTICK_SPEED = 2.5;
const JOYSTICK_DEADZONE = 0.05;

function updateControlMapping(delta) {
  const mapping = mappingSelect ? mappingSelect.value : "1";

  if(mini) mini.visible = (mapping === "1");
  if(debugLine) debugLine.visible = (mapping === "1" && DEBUG_WIM_LINE);

  if(mapping === "1") {
    if(!mini || !marker) return;

    if(!isDraggingMarker) {
      camera.getWorldPosition(tmpCameraPos);
      world.worldToLocal(tmpCameraPos);
      marker.position.set(tmpCameraPos.x, 0, tmpCameraPos.z);
    }

    if(!controller1) return;

    const ctrlWorldPos = new THREE.Vector3();
    controller1.getWorldPosition(ctrlWorldPos);

    const markerWorldPos = new THREE.Vector3();
    marker.getWorldPosition(markerWorldPos);

    const dist = ctrlWorldPos.distanceTo(markerWorldPos);

    if(ctrlWorldPos.distanceTo(markerWorldPos) < 0.1) {
      console.log("Controller is close to marker");
      marker.material.color.setHex(0xff3333);
      marker.material.emissive.setHex(0x550000);
    } else {
      console.log("Controller is far from marker, distance:", dist.toFixed(3));
      marker.material.color.setHex(0x990000);
      marker.material.emissive.setHex(0x000000);
    }

    if(!DEBUG_WIM_LINE || !debugLine) return;

    debugLine.visible = true;

    const positions = debugLine.geometry.attributes.position.array;

    positions[0] = markerWorldPos.x;
    positions[1] = markerWorldPos.y;
    positions[2] = markerWorldPos.z;
      
    positions[3] = ctrlWorldPos.x;
    positions[4] = ctrlWorldPos.y;
    positions[5] = ctrlWorldPos.z;
      
    debugLine.geometry.attributes.position.needsUpdate = true;
  }

  else if (mapping === "2") {
    const session = renderer.xr.getSession();
    if (!session) return;

    for (const source of session.inputSources) {
      if (source.handedness === 'left' && source.gamepad) {
        const xAxis = source.gamepad.axes[2];
        const yAxis = source.gamepad.axes[3];

        if (Math.abs(xAxis) > JOYSTICK_DEADZONE || Math.abs(yAxis) > JOYSTICK_DEADZONE) {
          camera.getWorldDirection(joystickForward);
          joystickForward.y = 0;
          joystickForward.normalize();

          joystickRight.set(-joystickForward.z, 0, joystickForward.x);

          const moveZ = yAxis * JOYSTICK_SPEED * delta;
          const moveX = xAxis * JOYSTICK_SPEED * delta;

          rig.position.addScaledVector(joystickForward, -moveZ);
          rig.position.addScaledVector(joystickRight, moveX);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
  const delta = clock.getDelta();
  updateControlMapping(delta);

  checkVRConfirmButton();

  camera.getWorldPosition(tmpCameraPos);
  pathLength += tmpCameraPos.distanceTo(lastCameraPosition);
  lastCameraPosition.copy(tmpCameraPos);

  updateStatus();

  if(renderer.xr.isPresenting) {
    const xrCamera = renderer.xr.getCamera();
    xrCamera.cameras.forEach((cam) => {
      cam.layers.enable(1);
      cam.layers.enable(2);
    });
  }

  renderer.render(scene, camera);
}

main();