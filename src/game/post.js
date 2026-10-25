import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    damage: { value: 0 },
    grain: { value: 0.032 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform float damage;
    uniform float grain;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);

      float aberration = 0.0016 * r2 + damage * 0.006 * r2;
      vec3 color;
      color.r = texture2D(tDiffuse, uv + centered * aberration * 2.0).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - centered * aberration * 2.0).b;

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, 1.06);
      color *= vec3(0.985, 1.0, 1.022);
      color = pow(max(color, 0.0), vec3(1.02, 1.0, 0.985));

      float vignette = smoothstep(0.98, 0.22, length(centered) * 1.22);
      color *= mix(1.0, vignette, 0.72);

      float redEdge = smoothstep(0.26, 0.62, length(centered)) * damage;
      color = mix(color, color * vec3(1.55, 0.42, 0.38), redEdge * 0.5);

      float noise = hash(uv * resolution + fract(time) * 137.0);
      color += (noise - 0.5) * grain;

      gl_FragColor = vec4(color, 1.0);
    }
  `
}

export function createPost(renderer, scene, camera, options = {}) {
  const size = new THREE.Vector2()
  renderer.getSize(size)
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.setSize(size.x, size.y)

  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), options.bloomStrength ?? 0.62, 0.62, 0.78)
  bloom.enabled = options.bloom !== false
  composer.addPass(bloom)

  composer.addPass(new OutputPass())

  const grade = new ShaderPass(GradeShader)
  grade.uniforms.resolution.value.set(size.x, size.y)
  composer.addPass(grade)

  const fxaa = new ShaderPass(FXAAShader)
  const maxDpr = Math.min(renderer.getPixelRatio(), 2)
  fxaa.uniforms.resolution.value.set(1 / (size.x * maxDpr), 1 / (size.y * maxDpr))
  fxaa.enabled = options.fxaa !== false
  composer.addPass(fxaa)

  return {
    composer,
    bloom,
    grade,
    fxaa,
    render(time, damage = 0) {
      grade.uniforms.time.value = time
      grade.uniforms.damage.value = damage
      composer.render()
    },
    setSize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(width, height)
      grade.uniforms.resolution.value.set(width, height)
      fxaa.uniforms.resolution.value.set(1 / (width * renderer.getPixelRatio()), 1 / (height * renderer.getPixelRatio()))
      bloom.setSize(width, height)
    },
    setQuality(level) {
      if (level === 'low') {
        bloom.enabled = false
        fxaa.enabled = false
      } else if (level === 'medium') {
        bloom.enabled = true
        bloom.strength = 0.48
        fxaa.enabled = false
      } else {
        bloom.enabled = true
        bloom.strength = options.bloomStrength ?? 0.62
        fxaa.enabled = options.fxaa !== false
      }
    }
  }
}
