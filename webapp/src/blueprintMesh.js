import {
  MeshBuilder,
  TransformNode,
  Vector3,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Color3,
  Mesh,
} from '@babylonjs/core';

import earcut from 'earcut';

import {
  FEET_PER_SCENE_UNIT as SCALE,
} from './settlementEditor';

import {
  normalizeBlueprint,
  isRoofVisible,
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
} from './buildingBlueprint';

import { createBlueprintRoofMesh } from './roofMesh';

export function createBlueprintMesh(
  scene,
  source,
  ground = 0
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

    (
      ground +
      (
        Number(
          building.elevation
        ) || 0
      )
    ) /
    SCALE,

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

  const foundationMat =
    mat(
      'foundation-stone',
      '#8c8980'
    );

  const foundationFinish =
    building.foundation_material === 'exterior'
      ? wallMat
      : foundationMat;

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
    foundationMat.diffuseTexture = stoneTexture;
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

      if (
        foundationHeight > 0 &&
        level.elevation_feet === 0
      ) {
        (level.outline || []).forEach(
          (wall, wallIndex) => {
            const length = wallLength(wall);

            if (length < 0.1) return;

            const pieces = wall.type === 'arc'
              ? Math.ceil(length)
              : 1;
            const pieceWidth = length / pieces;

            for (let pieceIndex = 0; pieceIndex < pieces; pieceIndex++) {
              const distance = pieceWidth * (pieceIndex + 0.5);
              const point = wallPointAtDistance(wall, distance);
              const tangent = wallTangentAtDistance(wall, distance);

              box(
                `foundation-${level.id}-${wallIndex}-${pieceIndex}`,
                point.x,
                level.elevation_feet + foundationHeight / 2,
                point.y,
                pieceWidth + 0.06,
                foundationHeight,
                wall.thickness || 0.5,
                Math.atan2(tangent.y, tangent.x),
                foundationFinish
              );
            }
          }
        );
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

          floorMat
        );

      floor.position.y =
        elevation / SCALE;

      /* ------------------------------------------------------------------ */
      /* Walls                                                               */
      /* ------------------------------------------------------------------ */

      const walls =
        blueprintWalls(level);

      walls.forEach(
        (
          wall,
          wallIndex
        ) => {
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
                  )
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

                box(
                  `wall-${level.id}-${wallIndex}-${panelIndex}-${pieceIndex}`,

                  point.x,

                  elevation +
                  panel.y,

                  point.y,

                  pieceWidth +
                  0.06,

                  panel.height,

                  wall.thickness ||
                  0.5,

                  Math.atan2(
                    tangent.y,
                    tangent.x
                  )
                );
              }
            }
          );
        }
      );

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
                box(
                  `stair-${stairIndex}-landing-${segmentIndex}`,

                  (
                    segment.start.x +
                    segment.end.x
                  ) /
                  2,

                  stairElevation +
                  segment.rise_start +
                  0.15,

                  (
                    segment.start.y +
                    segment.end.y
                  ) /
                  2,

                  run,

                  0.3,

                  stair.width ||
                  3,

                  angle,

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
    building.roofs.forEach(roof => {
      if (!isRoofVisible(building, roof)) return;

      const support = building.levels.find(
        level => level.id === roof.support_level_id
      );
      if (!support) return;

      const mesh = createBlueprintRoofMesh(
        scene,
        roof,
        support.elevation_feet +
          support.floor_height +
          building.foundation_height_feet +
          roof.elevation_offset,
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