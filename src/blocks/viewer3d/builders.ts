/* Procedural scene builders — heavy chunk only (imports three.js). The sedan is
   generated at runtime from primitives (zero asset bytes, license-free, CSP-safe);
   the floor plan extrudes walls from room polygons, cutting real door and window
   openings out of the wall boxes. */
import * as THREE from "three";
import type { Viewer3DLevel } from "./scene";
import { lerp2, levelWalls, openingsOnWall, polyCentroid, solidSpans } from "./plan-geometry";
import { LOOK, type ScenePalette } from "./look";

export type { ScenePalette } from "./look";

/* ---- sedan ---- */

/* The body is the car's SIDE SILHOUETTE (x = length, y = up) extruded across the
   width with a bevel. Real wheel arches are carved into the outline (arcs over
   the wheel centers), the nose and tail get bumper curvature, and the beltline
   drops toward the hood — the profile reads as a production three-box sedan.
   Length ~4.6 m, width 1.82 m, roof 1.36 m. */
function bodyShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-2.18, 0.38);                          // rear lower corner
  s.lineTo(-1.98, 0.335);
  s.lineTo(-1.91, 0.33);
  s.absarc(-1.45, 0.33, 0.46, Math.PI, 0, true);  // rear wheel arch
  s.lineTo(0.99, 0.33);                           // rocker panel
  s.absarc(1.45, 0.33, 0.46, Math.PI, 0, true);   // front wheel arch
  s.lineTo(2.18, 0.36);
  s.quadraticCurveTo(2.32, 0.38, 2.33, 0.52);     // front bumper face
  s.lineTo(2.31, 0.62);
  s.quadraticCurveTo(2.26, 0.76, 2.02, 0.8);      // nose
  s.lineTo(1.02, 0.92);                           // hood
  s.lineTo(-0.2, 0.98);                           // beltline
  s.lineTo(-1.9, 0.94);                           // rear deck
  s.quadraticCurveTo(-2.24, 0.9, -2.28, 0.72);    // trunk face
  s.lineTo(-2.18, 0.38);
  return s;
}

/* greenhouse silhouette — glass above the beltline, raked A/C pillars */
function cabinShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-1.58, 0.93);
  s.quadraticCurveTo(-1.06, 1.33, -0.32, 1.36);   // rear window -> roof
  s.lineTo(0.4, 1.34);
  s.quadraticCurveTo(0.76, 1.28, 1.0, 0.93);      // windshield
  s.lineTo(-1.58, 0.93);
  return s;
}

function extrudeCentered(shape: THREE.Shape, width: number, bevel: number): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 32,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  return geo;
}

/* five-spoke alloy wheel: torus tire + rim dish + spokes + hub cap */
function buildWheel(pal: ScenePalette): THREE.Group {
  const g = new THREE.Group();
  const M = LOOK.materials;
  const tireMat = new THREE.MeshStandardMaterial({ color: pal.dark, ...M.tire });
  const rimMat = new THREE.MeshStandardMaterial({ color: pal.metal, ...M.metal });
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.085, 18, 40), tireMat);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 28), rimMat);
  dish.rotation.x = Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.02, 24),
    new THREE.MeshStandardMaterial({ color: "#6d7076", metalness: 0.9, roughness: 0.45 }));
  disc.rotation.x = Math.PI / 2;
  disc.position.z = -0.045;
  g.add(tire, dish, disc);
  const spokeGeo = new THREE.BoxGeometry(0.07, 0.21, 0.05);
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(spokeGeo, rimMat);
    sp.position.y = 0; // rotate around z
    sp.rotation.z = (i / 5) * Math.PI * 2;
    sp.translateY(0.115);
    sp.position.z = 0.035;
    g.add(sp);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.075, 16), rimMat);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.03;
  g.add(cap);
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
  return g;
}

