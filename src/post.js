import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    damage: { value: 0 },
    vignette: { value: 0.82 },
    grain: { value: 0.055 },
    saturation: { value: 1.08 },
    contrast: { value: 1.06 },
    chromatic: { value: 0.5 },
    resolution: { value: new THREE.Vector2(1, 1) }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float damage;
    uniform float vignette;
    uniform float grain;
    uniform float saturation;
    uniform float contrast;
    uniform float chromatic;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      vec2 center = uv - 0.5;
      float dist = length(center);

      vec2 ca = center * dist * chromatic * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - ca).b;

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, saturation);
      col = (col - 0.5) * contrast + 0.5;

      col *= vec3(1.015, 1.0, 1.035);
      col += vec3(0.012, 0.006, 0.028) * (1.0 - smoothstep(0.0, 0.7, luma));
      col += vec3(0.045, 0.018, -0.012) * smoothstep(0.55, 1.0, luma);

      float vig = smoothstep(0.95, 0.28, dist * vignette);
      col *= mix(0.62, 1.0, vig);

      float n = hash(uv * resolution + fract(time * 13.7));
      col += (n - 0.5) * grain;

      float edge = smoothstep(0.18, 0.68, dist);
      col = mix(col, col * vec3(1.15, 0.42, 0.38) + vec3(0.045, 0.0, 0.0), damage * edge * 0.9);

      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }`
}

export class PostFX {
  constructor(renderer, scene, camera, quality = 'balanced') {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.quality = quality
    this.composer = new EffectComposer(renderer)
    this.renderPass = new RenderPass(scene, camera)
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.62, 0.82)
    this.gradePass = new ShaderPass(GradeShader)
    this.fxaaPass = new ShaderPass(FXAAShader)
    this.outputPass = new OutputPass()
    this.composer.addPass(this.renderPass)
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(this.gradePass)
    this.composer.addPass(this.fxaaPass)
    this.composer.addPass(this.outputPass)
    this.time = 0
    this.damage = 0
    this.setQuality(quality)
  }

  setQuality(quality) {
    this.quality = quality
    const res = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.gradePass.uniforms.resolution.value.copy(res)
    this.fxaaPass.material.uniforms.resolution.value.set(1 / res.x, 1 / res.y)
    this.fxaaPass.enabled = quality === 'high'
    this.bloomPass.enabled = quality !== 'performance'
    this.bloomPass.strength = quality === 'high' ? 0.62 : quality === 'balanced' ? 0.46 : 0
    this.bloomPass.radius = 0.7
    this.bloomPass.threshold = quality === 'high' ? 0.78 : 0.88
    this.gradePass.uniforms.grain.value = quality === 'performance' ? 0.03 : 0.052
    this.gradePass.uniforms.chromatic.value = quality === 'high' ? 0.6 : 0.35
  }

  setSize(width, height) {
    const dpr = this.renderer.getPixelRatio()
    this.composer.setPixelRatio(dpr)
    this.composer.setSize(width, height)
    this.bloomPass.setSize(width * dpr, height * dpr)
    const res = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.gradePass.uniforms.resolution.value.copy(res)
    this.fxaaPass.material.uniforms.resolution.value.set(1 / res.x, 1 / res.y)
  }

  setDamage(v) { this.damage = v }

  render(dt) {
    this.time += dt
    this.gradePass.uniforms.time.value = this.time
    this.gradePass.uniforms.damage.value += (this.damage - this.gradePass.uniforms.damage.value) * Math.min(1, dt * 8)
    this.damage = Math.max(0, this.damage - dt * 1.8)
    this.composer.render(dt)
  }
}
