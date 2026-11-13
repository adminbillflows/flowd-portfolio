import * as THREE from 'three';

// A cheap "fluid-like" trail: a ping-pong texture that stores mouse velocity (rg)
// and intensity (b). Each frame it self-advects, swirls a little and dissipates.
// The post pass uses it to push pixels around, which reads as liquid distortion.
export class Fluid {
  constructor(renderer, size = 256) {
    this.renderer = renderer;
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.read = new THREE.WebGLRenderTarget(size, size, opts);
    this.write = new THREE.WebGLRenderTarget(size, size, opts);
    this.mouse = new THREE.Vector2(0.5, 0.5);
    this.prev = new THREE.Vector2(0.5, 0.5);
    this.vel = new THREE.Vector2();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tPrev: { value: null },
        uMouse: { value: this.mouse },
        uVel: { value: this.vel },
        uAspect: { value: 1 },
        uRadius: { value: 0.0025 },
        uDiss: { value: 0.955 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tPrev; uniform vec2 uMouse; uniform vec2 uVel;
        uniform float uAspect; uniform float uRadius; uniform float uDiss;
        varying vec2 vUv;
        void main(){
          vec4 prev = texture2D(tPrev, vUv);
          vec4 adv = texture2D(tPrev, vUv - prev.xy * 0.012);
          float a = 0.035;
          adv.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * adv.xy;
          vec2 d = vUv - uMouse; d.x *= uAspect;
          float splat = exp(-dot(d, d) / uRadius);
          vec3 col = adv.xyz * uDiss + vec3(uVel * splat, length(uVel) * splat);
          col.xy = clamp(col.xy, -2.0, 2.0); col.z = min(col.z, 2.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }
  get texture() { return this.read.texture; }
  setAspect(a) { this.material.uniforms.uAspect.value = a; }
  pointer(x, y) { this.mouse.set(x, y); }
  update() {
    this.vel.copy(this.mouse).sub(this.prev).multiplyScalar(40).clampLength(0, 1.6);
    this.prev.copy(this.mouse);
    this.material.uniforms.tPrev.value = this.read.texture;
    this.renderer.setRenderTarget(this.write);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    [this.read, this.write] = [this.write, this.read];
  }
}