export function buildSedan(pal: ScenePalette): THREE.Group {
  const g = new THREE.Group();
  const M = LOOK.materials;
  const paintMat = new THREE.MeshPhysicalMaterial({ color: pal.paint, ...M.paint });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: pal.glass, ...M.glass, transparent: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: pal.dark, ...M.tire });
  const trimMat = new THREE.MeshStandardMaterial({ color: "#101114", metalness: 0.4, roughness: 0.5 });

  const body = new THREE.Mesh(extrudeCentered(bodyShape(), 1.82, 0.07), paintMat);
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(extrudeCentered(cabinShape(), 1.6, 0.05), glassMat);
  cabin.castShadow = true;
  g.add(cabin);

  // roof cap (paint) so the greenhouse doesn't read as an all-glass bubble
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.05, 1.52), paintMat);
  roof.position.set(-0.36, 1.355, 0);
  roof.castShadow = true;
  g.add(roof);

  // underbody pan fills the arch tunnels (you can't see through the car)
  const pan = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.3, 1.56), darkMat);
  pan.position.set(0.02, 0.34, 0);
  g.add(pan);

  for (const [x, z] of [[1.45, 0.78], [1.45, -0.78], [-1.45, 0.78], [-1.45, -0.78]] as const) {
    const wheel = buildWheel(pal);
    wheel.position.set(x, 0.33, z);
    if (z < 0) wheel.rotation.y = Math.PI;
    g.add(wheel);
  }

  // door seams — thin dark blades slightly wider than the body
  const seamGeo = new THREE.BoxGeometry(0.008, 0.52, 1.845);
  for (const x of [0.78, -0.12, -1.02]) {
    const seam = new THREE.Mesh(seamGeo, trimMat);
    seam.position.set(x, 0.66, 0);
    g.add(seam);
  }
  // door handles
  const handleGeo = new THREE.BoxGeometry(0.16, 0.035, 0.02);
  for (const z of [0.925, -0.925]) for (const x of [0.52, -0.38]) {
    const h = new THREE.Mesh(handleGeo, trimMat);
    h.position.set(x, 0.86, z);
    g.add(h);
  }

  // mirrors on stalks
  const mirGeo = new THREE.BoxGeometry(0.1, 0.09, 0.17);
  const stalkGeo = new THREE.BoxGeometry(0.03, 0.03, 0.09);
  for (const zc of [1, -1]) {
    const m = new THREE.Mesh(mirGeo, paintMat);
    m.position.set(0.88, 1.0, zc * 1.0);
    const st = new THREE.Mesh(stalkGeo, trimMat);
    st.rotation.x = zc * 0.5;
    st.position.set(0.88, 0.955, zc * 0.93);
    g.add(m, st);
  }

  // grille + plates
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.62), trimMat);
  grille.position.set(2.315, 0.6, 0);
  const plateMat = new THREE.MeshStandardMaterial({ color: "#e8e9ea", metalness: 0, roughness: 0.6 });
  const plateF = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.44), plateMat);
  plateF.position.set(2.355, 0.44, 0);
  const plateR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.44), plateMat);
  plateR.position.set(-2.295, 0.52, 0);
  plateR.rotation.z = 0.08;
  g.add(grille, plateF, plateR);

  // light bars (emissive so they read at any exposure)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.075, 0.42),
    new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: pal.headEmissive, ...M.lampHead }));
  head.position.set(2.24, 0.72, 0.56);
  head.rotation.y = -0.14;
  const head2 = head.clone(); head2.position.z = -0.56; head2.rotation.y = 0.14;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.5),
    new THREE.MeshStandardMaterial({ color: pal.tailColor, emissive: pal.tailEmissive, ...M.lampTail }));
  tail.position.set(-2.27, 0.8, 0.52);
  const tail2 = tail.clone(); tail2.position.z = -0.52;
  g.add(head, head2, tail, tail2);
  return g;
}

/* ---- floor plan ---- */

