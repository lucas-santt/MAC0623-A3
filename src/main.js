import * as THREE from "three";
import {VRButton} from "three/addons/webxr/VRButton.js";

let scene, camera, renderer, target;
let world, rig;
let controller0, controller1; 
let grip0, grip1;
let mini, marker;
let isDraggingMarker = false;

const DEBUG_WIM_LINE = true;
let debugLine = null;

function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  const world = new THREE.Group();
  scene.add(world);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 4, 3);
  scene.add(dirLight);

  scene.add(new THREE.GridHelper(20, 20, 0x444444, 0x2a2a2a));
  scene.add(new THREE.AxesHelper(0.6));

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 3),
    new THREE.MeshStandardMaterial({ color: 0xcc0000 })
  );
  pillar.position.set(3, 1.5, -4);
  world.add(pillar);

  // Walls
  const blueWall = new THREE.Mesh(
    new THREE.BoxGeometry(4, 2, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x0000cc })
  );
  blueWall.position.set(-4, 1, -5);
  world.add(blueWall);
  
  const yellowWall = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xcccc00 })
  );
  yellowWall.position.set(0, 1, 6);
  world.add(yellowWall);

  // Beacon (Waypoint)
  const beaconGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1);
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0x00dd00,
    transparent: true,
    opacity: 0.6,
    emissive: 0x005500
  });
  const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
  beacon.position.set(0, 0.05, 0);
  beacon.name = 'beacon';
  world.add(beacon);

  return { scene, world, target: beacon };
}

function main() {
  ({ scene, world, target } = buildScene());

  rig = new THREE.Group();
  scene.add(rig);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 100);
  camera.position.set(0, 1.4, 2);
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
  x: [-8.0, 8.0],
  y: [0.05, 0.05],
  z: [-8.0, 8.0],
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

  statusEl.textContent = `Dist: ${positionError.toFixed(2)}m`;
  statusEl.classList.toggle("in-tolerance", withinTolerance);

  target.material.emissive.setHex(withinTolerance ? 0x00cc00 : 0x005500);
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

function updateControlMapping(delta) {
  if(!mappingSelect || mappingSelect.value !== "1") {
    if(debugLine) debugLine.visible = false;
    return;
  }
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

  if(ctrlWorldPos.distanceTo(markerWorldPos) < 0.1) {
    marker.material.color.setHex(0xff3333);
    marker.material.emissive.setHex(0x550000);
  } else {
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

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
  const delta = clock.getDelta();
  updateControlMapping(delta);

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