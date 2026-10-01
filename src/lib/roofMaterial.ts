import type { Material } from 'three'

// A procedural tile pattern keeps roofs asset-free while using standard
// lighting and shadows. Tile coordinates are in footprint meters.
export const applyRoofTiles: Material['onBeforeCompile'] = (shader) => {
  shader.vertexShader = `varying vec2 vRoofTile;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoofTile = position.xy;')
  shader.fragmentShader = `varying vec2 vRoofTile;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `
    #include <color_fragment>
    vec2 tile = vRoofTile * vec2(1.5, 2.8);
    tile.x += mod(floor(tile.y), 2.0) * 0.5;
    vec2 cell = fract(tile);
    vec2 pixel = fwidth(tile);
    float seam = smoothstep(0.015, 0.09 + pixel.x, cell.x) * smoothstep(0.015, 0.1 + pixel.y, cell.y);
    float variation = fract(sin(dot(floor(tile), vec2(12.9898, 78.233))) * 43758.5453);
    float detail = 1.0 - smoothstep(0.35, 0.9, max(pixel.x, pixel.y));
    diffuseColor.rgb *= mix(0.95, mix(0.57, 0.9 + variation * 0.2, seam), detail);
  `)
}
