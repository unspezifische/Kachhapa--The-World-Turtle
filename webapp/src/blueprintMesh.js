import {
  MeshBuilder,
  TransformNode,
  Vector3,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Color3,
  Mesh,
  VertexData,
} from '@babylonjs/core';

import earcut from 'earcut';

import {
  FEET_PER_SCENE_UNIT as SCALE,
} from './settlementEditor';

import {
  normalizeBlueprint,
  isRoofVisible,
  roofBaseElevation,
  automaticRoofFootprints,
  openCorners,
  blueprintWalls,
  wallPanels,
  wallLength,
  wallPointAtDistance,
  wallTangentAtDistance,
  stairGeometry,
  stairOpeningsForLevel,
  levelConnectionGuides,
  chimneyPassThroughsForLevel,
  chimneysForLevel,
  fireplacePosition,
  platformEdgeMode,
  constructionFinish,
  WALL_FINISHES,
  FLOOR_FINISHES,
  foundationPerimeter,
  exteriorFootprint,
  pointInPolygon,
} from './buildingBlueprint';

import { createBlueprintRoofMesh } from './roofMesh';
import { structureWorldElevation } from './settlementProperties';
import { createThinBoxBatch } from './thinBoxBatch';

export function createBlueprintMesh(
  scene,
  source,
  ground = 0,
  heightSampler = () => ground
) {
  const building =
    normalizeBlueprint(
      source
    );

  const root =
    new TransformNode(
      `building-${building.id}`,
      scene
    );

  root.position.set(
    building.x / SCALE,

    structureWorldElevation(building, ground) / SCALE,

    building.y / SCALE
  );

  root.rotation.y =
    -(building.rotation || 0);

  const mat = (
    name,
    color
  ) => {
    const material =
      new StandardMaterial(
        `${building.id}-${name}`,
        scene
      );

    material.diffuseColor =
      Color3.FromHexString(
        color
      );

    return material;
  };

  const wallMat =
    mat(
      'walls',
      '#a98b69'
    );

  const finishColors = {
    stone: '#898780', wood: '#946d46', brick: '#a15f4b',
    plaster: '#d0b99a', 'packed-earth': '#65513d'
  };
  const finishMaterials = {};
  const materialFor = (finish, fallback) => {
    if (!finish || finish === 'existing' || !finishColors[finish]) return fallback;
    if (!finishMaterials[finish]) {
      const value = mat(`finish-${finish}`, finishColors[finish]);
      if (scene.getEngine().getRenderingCanvas()) {
        const texture = new DynamicTexture(`${building.id}-${finish}-texture`, { width: 256, height: 256 }, scene, true);
        const context = texture.getContext();
        if (context) {
          context.fillStyle = finishColors[finish];
          context.fillRect(0, 0, 256, 256);
          if (finish === 'wood') {
            for (let row = 0; row < 8; row += 1) {
              context.fillStyle = row % 2 ? '#997348' : '#b08856';
              context.fillRect(0, row * 32 + 1, 256, 30);
              context.strokeStyle = '#6a4c2e';
              context.lineWidth = 1;
              for (let grain = 0; grain < 4; grain += 1) {
                context.beginPath(); context.moveTo(0, row * 32 + 5 + grain * 6);
                context.bezierCurveTo(80, row * 32 + 2 + grain * 6, 160, row * 32 + 10 + grain * 6, 256, row * 32 + 5 + grain * 6);
                context.stroke();
              }
            }
          } else if (finish === 'stone' || finish === 'brick') {
            context.fillStyle = '#514c43'; context.fillRect(0, 0, 256, 256);
            const blockHeight = finish === 'brick' ? 16 : 32;
            const blockWidth = finish === 'brick' ? 48 : 64;
            for (let row = 0; row < 256 / blockHeight; row += 1) {
              for (let column = -1; column < 6; column += 1) {
                context.fillStyle = finish === 'brick'
                  ? ['#aa735b', '#bb8064', '#9c654f'][(row + column + 6) % 3]
                  : ['#aaa79c', '#938f84', '#b6b1a5'][(row + column + 6) % 3];
                context.fillRect(column * blockWidth + (row % 2 ? blockWidth / 2 : 0) + 1,
                  row * blockHeight + 1, blockWidth - 2, blockHeight - 2);
              }
            }
          }
        }
        texture.wrapU = Texture.WRAP_ADDRESSMODE; texture.wrapV = Texture.WRAP_ADDRESSMODE;
        texture.uScale = 4; texture.vScale = 2;
        texture.update(false);
        value.diffuseTexture = texture;
        value.diffuseColor = Color3.White();
      }
      finishMaterials[finish] = value;
    }
    return finishMaterials[finish];
  };

  const foundationMat =
    mat(
      'foundation-stone',
      '#8c8980'
    );

  const groundLevel = building.levels.find(level => level.elevation_feet === 0);
  const foundationFinish = building.foundation_material === 'exterior'
    ? materialFor(groundLevel?.exterior_material, wallMat) : foundationMat;

  if (
    building.foundation_material !== 'exterior' &&
    scene.getEngine().getRenderingCanvas()
  ) {
    const stoneTexture = new DynamicTexture(
      `${building.id}-foundation-stone-texture`,
      { width: 256, height: 256 },
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE
    );
    const context = stoneTexture.getContext();
    if (context) {
      context.fillStyle = '#77766f';
      context.fillRect(0, 0, 256, 256);

      for (let row = 0; row < 8; row++) {
        const offset = row % 2 ? 32 : 0;

        for (let column = -1; column < 4; column++) {
          const x = column * 64 + offset;
          const y = row * 32;
          context.fillStyle =
            ['#929087', '#85847c', '#9b998f'][(row + column + 4) % 3];
          context.fillRect(x + 1, y + 1, 62, 30);
          context.strokeStyle = '#55554f';
          context.lineWidth = 2;
          context.strokeRect(x + 1, y + 1, 62, 30);
        }
      }
    }

    stoneTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    stoneTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    stoneTexture.uScale = 4;
    stoneTexture.vScale = 2;
    stoneTexture.update(false);
    foundationMat.diffuseTexture = stoneTexture;
    foundationMat.diffuseColor = Color3.White();
  }

  const floorMat =
    mat(
      'floor',
      '#786754'
    );

  const woodenStairMat =
    mat(
      'stair-wood',
      '#805b38'
    );

  const stoneStairMat =
    mat(
      'stair-stone',
      '#89877f'
    );

  const markerMat =
    mat(
      'connections',
      '#65c6c1'
    );

  const chimneyMat =
    mat(
      'chimney',
      '#6e6258'
    );

  const fireplaceMat =
    mat(
      'fireplace',
      '#2e2926'
    );

  const platformMat =
    mat(
      'platform',
      '#6f5d49'
    );

  const railingMat =
    mat(
      'railing',
      '#8a7359'
    );

  const roofMaterials = [];

  const attach = (
    mesh,
    material = wallMat
  ) => {
    mesh.parent =
      root;

    mesh.material =
      material;

    mesh.metadata = {
      settlement:
        true,

      kind:
        'building',

      item:
        source,
    };

    return mesh;
  };

  const box = (
    name,
    x,
    y,
    z,
    width,
    height,
    depth,
    angle = 0,
    material = wallMat
  ) => {
    const mesh =
      attach(
        MeshBuilder.CreateBox(
          name,

          {
            width:
              width / SCALE,

            height:
              height / SCALE,

            depth:
              depth / SCALE,
          },

          scene
        ),

        material
      );

    mesh.position.set(
      x / SCALE,
      y / SCALE,
      z / SCALE
    );

    mesh.rotation.y =
      -angle;

    return mesh;
  };

  const chosen =
    building.levels.find(
      level =>
        level.id ===
        building.visible_level_id
    ) ||
    building.levels[0];

  const groundVisible = groundLevel && (
    building.level_view !== 'level' || chosen?.id === groundLevel.id
  ) && (
    building.level_view !== 'through' || chosen?.elevation_feet >= 0
  );
  if (groundVisible) {
    const base = foundationPerimeter(building, groundLevel, ground, heightSampler);
    if (base.length >= 3 && base.some(point => point.top - point.bottom > 0.05)) {
      const top = base.map(point => new Vector3(point.x / SCALE, point.top / SCALE, point.y / SCALE));
      const bottom = base.map(point => new Vector3(point.x / SCALE, point.bottom / SCALE, point.y / SCALE));
      attach(MeshBuilder.CreateRibbon(`foundation-${building.id}`,
        { pathArray: [top, bottom], closePath: true, sideOrientation: Mesh.DOUBLESIDE }, scene), foundationFinish);
      const bottomMesh = new Mesh(`foundation-bottom-${building.id}`, scene);
      const flat = base.flatMap(point => [point.x, point.y]);
      const triangles = earcut(flat);
      const data = new VertexData();
      data.positions = base.flatMap(point => [point.x / SCALE, point.bottom / SCALE, point.y / SCALE]);
      data.indices = triangles.flatMap((_, index) => index % 3 === 0
        ? [triangles[index], triangles[index + 2], triangles[index + 1]] : []);
      const normals = [];
      VertexData.ComputeNormals(data.positions, data.indices, normals);
      data.normals = normals;
      data.applyToMesh(bottomMesh);
      attach(bottomMesh, foundationFinish);
    }
  }

  building.levels.forEach(
    level => {
      if (
        building.level_view ===
        'level' &&
        level.id !==
        chosen?.id
      ) {
        return;
      }

      if (
        building.level_view ===
        'through' &&
        level.elevation_feet >
        chosen.elevation_feet
      ) {
        return;
      }

      const corners =
        openCorners(level);

      const elevation =
        level.elevation_feet +
        building.foundation_height_feet;

      const foundationHeight =
        building.foundation_height_feet;

      const height =
        level.floor_height;

      if (
        corners.length < 3
      ) {
        return;
      }

      if (level.elevation_feet < 0) {
        const outer = exteriorFootprint(level, 0.05);
        const angle = Number(building.rotation) || 0;
        const rootHeight = ground + (Number(building.elevation) || 0);
        const bottom = outer.map(point => new Vector3(point.x / SCALE, elevation / SCALE, point.y / SCALE));
        const top = outer.map(point => {
          const x = building.x + point.x * Math.cos(angle) - point.y * Math.sin(angle);
          const y = building.y + point.x * Math.sin(angle) + point.y * Math.cos(angle);
          return new Vector3(point.x / SCALE, Math.max(elevation, heightSampler(x, y) - rootHeight) / SCALE, point.y / SCALE);
        });
        attach(MeshBuilder.CreateRibbon(`basement-earth-${level.id}`,
          { pathArray: [top, bottom], closePath: true, sideOrientation: Mesh.DOUBLESIDE }, scene),
        materialFor('packed-earth', wallMat));
      }

      /* ------------------------------------------------------------------ */
      /* Floor holes                                                         */
      /* ------------------------------------------------------------------ */

      const hatchHoles = (
        level.hatches || []
      ).map(
        hatch =>
          [
            [
              hatch.x -
              hatch.width /
              2,

              hatch.y -
              hatch.depth /
              2,
            ],

            [
              hatch.x +
              hatch.width /
              2,

              hatch.y -
              hatch.depth /
              2,
            ],

            [
              hatch.x +
              hatch.width /
              2,

              hatch.y +
              hatch.depth /
              2,
            ],

            [
              hatch.x -
              hatch.width /
              2,

              hatch.y +
              hatch.depth /
              2,
            ],
          ].map(
            ([x, y]) =>
              new Vector3(
                x / SCALE,
                0,
                y / SCALE
              )
          )
      );

      const floorVoidHoles = (
        level.floor_voids ||
        []
      )
        .filter(
          floorVoid =>
            floorVoid.points
              ?.length >= 3
        )
        .map(
          floorVoid =>
            floorVoid.points.map(
              point =>
                new Vector3(
                  point.x /
                  SCALE,

                  0,

                  point.y /
                  SCALE
                )
            )
        );

      const automaticStairHoles =
        stairOpeningsForLevel(
          building,
          level
        )
          .filter(
            opening =>
              opening.points
                .length >= 3
          )
          .map(
            opening =>
              opening.points.map(
                point =>
                  new Vector3(
                    point.x /
                    SCALE,

                    0,

                    point.y /
                    SCALE
                  )
              )
          );

      const chimneyPassThroughHoles =
        chimneyPassThroughsForLevel(
          building,
          level
        )
          .filter(
            opening =>
              opening.points
                .length >= 3
          )
          .map(
            opening =>
              opening.points.map(
                point =>
                  new Vector3(
                    point.x /
                    SCALE,

                    0,

                    point.y /
                    SCALE
                  )
              )
          );

      const floor =
        attach(
          MeshBuilder.CreatePolygon(
            `floor-${level.id}`,

            {
              shape:
                corners.map(
                  point =>
                    new Vector3(
                      point.x /
                      SCALE,

                      0,

                      point.y /
                      SCALE
                    )
                ),

              holes: [
                ...hatchHoles,
                ...floorVoidHoles,
                ...automaticStairHoles,
                ...chimneyPassThroughHoles,
              ],

              sideOrientation:
                Mesh.DOUBLESIDE,
            },

            scene,
            earcut
          ),

          materialFor(constructionFinish(level.floor_material, FLOOR_FINISHES), floorMat)
        );

      floor.position.y =
        elevation / SCALE;

      const floorHoles = [
        ...hatchHoles,
        ...floorVoidHoles,
        ...automaticStairHoles,
        ...chimneyPassThroughHoles,
      ];

      (level.rooms || []).filter(room =>
        Array.isArray(room.region) && room.region.length >= 3 && room.floor_material
      ).forEach(room => {
        const roomFloor = attach(
          MeshBuilder.CreatePolygon(
            `room-floor-${level.id}-${room.id}`,
            {
              shape: room.region.map(point => new Vector3(point.x / SCALE, 0, point.y / SCALE)),
              holes: floorHoles.filter(hole => hole[0] && pointInPolygon({
                x: hole[0].x * SCALE,
                y: hole[0].z * SCALE,
              }, room.region)),
              sideOrientation: Mesh.DOUBLESIDE,
            },
            scene,
            earcut
          ),
          materialFor(constructionFinish(room.floor_material, FLOOR_FINISHES,
            level.floor_material), floorMat)
        );
        roomFloor.position.y = elevation / SCALE + 0.002;
      });

      /* ------------------------------------------------------------------ */
      /* Walls                                                               */
      /* ------------------------------------------------------------------ */

      const walls =
        blueprintWalls(level);

      const arcWallBatches = new Map();

      walls.forEach(
        (
          wall,
          wallIndex
        ) => {
          const exterior = (level.outline || []).some(outline => outline.id === wall.id);
          const wallFinish = exterior
            ? materialFor(constructionFinish(wall.material, WALL_FINISHES,
              level.exterior_material), wallMat)
            : materialFor(constructionFinish(wall.material, WALL_FINISHES,
              level.interior_material), wallMat);
          const length =
            wallLength(wall);

          if (
            length < 0.1
          ) {
            return;
          }

          const openings = (
            level.openings ||
            []
          ).filter(
            opening =>
              opening.wall_id ===
              wall.id
          );

          const panels =
            wallPanels(
              length,
              height,
              openings
            );

          panels.forEach(
            (
              panel,
              panelIndex
            ) => {
              if (
                wall.type !==
                'arc'
              ) {
                const tangent =
                  wallTangentAtDistance(
                    wall,
                    panel.x
                  );

                const point =
                  wallPointAtDistance(
                    wall,
                    panel.x
                  );

                box(
                  `wall-${level.id}-${wallIndex}-${panelIndex}`,

                  point.x,

                  elevation +
                  panel.y,

                  point.y,

                  panel.width,

                  panel.height,

                  wall.thickness ||
                  0.5,

                  Math.atan2(
                    tangent.y,
                    tangent.x
                  ),
                  wallFinish
                );

                return;
              }

              const pieces =
                Math.max(
                  1,

                  Math.ceil(
                    panel.width /
                    0.75
                  )
                );

              const pieceWidth =
                panel.width /
                pieces;

              for (
                let pieceIndex = 0;
                pieceIndex <
                pieces;
                pieceIndex++
              ) {
                const distance =
                  panel.x -
                  panel.width /
                  2 +
                  pieceWidth *
                  (
                    pieceIndex +
                    0.5
                  );

                const point =
                  wallPointAtDistance(
                    wall,
                    distance
                  );

                const tangent =
                  wallTangentAtDistance(
                    wall,
                    distance
                  );

                const key = wallFinish.name;
                if (!arcWallBatches.has(key)) {
                  arcWallBatches.set(key, { material: wallFinish, boxes: [] });
                }
                arcWallBatches.get(key).boxes.push({
                  x: point.x / SCALE,
                  y: (elevation + panel.y) / SCALE,
                  z: point.y / SCALE,
                  width: (pieceWidth + 0.06) / SCALE,
                  height: panel.height / SCALE,
                  depth: (wall.thickness || 0.5) / SCALE,
                  angle: -Math.atan2(tangent.y, tangent.x),
                });
              }
            }
          );
        }
      );

      arcWallBatches.forEach(({ material, boxes }, key) => {
        createThinBoxBatch(scene, `arc-walls-${building.id}-${level.id}-${key}`,
          material, boxes,
          { settlement: true, kind: 'building', item: source,
            performanceCategory: 'blueprint arc walls' }, root);
      });

      // Wall panels end at their centerline nodes. Seal the exposed wedge at
      // shared endpoints, which grows noticeable with thick exterior walls.
      const wallJoints = [];
      walls.forEach(wall => {
        [wall.start, wall.end].forEach(point => {
          const joint = wallJoints.find(candidate =>
            Math.hypot(candidate.x - point.x, candidate.y - point.y) < 0.01);
          if (joint) {
            joint.count += 1;
            joint.thickness = Math.max(joint.thickness, Number(wall.thickness) || 0.5);
            joint.exterior ||= (level.outline || []).some(outline => outline.id === wall.id);
          } else {
            wallJoints.push({ x: point.x, y: point.y, count: 1,
              thickness: Number(wall.thickness) || 0.5,
              exterior: (level.outline || []).some(outline => outline.id === wall.id) });
          }
        });
      });
      wallJoints.filter(joint => joint.count > 1).forEach((joint, index) => {
        const size = joint.thickness * 1.1;
        box(`wall-joint-${level.id}-${index}`, joint.x, elevation + height / 2,
          joint.y, size, height, size, 0,
          joint.exterior
            ? materialFor(level.exterior_material, wallMat)
            : materialFor(level.interior_material, wallMat));
      });

      /* ------------------------------------------------------------------ */
      /* Porches / decks / balconies                                        */
      /* ------------------------------------------------------------------ */

      (
        level.platforms ||
        []
      ).forEach(
        (
          platform,
          platformIndex
        ) => {
          if (
            !platform.points ||
            platform.points.length < 3
          ) {
            return;
          }

          const platformFloor =
            attach(
              MeshBuilder.CreatePolygon(
                `platform-${level.id}-${platformIndex}`,

                {
                  shape:
                    platform.points.map(
                      point =>
                        new Vector3(
                          point.x /
                          SCALE,

                          0,

                          point.y /
                          SCALE
                        )
                    ),

                  sideOrientation:
                    Mesh.DOUBLESIDE,
                },

                scene,
                earcut
              ),

              platformMat
            );

          platformFloor.position.y =
            (
              elevation +
              (
                platform.elevation_offset ||
                0
              ) +
              0.03
            ) /
            SCALE;

          const points =
            platform.points;

          points.forEach(
            (
              start,
              edgeIndex
            ) => {
              const end =
                points[
                (
                  edgeIndex +
                  1
                ) %
                points.length
                ];

              const edgeMode =
                platformEdgeMode(
                  level,
                  platform,
                  edgeIndex
                );

              if (
                edgeMode !==
                'railing'
              ) {
                return;
              }

              const dx =
                end.x -
                start.x;

              const dy =
                end.y -
                start.y;

              const length =
                Math.hypot(
                  dx,
                  dy
                );

              if (
                length <
                0.1
              ) {
                return;
              }

              const angle =
                Math.atan2(
                  dy,
                  dx
                );

              const railHeight =
                platform.railing_height ||
                3.5;

              const y =
                elevation +
                (
                  platform.elevation_offset ||
                  0
                );

              /*
               * Bottom/top rails plus evenly spaced posts.
               * These are intentionally simple geometry for now.
               */
              [0.5, railHeight].forEach(
                (
                  railY,
                  railIndex
                ) => {
                  box(
                    `platform-rail-${platformIndex}-${edgeIndex}-${railIndex}`,

                    (
                      start.x +
                      end.x
                    ) /
                    2,

                    y +
                    railY,

                    (
                      start.y +
                      end.y
                    ) /
                    2,

                    length,

                    0.12,

                    0.12,

                    angle,

                    railingMat
                  );
                }
              );

              const postCount =
                Math.max(
                  2,
                  Math.ceil(
                    length /
                    4
                  ) +
                  1
                );

              for (
                let postIndex = 0;
                postIndex <
                postCount;
                postIndex++
              ) {
                const t =
                  postCount === 1
                    ? 0
                    : postIndex /
                    (
                      postCount -
                      1
                    );

                box(
                  `platform-post-${platformIndex}-${edgeIndex}-${postIndex}`,

                  start.x +
                  dx *
                  t,

                  y +
                  railHeight /
                  2,

                  start.y +
                  dy *
                  t,

                  0.15,

                  railHeight,

                  0.15,

                  angle,

                  railingMat
                );
              }
            }
          );
        }
      );

      /* ------------------------------------------------------------------ */
      /* Chimneys and fireplaces                                             */
      /* ------------------------------------------------------------------ */

      const activeChimneys =
        chimneysForLevel(
          building,
          level
        );

      activeChimneys.forEach(
        (
          chimney,
          chimneyIndex
        ) => {
          box(
            `chimney-${level.id}-${chimneyIndex}`,

            chimney.x,

            elevation +
            height /
            2,

            chimney.y,

            chimney.width,

            height,

            chimney.depth,

            0,

            chimneyMat
          );
        }
      );

      (
        level.fireplaces ||
        []
      ).forEach(
        (
          fireplace,
          fireplaceIndex
        ) => {
          const chimney =
            (
              building.chimneys ||
              []
            ).find(
              item =>
                item.id ===
                fireplace.chimney_id
            );

          if (!chimney) {
            return;
          }

          const marker =
            fireplacePosition(
              chimney,
              fireplace,
              0.04
            );

          const onEastWest =
            fireplace.side ===
            'east' ||
            fireplace.side ===
            'west';

          box(
            `fireplace-${level.id}-${fireplaceIndex}`,

            marker.x,

            elevation +
            (
              fireplace.opening_height ||
              4
            ) /
            2,

            marker.y,

            onEastWest
              ? 0.12
              : fireplace.width ||
              5,

            fireplace.opening_height ||
            4,

            onEastWest
              ? fireplace.width ||
              5
              : 0.12,

            0,

            fireplaceMat
          );
        }
      );

      /* ------------------------------------------------------------------ */
      /* Stairs                                                              */
      /* ------------------------------------------------------------------ */

      (
        level.stairs || []
      ).forEach(
        (
          stair,
          stairIndex
        ) => {
          const stairMaterial =
            stair.material === 'wooden-exterior'
              ? woodenStairMat
              : stair.material === 'stone-exterior'
                ? stoneStairMat
                : floorMat;

          const geometry =
            stairGeometry(
              stair,
              height
            );

          const stairElevation =
            level.elevation_feet === 0 &&
            stair.material !== 'interior'
              ? elevation - foundationHeight
              : elevation;

          geometry.segments.forEach(
            (
              segment,
              segmentIndex
            ) => {
              const dx =
                segment.end.x -
                segment.start.x;

              const dy =
                segment.end.y -
                segment.start.y;

              const run =
                Math.hypot(
                  dx,
                  dy
                );

              if (
                run < 0.01
              ) {
                return;
              }

              const angle =
                Math.atan2(
                  dy,
                  dx
                );

              if (
                segment.kind ===
                'landing'
              ) {
                const landingHeight = 0.3;
                box(
                  `stair-${stairIndex}-landing-${segmentIndex}`,

                  segment.center?.x ?? (segment.start.x + segment.end.x) / 2,

                  stairElevation +
                  segment.rise_start +
                  landingHeight / 2 - landingHeight,

                  segment.center?.y ?? (segment.start.y + segment.end.y) / 2,

                  segment.depth || run,

                  landingHeight,

                  segment.width || stair.width || 3,

                  segment.direction ?? angle,

                  stairMaterial
                );

                return;
              }

              const rise =
                segment.rise_end -
                segment.rise_start;

              const steps =
                Math.max(
                  1,

                  Math.ceil(
                    rise /
                    0.8
                  )
                );

              const stepRun =
                run /
                steps;

              const stepRise =
                rise /
                steps;

              for (
                let i = 0;
                i < steps;
                i++
              ) {
                const t =
                  (
                    i + 0.5
                  ) /
                  steps;

                box(
                  `stair-${stairIndex}-${segmentIndex}-${i}`,

                  segment.start.x +
                  dx * t,

                  stairElevation +
                  segment.rise_start +
                  stepRise *
                  (
                    i +
                    0.5
                  ),

                  segment.start.y +
                  dy * t,

                  stepRun +
                  0.04,

                  stepRise,

                  stair.width ||
                  3,

                  angle,

                  stairMaterial
                );
              }
            }
          );
        }
      );

      /* ------------------------------------------------------------------ */
      /* Ladders                                                             */
      /* ------------------------------------------------------------------ */

      (
        level.ladders || []
      ).forEach(
        (
          ladder,
          index
        ) => {
          for (
            const side of [
              -1,
              1,
            ]
          ) {
            box(
              `ladder-rail-${index}-${side}`,

              ladder.x +
              side *
              ladder.width *
              0.35,

              elevation +
              height /
              2,

              ladder.y,

              0.15,
              height,
              0.15,
              0,
              floorMat
            );
          }

          for (
            let rung = 1;
            rung < height;
            rung++
          ) {
            box(
              `ladder-rung-${index}-${rung}`,

              ladder.x,

              elevation +
              rung,

              ladder.y,

              ladder.width *
              0.7,

              0.12,
              0.12,
              0,

              floorMat
            );
          }
        }
      );

      if (
        building.level_view !==
        'all'
      ) {
        levelConnectionGuides(
          building,
          level
        ).forEach(
          (
            guide,
            index
          ) =>
            box(
              `connection-guide-${index}`,

              guide.x,

              elevation +
              0.08,

              guide.y,

              3,
              0.15,
              3,
              0,
              markerMat
            )
        );
      }

      // Reference images remain editor-only.
    }
  );

  if (building.show_roofs) {
    [...building.roofs, ...automaticRoofFootprints(building)].forEach(roof => {
      if (!isRoofVisible(building, roof)) return;

      const support = building.levels.find(
        level => level.id === roof.support_level_id
      );
      if (!support) return;

      const mesh = createBlueprintRoofMesh(
        scene,
        roof,
        roofBaseElevation(building, roof),
        building.id
      );
      if (!mesh) return;

      mesh.parent = root;
      mesh.metadata = {
        settlement: true,
        kind: 'building-roof',
        item: source,
        roofId: roof.id,
      };
      roofMaterials.push(mesh.material);
    });
  }

  root.onDisposeObservable.add(
    () => {
      wallMat.dispose();
      Object.values(finishMaterials).forEach(material => material.dispose(false, true));
      foundationMat.dispose(false, true);
      floorMat.dispose();
      markerMat.dispose();
      chimneyMat.dispose();
      fireplaceMat.dispose();
      platformMat.dispose();
      railingMat.dispose();
      roofMaterials.forEach(material => material.dispose());
    }
  );

  return root;
}
