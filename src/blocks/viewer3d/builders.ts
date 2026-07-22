/* Procedural scene builders — heavy chunk only (imports three.js). The sedan is
   generated at runtime from primitives (zero asset bytes, license-free, CSP-safe);
   the floor plan extrudes walls from room polygons. */
import * as THREE from "three";
import type { Viewer3DLevel } from "./scene";
import { LOOK, type ScenePalette } from "./look";

export type { ScenePalette } from "./look";

/* ---- sedan ---- */

/* The body is the car's SIDE SILHOUETTE (x = length, y = up) extruded across the
   width with a bevel — one shape reads as a real three-box sedan profile instead
   of a lego stack. Length ~4.6m, width 1.82m, roof 1.42m. */
function bodyShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-2.02, 0.42);
  s.lineTo(-2.26, 0.56);
  s.quadraticCurveTo(-2.34, 0.9, -2.12, 0.98);   // trunk lid
  s.lineTo(-0.2, 1.02);                          // beltline (greenhouse sits above)
  s.lineTo(1.05, 0.99);
  s.lineTo(1.8, 0.9);                            // hood
  s.quadraticCurveTo(2.28, 0.84, 2.32, 0.64);    // nose
  s.lineTo(2.32, 0.42);
  s.quadraticCurveTo(1.2, 0.36, 0, 0.36);
  s.lineTo(-2.02, 0.42);
  return s;
}

/* greenhouse silhouette — glass + roof above the beltline, slightly narrower */
function cabinShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-1.72, 1.0);
  s.quadraticCurveTo(-1.12, 1.42, -0.25, 1.44);  // rear window -> roof
  s.quadraticCurveTo(0.35, 1.42, 0.85, 1.0);     // windshield
  s.lineTo(-1.72, 1.0);
  return s;
}

function extrudeCentered(shape: THREE.Shape, width: number, bevel: number): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  return geo;
}

export function buildSedan(pal: ScenePalette): THREE.Group {
  const g = new THREE.Group();
  const M = LOOK.materials;
  const paintMat = new THREE.MeshPhysicalMaterial({ color: pal.paint, ...M.paint });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: pal.glass, ...M.glass, transparent: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: pal.dark, ...M.tire });
  const metalMat = new THREE.MeshStandardMaterial({ color: pal.metal, ...M.metal });

  const body = new THREE.Mesh(extrudeCentered(bodyShape(), 1.82, 0.07), paintMat);
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(extrudeCentered(cabinShape(), 1.64, 0.05), glassMat);
  cabin.castShadow = true;
  g.add(cabin);

  // wheels: tire + hub
  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 32);
  tireGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.26, 24);
  hubGeo.rotateX(Math.PI / 2);
  for (const [x, z] of [[1.45, 0.8], [1.45, -0.8], [-1.45, 0.8], [-1.45, -0.8]] as const) {
    const tire = new THREE.Mesh(tireGeo, darkMat);
    tire.position.set(x, 0.34, z);
    tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, metalMat);
    hub.position.set(x, 0.34, z);
    g.add(tire, hub);
  }

  // mirrors
  const mirGeo = new THREE.BoxGeometry(0.1, 0.09, 0.16);
  for (const z of [1.0, -1.0]) {
    const m = new THREE.Mesh(mirGeo, paintMat);
    m.position.set(0.72, 1.02, z * 0.94);
    g.add(m);
  }

  // light bars (emissive so they read at any exposure)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.44),
    new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: pal.headEmissive, ...M.lampHead }));
  head.position.set(2.28, 0.72, 0.55);
  const head2 = head.clone(); head2.position.z = -0.55;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.5),
    new THREE.MeshStandardMaterial({ color: pal.tailColor, emissive: pal.tailEmissive, ...M.lampTail }));
  tail.position.set(-2.29, 0.78, 0.52);
  const tail2 = tail.clone(); tail2.position.z = -0.52;
  g.add(head, head2, tail, tail2);
  return g;
}

/* ---- floor plan ---- */

export interface RoomAnchor { roomId: string; label: string; pos: THREE.Vector3 }
export interface BuiltLevel { group: THREE.Group; anchors: RoomAnchor[] }

export function polyCentroid(poly: [number, number][]): [number, number] {
  let x = 0, z = 0;
  for (const [px, pz] of poly) { x += px; z += pz; }
  return [x / poly.length, z / poly.length];
}

/* One level: per room a floor slab + wall boxes along each polygon edge + a crisp
   edge outline. Shared walls double up invisibly (boxes overlap) — fine at this
   scale, keeps the input format trivially authorable from config. */
export function buildLevel(level: Viewer3DLevel, pal: ScenePalette, index: number): BuiltLevel {
  const group = new THREE.Group();
  const anchors: RoomAnchor[] = [];
  const wallMat = new THREE.MeshStandardMaterial({ color: pal.wall, ...LOOK.materials.wall });
  const t = 0.12; // wall thickness
  level.rooms.forEach((room, ri) => {
    const shape = new THREE.Shape(room.poly.map(([x, z]) => new THREE.Vector2(x, z)));
    const floorGeo = new THREE.ShapeGeometry(shape);
    floorGeo.rotateX(Math.PI / 2); // shape y -> world -z; flip below via scale
    const floorMat = new THREE.MeshStandardMaterial({
      color: (ri + index) % 2 === 0 ? pal.floor : pal.floorAlt, ...LOOK.materials.floor,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.scale.z = -1; // undo the mirror from rotateX so (x,z) match the input
    floor.position.y = 0.011 * (ri + 1); // avoid z-fighting between slabs
    floor.receiveShadow = true;
    group.add(floor);

    const n = room.poly.length;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = room.poly[i];
      const [x2, z2] = room.poly[(i + 1) % n];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.01) continue;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len + t, level.height, t), wallMat);
      wall.position.set((x1 + x2) / 2, level.height / 2, (z1 + z2) / 2);
      wall.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(wall.geometry as THREE.BoxGeometry, 30),
        new THREE.LineBasicMaterial({ color: pal.wallEdge }),
      );
      edges.position.copy(wall.position);
      edges.rotation.copy(wall.rotation);
      group.add(edges);
    }
    const [cx, cz] = polyCentroid(room.poly);
    anchors.push({ roomId: room.id, label: room.label, pos: new THREE.Vector3(cx, level.elevation + Math.min(level.height * 0.55, 1.5), cz) });
  });
  group.position.y = level.elevation;
  return { group, anchors };
}

/* ghost a level (inactive floors): fade every material, drop shadows */
export function setLevelGhost(group: THREE.Group, ghost: boolean): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh && !(obj as THREE.LineSegments).isLineSegments) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      m.transparent = ghost;
      m.opacity = ghost ? LOOK.materials.ghostOpacity : 1;
      m.depthWrite = !ghost;
      m.needsUpdate = true;
    }
    if (mesh.isMesh) mesh.castShadow = !ghost;
  });
}