export interface RoomAnchor { roomId: string; label: string; pos: THREE.Vector3 }
export interface BuiltLevel { group: THREE.Group; anchors: RoomAnchor[] }

export { polyCentroid } from "./plan-geometry";

const DOOR_HEAD = 2.05;

/* One level: per room a floor slab; walls come from the DEDUPED wall set
   (shared partitions build once, not twice) with real openings cut out —
   doors keep a header above the leaf, windows get sill + glazing + header. */
export function buildLevel(level: Viewer3DLevel, pal: ScenePalette, index: number, wallT = 0.15): BuiltLevel {
  const group = new THREE.Group();
  const anchors: RoomAnchor[] = [];
  const M = LOOK.materials;
  const wallMat = new THREE.MeshStandardMaterial({ color: pal.wall, ...M.wall });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: pal.glassPlan, ...M.glassPlan, transparent: true, side: THREE.DoubleSide });
  glassMat.userData = { baseTransparent: true, baseOpacity: M.glassPlan.opacity };

  const addBox = (a: [number, number], b: [number, number], y0: number, y1: number, mat: THREE.Material, edges: boolean) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.01 || y1 - y0 < 0.01) return;
    const geo = new THREE.BoxGeometry(len + (mat === wallMat ? wallT : 0), y1 - y0, mat === glassMat ? 0.03 : wallT);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2);
    mesh.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    mesh.castShadow = mat !== glassMat;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (edges) {
      const e = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: pal.wallEdge }),
      );
      e.position.copy(mesh.position);
      e.rotation.copy(mesh.rotation);
      group.add(e);
    }
  };

  /* floors */
  level.rooms.forEach((room, ri) => {
    const shape = new THREE.Shape(room.poly.map(([x, z]) => new THREE.Vector2(x, z)));
    const floorGeo = new THREE.ShapeGeometry(shape);
    floorGeo.rotateX(Math.PI / 2); // shape y -> world -z; flip below via scale
    const floorMat = new THREE.MeshStandardMaterial({
      color: (ri + index) % 2 === 0 ? pal.floor : pal.floorAlt, ...M.floor,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.scale.z = -1; // undo the mirror from rotateX so (x,z) match the input
    floor.position.y = 0.011 * (ri + 1); // avoid z-fighting between slabs
    floor.receiveShadow = true;
    group.add(floor);
    const [cx, cz] = polyCentroid(room.poly);
    anchors.push({ roomId: room.id, label: room.label, pos: new THREE.Vector3(cx, level.elevation + Math.min(level.height * 0.55, 1.5), cz) });
  });

  /* walls with openings */
  for (const wall of levelWalls(level)) {
    const ops = openingsOnWall(wall, level.openings);
    for (const [t0, t1] of solidSpans(ops)) {
      addBox(lerp2(wall.a, wall.b, t0), lerp2(wall.a, wall.b, t1), 0, level.height, wallMat, true);
    }
    for (const { opening, t0, t1 } of ops) {
      const a = lerp2(wall.a, wall.b, t0), b = lerp2(wall.a, wall.b, t1);
      if (opening.kind === "door") {
        addBox(a, b, Math.min(DOOR_HEAD, level.height - 0.05), level.height, wallMat, false); // header
      } else {
        const sill = opening.sill ?? 0.9, head = opening.head ?? Math.min(2.2, level.height - 0.3);
        addBox(a, b, 0, sill, wallMat, false);                 // sill wall
        addBox(a, b, head, level.height, wallMat, false);      // header
        addBox(a, b, sill, head, glassMat, true);              // glazing (edged = frame)
      }
    }
  }

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
      m.transparent = ghost || !!m.userData.baseTransparent;
      m.opacity = ghost ? LOOK.materials.ghostOpacity : ((m.userData.baseOpacity as number | undefined) ?? 1);
      m.depthWrite = !ghost && !m.userData.baseTransparent;
      m.needsUpdate = true;
    }
    if (mesh.isMesh) mesh.castShadow = !ghost;
  });
}
