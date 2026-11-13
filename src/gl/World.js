import * as THREE from 'three';
import gsap from 'gsap';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { Fluid } from './Fluid.js';
import { placeholderCanvas } from '../placeholder.js';

const BG = new THREE.Color('#0b0b0b');
const ACCENT = new THREE.Color('#ff5a1f');
const SPACING = 3.4;      // distance between cards along z
const CAM_Z = 5;

export function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

/**
 * The persistent 3D world behind every page:
 * fog, a rippling mirror floor, a glowing "flow" portal, dust,
 * and on the home page an endless corridor of work cards that scroll toward the camera.
 */
export class World {
  constructor(canvas, { onCardHover, onCardClick, onActiveChange } = {}) {
    this.canvas = canvas;
    this.cb = { onCardHover, onCardClick, onActiveChange };
    this.isTouch = matchMedia('(pointer: coarse)').matches;

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.isTouch ? 1.5 : 1.75));
    r.setClearColor(BG, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(BG, 0.055);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 0.2, CAM_Z);

    // state driven by GSAP for mode changes
    this.state = { cardsAlpha: 0, camY: 0.2, lookY: 0, dim: 1, fluid: 1, intro: 0 };
    this.scroll = { target: 0, current: 0, velocity: 0 };
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    this.drag = { active: false, startX: 0, startY: 0, lastY: 0, lastX: 0, moved: 0, yaw: 0, yawTarget: 0 };
    this.mode = 'home';
    this.cards = [];
    this.hovered = null;
    this.activeIndex = -1;
    this.clock = new THREE.Clock();

    this.#buildEnvironment();
    this.#buildPost();
    this.#bind();
    this.resize();
    this.renderer.setAnimationLoop(() => this.#tick());
  }

  // ---------- environment ----------
  #buildEnvironment() {
    // mirror water
    const floor = new Reflector(new THREE.PlaneGeometry(220, 220), {
      textureWidth: 1024, textureHeight: 1024, color: 0x0e0d0c,
      shader: {
        name: 'FlowWater',
        uniforms: {
          color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
          uTime: { value: 0 }, uFogColor: { value: BG }, uFogDensity: { value: 0.055 }, uCam: { value: new THREE.Vector3() },
          uFluid: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: /* glsl */`
          uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
          void main(){
            vUv = textureMatrix * vec4(position, 1.0);
            vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime;
          uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uCam;
          uniform sampler2D uFluid; uniform vec2 uRes;
          varying vec4 vUv; varying vec3 vWorld;
          void main(){
            vec2 w = vWorld.xz;
            float n = sin(w.x * 1.7 + uTime * 0.7) * 0.5 + sin(w.y * 2.3 - uTime * 0.9 + w.x * 0.5) * 0.35
                    + sin((w.x + w.y) * 4.1 + uTime * 1.3) * 0.15;
            vec2 screen = gl_FragCoord.xy / uRes;
            vec4 f = texture2D(uFluid, screen);
            vec4 uv = vUv;
            uv.xy += (vec2(n * 0.025, n * 0.012) + f.xy * 0.06) * uv.w;   // ripples + mouse "wake"
            vec3 refl = texture2DProj(tDiffuse, uv).rgb;
            float dist = length(vWorld - uCam);
            float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
            vec3 col = color + refl * 0.62;
            col = mix(col, uFogColor, fog);
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      },
    });
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.25;
    this.floor = floor;
    this.scene.add(floor);

    // the "flow" portal: a soft glow and two slow rings, far away so it reflects in the water
    const portal = (this.portal = new THREE.Group());
    portal.position.set(0, 3.2, -48);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: ACCENT }, uTime: { value: 0 }, uAlpha: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */`
          uniform vec3 uColor; uniform float uTime; uniform float uAlpha; varying vec2 vUv;
          void main(){
            float d = length(vUv - 0.5);
            float core = smoothstep(0.12, 0.0, d);
            float halo = pow(smoothstep(0.5, 0.0, d), 3.0) * (0.55 + 0.08 * sin(uTime * 0.8));
            gl_FragColor = vec4(uColor * (halo * 0.6 + core * 0.9), 1.0) * uAlpha;
          }`,
      })
    );
    portal.add(glow);
    this.glow = glow;
    const ringMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55, fog: false });
    this.rings = [7, 9.5].map((rad, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.035 + i * 0.02, 8, 160), ringMat);
      m.rotation.x = 0.3 + i * 0.5;
      portal.add(m);
      return m;
    });
    this.scene.add(portal);

    // drifting dust
    const COUNT = this.isTouch ? 500 : 900;
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = -1.1 + Math.random() * 7;
      pos[i * 3 + 2] = Math.random() * 46;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dust = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScroll: { value: 0 }, uPR: { value: this.renderer.getPixelRatio() }, uColor: { value: new THREE.Color('#ffd9c4') } },
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uScroll; uniform float uPR; attribute float aSeed; varying float vA;
        void main(){
          vec3 p = position;
          p.z = mod(p.z + uScroll * 1.8, 46.0) - 41.0;
          p.x += sin(uTime * 0.2 + aSeed * 30.0) * 0.4;
          p.y += sin(uTime * 0.3 + aSeed * 12.0) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.0 + aSeed * 2.2) * uPR * (6.0 / -mv.z);
          vA = smoothstep(46.0, 6.0, -mv.z) * smoothstep(0.2, 1.5, -mv.z) * (0.35 + aSeed * 0.5);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vA); }`,
    }));
    this.scene.add(this.dust);

    this.cardGroup = new THREE.Group();
    this.scene.add(this.cardGroup);
    this.cardGeo = new THREE.PlaneGeometry(2.4, 1.5, 24, 12);
  }

  // ---------- cards ----------
  setWorks(works) {
    this.cards.forEach((c) => { c.mesh.removeFromParent(); c.mesh.material.dispose(); c.texture?.dispose(); c.video?.pause(); });
    this.cards = [];
    this.activeIndex = -1;
    if (!works.length) return;
    // repeat short lists so the corridor never feels empty
    const list = [];
    while (list.length < 8) list.push(...works.map((w, i) => ({ work: w, index: i })));
    this.length = list.length * SPACING;
    list.forEach(({ work, index }, i) => {
      const side = i % 2 ? 1 : -1;
      const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
          uMap: { value: null }, uScale: { value: new THREE.Vector2(1, 1) }, uHover: { value: 0 },
          uAlpha: { value: 0 }, uBend: { value: 0 }, uTime: { value: 0 }, uShift: { value: 0 },
        }]),
        vertexShader: /* glsl */`
          #include <fog_pars_vertex>
          uniform float uBend; uniform float uTime; uniform float uHover; varying vec2 vUv;
          void main(){
            vUv = uv;
            vec3 p = position;
            p.z += sin(uv.x * 3.14159) * uBend;                      // bends with scroll speed
            p.z += sin(p.y * 2.5 + uTime * 1.2 + p.x) * 0.025;       // idle breathing
            p.z += sin(uv.x * 3.14159) * sin(uv.y * 3.14159) * uHover * 0.18;
            vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: /* glsl */`
          #include <fog_pars_fragment>
          uniform sampler2D uMap; uniform vec2 uScale; uniform float uHover; uniform float uAlpha; uniform float uShift;
          varying vec2 vUv;
          void main(){
            vec2 uv = (vUv - 0.5) * uScale * (1.0 - 0.08 * uHover) + 0.5;
            float s = 0.0025 * uShift + 0.002 * uHover;
            vec3 c = vec3(texture2D(uMap, uv + vec2(s, 0.0)).r, texture2D(uMap, uv).g, texture2D(uMap, uv - vec2(s, 0.0)).b);
            c *= 0.82 + 0.18 * uHover;
            vec2 e = smoothstep(vec2(0.0), vec2(0.006), vUv) * smoothstep(vec2(0.0), vec2(0.006), 1.0 - vUv);
            gl_FragColor = vec4(c, uAlpha * e.x * e.y);
            #include <fog_fragment>
            #include <colorspace_fragment>
          }`,
      });
      const mesh = new THREE.Mesh(this.cardGeo, material);
      const rand = (n) => (Math.sin((i + 1) * n * 12.9898) * 43758.5453) % 1;
      const card = {
        mesh, work, index,
        baseZ: -i * SPACING,
        x: side * (1.7 + Math.abs(rand(1)) * 0.8),
        y: 0.15 + rand(2) * 0.35,
        hover: 0,
      };
      mesh.userData.card = card;
      this.#loadTexture(card);
      this.cardGroup.add(mesh);
      this.cards.push(card);
    });
  }

  #loadTexture(card) {
    const { work } = card;
    const u = card.mesh.material.uniforms;
    const fit = (w, h) => {
      const planeA = 2.4 / 1.5, texA = w / h;
      u.uScale.value.set(texA > planeA ? planeA / texA : 1, texA > planeA ? 1 : texA / planeA);
    };
    const usePlaceholder = () => {
      const t = new THREE.CanvasTexture(placeholderCanvas(work, card.index));
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      card.texture = t; u.uMap.value = t; fit(1200, 750);
    };
    usePlaceholder();
    if (!work.cover) return;
    if (work.cover.type === 'video') {
      const v = document.createElement('video');
      Object.assign(v, { src: work.cover.url, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
      v.addEventListener('loadeddata', () => {
        const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace;
        card.texture?.dispose(); card.texture = t; card.video = v; u.uMap.value = t; fit(v.videoWidth, v.videoHeight);
      }, { once: true });
      v.play().catch(() => {});
    } else {
      new THREE.TextureLoader().load(work.cover.url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        card.texture?.dispose(); card.texture = t; u.uMap.value = t; fit(t.image.width, t.image.height);
      });
    }
  }

  // ---------- post processing ----------
  #buildPost() {
    this.fluid = new Fluid(this.renderer, this.isTouch ? 128 : 256);
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: this.sceneRT.texture }, tFluid: { value: null }, uDim: { value: 1 }, uStrength: { value: 1 }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tScene; uniform sampler2D tFluid; uniform float uDim; uniform float uStrength; uniform float uTime;
        varying vec2 vUv;
        void main(){
          vec4 f = texture2D(tFluid, vUv);
          vec2 off = f.xy * 0.02 * uStrength;
          float s = f.z * 0.006 * uStrength;
          vec2 uv = vUv - off;
          vec3 col = vec3(texture2D(tScene, uv + vec2(s, 0.0)).r, texture2D(tScene, uv).g, texture2D(tScene, uv - vec2(s, 0.0)).b);
          vec2 q = vUv - 0.5;
          col *= mix(0.5, 1.0, smoothstep(0.85, 0.2, length(q * vec2(1.0, 1.25))));
          col *= uDim;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
  }

  // ---------- input ----------
  #bind() {
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(-10, -10);
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
      this.ndc.set(this.pointer.x, this.pointer.y);
      this.fluid.pointer(e.clientX / innerWidth, 1 - e.clientY / innerHeight);
      if (this.drag.active) {
        const dy = e.clientY - this.drag.lastY, dx = e.clientX - this.drag.lastX;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        if (this.mode === 'home' && this.interactive) {
          this.scroll.target -= dy * 0.012;
          this.drag.yawTarget = THREE.MathUtils.clamp(this.drag.yawTarget + dx * 0.0015, -0.45, 0.45);
        }
        this.drag.lastY = e.clientY; this.drag.lastX = e.clientX;
      }
    }, { passive: true });
    this.canvas.addEventListener('pointerdown', (e) => {
      Object.assign(this.drag, { active: true, lastY: e.clientY, lastX: e.clientX, moved: 0 });
      document.body.classList.add('is-dragging');
    });
    addEventListener('pointerup', () => {
      if (!this.drag.active) return;
      this.drag.active = false;
      document.body.classList.remove('is-dragging');
      if (this.drag.moved < 6 && this.hovered && this.mode === 'home' && this.interactive) this.cb.onCardClick?.(this.hovered);
    });
    addEventListener('wheel', (e) => {
      if (this.mode !== 'home' || !this.interactive) return;
      this.scroll.target += (e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY) * 0.0045;
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (this.mode !== 'home' || !this.interactive) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') this.scroll.target += SPACING;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') this.scroll.target -= SPACING;
    });
  }

  resize() {
    const w = innerWidth, h = innerHeight, pr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 58 : 42;   // wider lens on portrait phones
    this.camera.updateProjectionMatrix();
    this.sceneRT.setSize(w * pr, h * pr);
    this.fluid.setAspect(w / h);
    this.floor.material.uniforms.uRes.value.set(w * pr, h * pr);
  }

  // ---------- modes ----------
  setMode(mode, { instant = false } = {}) {
    this.mode = mode;
    const home = mode === 'home';
    this.interactive = home;
    const d = instant ? 0 : 1.6;
    gsap.to(this.state, {
      cardsAlpha: home ? 1 : 0,
      camY: home ? 0.2 : 1.6,
      lookY: home ? 0 : 1.2,
      dim: home ? 1 : mode === 'project' ? 0.38 : 0.55,
      duration: d, ease: 'expo.inOut', overwrite: true,
    });
    if (!home) this.#setHover(null);
  }

  intro() {
    gsap.fromTo(this.state, { intro: 0 }, { intro: 1, duration: 3.2, ease: 'expo.out' });
  }

  /** Fly toward a card, used right before navigating to its project page. */
  focusCard(card) {
    this.interactive = false;
    const z = card.mesh.position.z;
    return gsap.to(this.scroll, { target: this.scroll.current + (CAM_Z - 2.2 - z), duration: 1.0, ease: 'expo.inOut' });
  }

  scrollBy(amount) { this.scroll.target += amount; }

  #setHover(card) {
    if (this.hovered === card) return;
    this.hovered = card;
    this.cb.onCardHover?.(card);
  }

  // ---------- frame ----------
  #tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const k = 1 - Math.pow(0.0015, dt);    // frame-rate independent lerp

    // scroll
    const s = this.scroll;
    const prev = s.current;
    s.current += (s.target - s.current) * (1 - Math.pow(0.02, dt));
    s.velocity = s.current - prev;

    // camera: pointer parallax + drag yaw + mode height
    const p = this.pointer;
    p.sx += (p.x - p.sx) * k * 0.6; p.sy += (p.y - p.sy) * k * 0.6;
    if (!this.drag.active) this.drag.yawTarget *= 0.985;
    this.drag.yaw += (this.drag.yawTarget - this.drag.yaw) * k;
    const introOffset = (1 - this.state.intro) * 6;
    this.camera.position.set(p.sx * 0.35, this.state.camY + p.sy * 0.18 + introOffset * 0.3, CAM_Z + introOffset);
    this.camera.lookAt(p.sx * 0.6 + Math.sin(this.drag.yaw) * 8, this.state.lookY + p.sy * 0.25, -10);
    this.camera.rotateZ(-s.velocity * 0.02);

    // cards
    const L = this.length || 1;
    const near = CAM_Z - 0.6;
    let best = null, bestD = Infinity;
    for (const c of this.cards) {
      const z = near - (((near - (c.baseZ + s.current)) % L) + L) % L;
      c.mesh.position.set(c.x, c.y + Math.sin(t * 0.5 + c.baseZ) * 0.06, z);
      c.mesh.rotation.y = -c.x * 0.09 + this.drag.yaw * 0.3;
      const alpha = THREE.MathUtils.smoothstep(z, near - L, near - L + 4) * (1 - THREE.MathUtils.smoothstep(z, CAM_Z - 4.2, near - 0.4));
      const u = c.mesh.material.uniforms;
      c.hover += ((this.hovered === c ? 1 : 0) - c.hover) * k;
      u.uHover.value = c.hover;
      u.uAlpha.value = alpha * this.state.cardsAlpha;
      u.uBend.value = THREE.MathUtils.clamp(s.velocity * 2.5, -0.6, 0.6);
      u.uShift.value = Math.min(Math.abs(s.velocity) * 4, 1);
      u.uTime.value = t;
      c.mesh.visible = u.uAlpha.value > 0.003;
      const d = Math.abs(z - 0.4);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best && best.index !== this.activeIndex) {
      this.activeIndex = best.index;
      this.cb.onActiveChange?.(best);
    }

    // hover picking (home only, not while dragging)
    if (this.mode === 'home' && this.interactive && !this.drag.active && !this.isTouch) {
      this.raycaster.setFromCamera(this.ndc, this.camera);
      const hit = this.raycaster.intersectObjects(this.cards.filter((c) => c.mesh.visible && c.mesh.material.uniforms.uAlpha.value > 0.4).map((c) => c.mesh))[0];
      this.#setHover(hit ? hit.object.userData.card : null);
    }

    // environment
    this.floor.material.uniforms.uTime.value = t;
    this.floor.material.uniforms.uCam.value.copy(this.camera.position);
    this.floor.material.uniforms.uFluid.value = this.fluid.texture;
    this.glow.material.uniforms.uTime.value = t;
    this.rings[0].rotation.z = t * 0.05; this.rings[1].rotation.z = -t * 0.035;
    this.rings[0].rotation.y = Math.sin(t * 0.1) * 0.3;
    this.dust.material.uniforms.uTime.value = t;
    this.dust.material.uniforms.uScroll.value = s.current;

    // render: fluid -> scene -> post
    this.fluid.update();
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.postMat.uniforms.tFluid.value = this.fluid.texture;
    this.postMat.uniforms.uDim.value = this.state.dim * Math.min(1, this.state.intro * 1.5);
    this.postMat.uniforms.uTime.value = t;
    this.renderer.render(this.postScene, this.postCam);
  }
}
