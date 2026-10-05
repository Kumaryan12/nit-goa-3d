// Keep the existing instanced panes, with stable lit/dim rooms and no extra
// meshes, textures, draw calls or per-window lights.
export function applyNightWindows(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vRoomLight;').replace('#include <begin_vertex>',`#include <begin_vertex>
    vRoomLight=1.;
    #ifdef USE_INSTANCING
      float seed=dot(instanceMatrix[3].xyz,vec3(.1031,.11369,.13787));
      float room=fract(sin(seed)*43758.5453);
      vRoomLight=room>.32?.55+.45*fract(sin(seed+8.)*10321.):.025;
    #endif`)
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vRoomLight;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vRoomLight;')
}
