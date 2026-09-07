import type DiceBoxModule from '@3d-dice/dice-box-threejs';
import {
    BackSide,
    Color,
    LinearFilter,
    LinearMipmapLinearFilter,
    SRGBColorSpace,
    ShaderMaterial,
    Vector3,
} from '@3d-dice/dice-box-threejs/node_modules/three/build/three.module.js';
import type { DiceBoxConfig, DiceBoxDie, DiceBoxMaterialInstance } from '@3d-dice/dice-box-threejs';

import type {
    DicePhysicsHighlightState,
    DicePhysicsHighlightVariant,
    DicePhysicsMotionSnapshot,
    DicePhysicsProjectedLayout,
    DicePhysicsRendererMode,
    DicePhysicsState,
} from '../dice-physics/types';

export type DiceBoxProjectedLayout = DicePhysicsProjectedLayout;
export type DiceBoxMotionSnapshot = DicePhysicsMotionSnapshot;

export type DiceBoxMaterial = NonNullable<DiceBoxConfig['theme_material']>;
export type DiceBoxCustomColorset = NonNullable<DiceBoxConfig['theme_customColorset']>;

export interface DiceBoxStyleProfile {
    id: string;
    surface?: string;
    colorset?: string;
    customColorset?: DiceBoxCustomColorset | null;
    texture?: string;
    material?: DiceBoxMaterial;
    soundMaterial?: string;
    colorSpotlight?: number;
    shadows?: boolean;
    gravityMultiplier?: number;
    lightIntensity?: number;
    baseScale?: number;
    cameraZoom?: number;
    strength?: number;
    iterationLimit?: number;
    projectedLayoutMargin?: number;
    projectedLayoutMinGap?: number;
}

export interface DiceBoxDieSkin {
    id: string;
    faceCanvases: Record<number, HTMLCanvasElement>;
    topFaceCanvas?: HTMLCanvasElement;
    edgeCanvas?: HTMLCanvasElement;
    faceImages?: Record<number, HTMLImageElement | HTMLCanvasElement>;
    faceLabels?: Record<number, string>;
    preferPresetMaterials?: boolean;
}

export interface DiceBoxEngineConfig {
    styleProfile?: DiceBoxStyleProfile;
    rendererMode?: DicePhysicsRendererMode;
    canvasTestId?: string;
    /**
     * @deprecated Use styleProfile.customColorset. Kept temporarily so callers can
     * be migrated without coupling game UI to third-party option names.
     */
    themeCustomColorset?: DiceBoxConfig['theme_customColorset'];
}

type DiceBoxThrowVector = {
    pos?: DiceBoxVectorLike;
    velocity?: DiceBoxVectorLike;
};

type DiceBoxInternalNotationVector = {
    vectors?: DiceBoxThrowVector[];
    result?: number[];
};

type DiceBoxInternalRuntime = InstanceType<typeof DiceBoxModule> & {
    iteration?: number;
    last_time?: number;
    notationVectors?: DiceBoxInternalNotationVector | null;
    reroll?: (indices: number[]) => Promise<unknown>;
    startClickThrow?: (notation: string) => DiceBoxInternalNotationVector | null;
    spawnDice?: (vector: DiceBoxThrowVector, die?: DiceBoxDie) => void;
    simulateThrow?: () => void;
    steps?: number;
};

type DiceBoxRendererLike = InstanceType<typeof DiceBoxModule>['renderer'] & {
    clear?: () => void;
    getClearAlpha?: () => number;
    getContext?: () => WebGLRenderingContext | WebGL2RenderingContext | null;
    getContextAttributes?: () => WebGLContextAttributes | null;
    getRenderTarget?: () => unknown;
    info?: unknown;
    outputColorSpace?: unknown;
    physicallyCorrectLights?: boolean;
    toneMapping?: unknown;
};

type DiceBoxVectorLike = {
    x: number;
    y: number;
    z: number;
    set?: (x: number, y: number, z: number) => void;
};

type DiceBoxQuaternionLike = {
    x: number;
    y: number;
    z: number;
    w: number;
    copy?: (quaternion: DiceBoxQuaternionLike) => void;
    set?: (x: number, y: number, z: number, w: number) => void;
};

type DiceBoxQuaternionSnapshot = {
    x: number;
    y: number;
    z: number;
    w: number;
};

type DiceBoxBodyLike = {
    position?: DiceBoxVectorLike;
    quaternion?: DiceBoxQuaternionLike;
    velocity?: DiceBoxVectorLike;
    angularVelocity?: DiceBoxVectorLike;
    type?: number;
    mass?: number;
    updateMassProperties?: () => void;
    wakeUp?: () => void;
    sleep?: () => void;
    aabbNeedsUpdate?: boolean;
};

type DiceBoxDieWithBody = DiceBoxDie & {
    body?: DiceBoxBodyLike;
};

type DiceBoxSurfaceObject = {
    type?: string;
    name?: string;
    isMesh?: boolean;
    visible?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
    material?: DiceBoxMaterialInstance | DiceBoxMaterialInstance[];
    traverse?: (visitor: (object: DiceBoxSurfaceObject) => void) => void;
};

type DiceBoxHighlightMaterial = ShaderMaterial & {
    uniforms: {
        uColor: { value: Color };
        uOpacity: { value: number };
    };
};

type DiceBoxHighlightMesh = DiceBoxSurfaceObject & {
    clone?: (recursive?: boolean) => DiceBoxHighlightMesh;
    position: DiceBoxVectorLike;
    quaternion?: DiceBoxQuaternionLike;
    rotation: DiceBoxVectorLike;
    scale: DiceBoxVectorLike;
    renderOrder: number;
    frustumCulled?: boolean;
    updateMatrixWorld?: (force?: boolean) => void;
    material: DiceBoxHighlightMaterial;
};

type DiceBoxDieTransformSnapshot = {
    position: { x: number; y: number; z: number };
    quaternion: { x: number; y: number; z: number; w: number };
    bodyType?: number;
    bodyMass?: number;
};

type DiceBoxWorldBounds = {
    width: number;
    height: number;
};

type DiceBoxProjectedPoint = {
    x: number;
    y: number;
};

type DiceBoxProjectedOrientedBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
    rotateZ: number;
};

type DiceBoxProjectedFaceOutline = {
    x: number;
    y: number;
    width: number;
    height: number;
    points: DiceBoxProjectedPoint[];
};

type DiceBoxHighlightShell = {
    dieId: number;
    dieIndex: number;
    sourceDie: DiceBoxDie;
    variant: DicePhysicsHighlightVariant;
    mesh: DiceBoxHighlightMesh;
    material: DiceBoxHighlightMaterial;
    scale: number;
    opacity: number;
    color: DiceBoxColorRepresentation;
};

type DiceBoxColorRepresentation = number | string;

const DICE_HIGHLIGHT_RENDERER = 'threejs-backside-shader-shell';
const DEFAULT_DICE_HIGHLIGHT_COLORS: Record<DicePhysicsHighlightVariant, number> = {
    candidate: 0x00e7ff,
    selected: 0xffd447,
};
const DEFAULT_DICE_HIGHLIGHT_SCALE: Record<DicePhysicsHighlightVariant, number> = {
    candidate: 1.075,
    selected: 1.095,
};
const DEFAULT_DICE_HIGHLIGHT_OPACITY: Record<DicePhysicsHighlightVariant, number> = {
    candidate: 1,
    selected: 1,
};
const DICE_HIGHLIGHT_VERTEX_SHADER = `
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const DICE_HIGHLIGHT_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;

void main() {
    gl_FragColor = vec4(uColor, uOpacity);
}
`;

const DEFAULT_DICE_BOX_STYLE_PROFILE: DiceBoxStyleProfile = {
    id: 'default-green-felt',
    surface: 'green-felt',
    colorset: 'white',
    texture: '',
    material: 'plastic',
    soundMaterial: 'plastic',
    colorSpotlight: 0xefdfd5,
    shadows: true,
    gravityMultiplier: 400,
    lightIntensity: 0.7,
    baseScale: 90,
    strength: 0.92,
    iterationLimit: 1000,
};

function usesTransparentVirtualSurface(styleProfile: DiceBoxStyleProfile): boolean {
    return styleProfile.surface === 'transparent' || styleProfile.surface === 'transparent-virtual';
}

function normalizeProjectedAngle(angle: number): number {
    let normalized = angle;
    while (normalized <= -Math.PI / 2) normalized += Math.PI;
    while (normalized > Math.PI / 2) normalized -= Math.PI;
    return normalized;
}

function computeProjectedOrientedBounds(
    points: DiceBoxProjectedPoint[],
): DiceBoxProjectedOrientedBounds | null {
    if (points.length < 2) return null;

    const candidateAngles = new Set<string>(['0.000000']);
    for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
            const left = points[leftIndex];
            const right = points[rightIndex];
            const dx = right.x - left.x;
            const dy = right.y - left.y;
            if (Math.hypot(dx, dy) < 0.5) continue;
            candidateAngles.add(normalizeProjectedAngle(Math.atan2(dy, dx)).toFixed(6));
        }
    }

    let best:
        | (DiceBoxProjectedOrientedBounds & {
              area: number;
          })
        | null = null;
    for (const angleKey of candidateAngles) {
        const rotateZ = Number(angleKey);
        if (!Number.isFinite(rotateZ)) continue;
        const cos = Math.cos(rotateZ);
        const sin = Math.sin(rotateZ);
        let minU = Number.POSITIVE_INFINITY;
        let maxU = Number.NEGATIVE_INFINITY;
        let minV = Number.POSITIVE_INFINITY;
        let maxV = Number.NEGATIVE_INFINITY;
        for (const point of points) {
            const u = point.x * cos + point.y * sin;
            const v = -point.x * sin + point.y * cos;
            minU = Math.min(minU, u);
            maxU = Math.max(maxU, u);
            minV = Math.min(minV, v);
            maxV = Math.max(maxV, v);
        }
        const width = Math.max(1, maxU - minU);
        const height = Math.max(1, maxV - minV);
        const area = width * height;
        if (!Number.isFinite(area)) continue;
        if (best && area >= best.area - 0.01) continue;

        const centerU = (minU + maxU) / 2;
        const centerV = (minV + maxV) / 2;
        best = {
            area,
            x: centerU * cos - centerV * sin,
            y: centerU * sin + centerV * cos,
            width,
            height,
            rotateZ,
        };
    }

    return best;
}

function computeProjectedFaceOutline(
    bounds: { min: Vector3; max: Vector3 },
    matrixWorld: DiceBoxDie['matrixWorld'],
    camera: unknown,
    canvas: HTMLCanvasElement,
    projectLocalPoint: (x: number, y: number, z: number) => DiceBoxProjectedPoint,
): DiceBoxProjectedFaceOutline | null {
    const { min, max } = bounds;
    const cameraWorldPosition = new Vector3();
    const getCameraWorldPosition = (camera as {
        getWorldPosition?: (target: Vector3) => Vector3;
        position?: Vector3;
    }).getWorldPosition;
    if (typeof getCameraWorldPosition === 'function') {
        getCameraWorldPosition.call(camera, cameraWorldPosition);
    } else {
        const position = (camera as { position?: Vector3 }).position;
        if (!position) return null;
        cameraWorldPosition.copy(position);
    }

    type FaceCandidate = {
        normal: [number, number, number];
        corners: Array<[number, number, number]>;
    };

    const faces: FaceCandidate[] = [
        {
            normal: [1, 0, 0],
            corners: [
                [max.x, min.y, min.z],
                [max.x, max.y, min.z],
                [max.x, max.y, max.z],
                [max.x, min.y, max.z],
            ],
        },
        {
            normal: [-1, 0, 0],
            corners: [
                [min.x, min.y, max.z],
                [min.x, max.y, max.z],
                [min.x, max.y, min.z],
                [min.x, min.y, min.z],
            ],
        },
        {
            normal: [0, 1, 0],
            corners: [
                [min.x, max.y, min.z],
                [min.x, max.y, max.z],
                [max.x, max.y, max.z],
                [max.x, max.y, min.z],
            ],
        },
        {
            normal: [0, -1, 0],
            corners: [
                [min.x, min.y, max.z],
                [min.x, min.y, min.z],
                [max.x, min.y, min.z],
                [max.x, min.y, max.z],
            ],
        },
        {
            normal: [0, 0, 1],
            corners: [
                [min.x, min.y, max.z],
                [max.x, min.y, max.z],
                [max.x, max.y, max.z],
                [min.x, max.y, max.z],
            ],
        },
        {
            normal: [0, 0, -1],
            corners: [
                [max.x, min.y, min.z],
                [min.x, min.y, min.z],
                [min.x, max.y, min.z],
                [max.x, max.y, min.z],
            ],
        },
    ];

    let best:
        | {
              face: FaceCandidate;
              score: number;
          }
        | null = null;
    for (const face of faces) {
        const faceCenter = new Vector3();
        for (const [x, y, z] of face.corners) {
            faceCenter.x += x;
            faceCenter.y += y;
            faceCenter.z += z;
        }
        faceCenter.multiplyScalar(1 / face.corners.length);
        faceCenter.applyMatrix4(matrixWorld);
        const worldNormal = new Vector3(...face.normal).transformDirection(matrixWorld);
        const toCamera = cameraWorldPosition.clone().sub(faceCenter);
        if (toCamera.lengthSq() <= 0.000001) continue;
        toCamera.normalize();
        const score = worldNormal.dot(toCamera);
        if (!Number.isFinite(score)) continue;
        if (!best || score > best.score) {
            best = { face, score };
        }
    }

    if (!best || best.score <= 0.02) return null;

    const points = best.face.corners.map(([x, y, z]) => projectLocalPoint(x, y, z));
    if (
        points.some(
            (point) =>
                !Number.isFinite(point.x) ||
                !Number.isFinite(point.y) ||
                point.x < -canvas.clientWidth ||
                point.x > canvas.clientWidth * 2 ||
                point.y < -canvas.clientHeight ||
                point.y > canvas.clientHeight * 2,
        )
    ) {
        return null;
    }

    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        width,
        height,
        points,
    };
}

function resolveThemeSurface(styleProfile: DiceBoxStyleProfile): string {
    return usesTransparentVirtualSurface(styleProfile)
        ? DEFAULT_DICE_BOX_STYLE_PROFILE.surface ?? 'green-felt'
        : styleProfile.surface ?? DEFAULT_DICE_BOX_STYLE_PROFILE.surface ?? 'green-felt';
}

let nextContainerId = 0;
let diceBoxModulePromise: Promise<typeof DiceBoxModule> | null = null;
const WEBGL_INFO_LOG_NULL_GUARD = Symbol.for('boardgame:dice-box-threejs:webgl-info-log-null-guard');

type WebGlInfoLogContext = {
    getShaderInfoLog?: (shader: WebGLShader) => string | null;
    getProgramInfoLog?: (program: WebGLProgram) => string | null;
    [WEBGL_INFO_LOG_NULL_GUARD]?: true;
};

type WebGlContextConstructor = {
    prototype?: WebGlInfoLogContext;
};

function patchWebGlInfoLogPrototype(contextConstructor?: WebGlContextConstructor): void {
    const prototype = contextConstructor?.prototype;
    if (!prototype || prototype[WEBGL_INFO_LOG_NULL_GUARD]) return;

    const originalGetShaderInfoLog = prototype.getShaderInfoLog;
    if (typeof originalGetShaderInfoLog === 'function') {
        prototype.getShaderInfoLog = function getShaderInfoLog(shader: WebGLShader): string {
            return originalGetShaderInfoLog.call(this, shader) ?? '';
        };
    }

    const originalGetProgramInfoLog = prototype.getProgramInfoLog;
    if (typeof originalGetProgramInfoLog === 'function') {
        prototype.getProgramInfoLog = function getProgramInfoLog(program: WebGLProgram): string {
            return originalGetProgramInfoLog.call(this, program) ?? '';
        };
    }

    Object.defineProperty(prototype, WEBGL_INFO_LOG_NULL_GUARD, {
        configurable: true,
        value: true,
    });
}

export function installWebGlInfoLogNullGuard(): void {
    const host = globalThis as typeof globalThis & {
        WebGLRenderingContext?: WebGlContextConstructor;
        WebGL2RenderingContext?: WebGlContextConstructor;
    };
    patchWebGlInfoLogPrototype(host.WebGLRenderingContext);
    patchWebGlInfoLogPrototype(host.WebGL2RenderingContext);
}

async function loadDiceBoxModule(): Promise<typeof DiceBoxModule> {
    if (!diceBoxModulePromise) {
        diceBoxModulePromise = import('@3d-dice/dice-box-threejs').then((module) => module.default);
    }
    return diceBoxModulePromise;
}

function createNotation(values: number[]): string {
    if (values.length === 0) return '0d6';
    return `${values.length}d6@${values.join(',')}`;
}

function readDieValue(die: DiceBoxDie | undefined): number | null {
    const value = die?.getLastValue?.().value;
    return typeof value === 'number' ? value : null;
}

function createQuaternionFromEulerXYZ(x: number, y: number, z: number): DiceBoxQuaternionSnapshot {
    const c1 = Math.cos(x / 2);
    const c2 = Math.cos(y / 2);
    const c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2);
    const s2 = Math.sin(y / 2);
    const s3 = Math.sin(z / 2);

    return {
        x: s1 * c2 * c3 + c1 * s2 * s3,
        y: c1 * s2 * c3 - s1 * c2 * s3,
        z: c1 * c2 * s3 + s1 * s2 * c3,
        w: c1 * c2 * c3 - s1 * s2 * s3,
    };
}

export class DiceBoxThreeEngine {
    private readonly box: InstanceType<typeof DiceBoxModule>;
    private readonly container: HTMLElement;
    private readonly styleProfile: DiceBoxStyleProfile;
    private readonly debugCanvasTestId?: string;
    private debugSnapshotReader: (() => unknown) | null = null;
    private dieSkins: Array<DiceBoxDieSkin | null> = [];
    private activePresetSkinId: string | null = null;
    private worldBounds: DiceBoxWorldBounds = { width: 0, height: 0 };
    private transparentSurfaceHiddenObjects: string[] = [];
    private diceHighlights: DicePhysicsHighlightState[] = [];
    private diceHighlightShells = new Map<number, DiceBoxHighlightShell>();

    private constructor(
        box: InstanceType<typeof DiceBoxModule>,
        container: HTMLElement,
        styleProfile: DiceBoxStyleProfile,
        debugCanvasTestId?: string,
    ) {
        this.box = box;
        this.container = container;
        this.styleProfile = styleProfile;
        this.debugCanvasTestId = debugCanvasTestId;
    }

    static async create(container: HTMLElement, config?: DiceBoxEngineConfig): Promise<DiceBoxThreeEngine> {
        installWebGlInfoLogNullGuard();
        const DiceBox = await loadDiceBoxModule();
        const styleProfile = config?.styleProfile ?? DEFAULT_DICE_BOX_STYLE_PROFILE;
        if (!container.id) {
            nextContainerId += 1;
            container.id = `dice-box-threejs-${nextContainerId}`;
        }
        const box = new DiceBox(`#${container.id}`, {
            sounds: false,
            color_spotlight: styleProfile.colorSpotlight ?? DEFAULT_DICE_BOX_STYLE_PROFILE.colorSpotlight,
            shadows: styleProfile.shadows ?? DEFAULT_DICE_BOX_STYLE_PROFILE.shadows,
            theme_surface: resolveThemeSurface(styleProfile),
            sound_dieMaterial: styleProfile.soundMaterial ?? styleProfile.material ?? DEFAULT_DICE_BOX_STYLE_PROFILE.soundMaterial,
            theme_colorset: styleProfile.colorset ?? DEFAULT_DICE_BOX_STYLE_PROFILE.colorset,
            theme_material: styleProfile.material ?? DEFAULT_DICE_BOX_STYLE_PROFILE.material,
            theme_texture: styleProfile.texture ?? DEFAULT_DICE_BOX_STYLE_PROFILE.texture,
            theme_customColorset: config?.themeCustomColorset ?? styleProfile.customColorset ?? null,
            // `reroll()` 会直接给被选骰子一个固定的大竖直速度。
            // 这里如果把重力压到远低于库默认值，骰子会长时间漂出可视区，
            // 看起来就像“重投后没落回桌面”。
            gravity_multiplier: styleProfile.gravityMultiplier ?? DEFAULT_DICE_BOX_STYLE_PROFILE.gravityMultiplier,
            light_intensity: styleProfile.lightIntensity ?? DEFAULT_DICE_BOX_STYLE_PROFILE.lightIntensity,
            baseScale: styleProfile.baseScale ?? DEFAULT_DICE_BOX_STYLE_PROFILE.baseScale,
            strength: styleProfile.strength ?? DEFAULT_DICE_BOX_STYLE_PROFILE.strength,
            iterationLimit: styleProfile.iterationLimit ?? DEFAULT_DICE_BOX_STYLE_PROFILE.iterationLimit,
        });
        await box.initialize();
        const engine = new DiceBoxThreeEngine(box, container, styleProfile, config?.canvasTestId);
        engine.applyCameraProfile();
        box.renderer.setClearColor?.(0x000000, 0);
        box.renderer.setClearAlpha?.(0);
        box.renderer.domElement.style.width = '100%';
        box.renderer.domElement.style.height = '100%';
        box.renderer.domElement.style.display = 'block';
        box.renderer.domElement.style.pointerEvents = 'none';
        box.renderer.domElement.style.background = 'transparent';
        box.renderer.domElement.dataset.dicePhysicsSource = 'dice-box-threejs';
        box.renderer.domElement.dataset.diceSurfaceMode = usesTransparentVirtualSurface(styleProfile)
            ? 'transparent-virtual'
            : 'theme-surface';
        if (config?.canvasTestId) {
            box.renderer.domElement.dataset.testid = config.canvasTestId;
        }
        engine.updateCanvasHighlightDiagnostics();
        engine.applySurfaceVisibility();
        if (typeof window !== 'undefined' && config?.canvasTestId) {
            const debugWindow = window as unknown as {
                __E2E_TEST_MODE__?: boolean;
                __diceBoxThreeDebug?: Record<string, () => unknown>;
                __dicethroneBoardDiceDebug?: () => unknown;
            };
            if (debugWindow.__E2E_TEST_MODE__ || config.canvasTestId === 'dicethrone-board-dice-box-canvas') {
                debugWindow.__diceBoxThreeDebug = debugWindow.__diceBoxThreeDebug ?? {};
                const debugSnapshotReader = () => {
                    engine.renderFrame();
                    return engine.getDebugSnapshot();
                };
                engine.debugSnapshotReader = debugSnapshotReader;
                debugWindow.__diceBoxThreeDebug[config.canvasTestId] = debugSnapshotReader;
                if (config.canvasTestId === 'dicethrone-board-dice-box-canvas') {
                    debugWindow.__dicethroneBoardDiceDebug = debugSnapshotReader;
                }
            }
        }
        if ((config?.rendererMode ?? 'debug-visible') === 'physics-only') {
            box.renderer.domElement.style.opacity = '0';
            box.renderer.domElement.style.visibility = 'hidden';
            box.renderer.domElement.setAttribute('aria-hidden', 'true');
        }
        return engine;
    }

    hasDice(count: number): boolean {
        return this.box.diceList.length === count && count > 0;
    }

    setCanvasDiagnostics({
        settled,
        skinsReady,
    }: {
        settled: boolean;
        skinsReady?: boolean;
    }): void {
        const canvas = this.box.renderer?.domElement;
        if (!canvas) return;

        canvas.dataset.diceSettled = settled ? 'true' : 'false';
        canvas.dataset.diceVisualSettled = settled ? 'true' : 'false';
        canvas.dataset.diceMaxLift = settled ? '0' : '1';
        canvas.dataset.diceMaxTravel = settled ? '0' : '1';
        if (typeof skinsReady === 'boolean') {
            canvas.dataset.skinsReady = skinsReady ? 'true' : 'false';
        }
        if (settled) {
            this.finalizeSettledFrame();
        }
    }

    setDiceHighlights(highlights: DicePhysicsHighlightState[]): void {
        this.diceHighlights = highlights
            .map((highlight) => ({
                ...highlight,
                dieIndex: this.resolveHighlightDieIndex(highlight),
            }))
            .filter((highlight) => typeof highlight.dieIndex === 'number' && highlight.dieIndex >= 0);
        this.syncDiceHighlightShells();
        this.updateCanvasHighlightDiagnostics();
        this.renderFrame();
    }

    renderFrame(): void {
        this.box.diceList.forEach((die) => {
            const dieWithBody = die as DiceBoxDieWithBody;
            if (dieWithBody.body?.position) {
                this.setVector(dieWithBody.position, dieWithBody.body.position);
            }
            if (dieWithBody.body?.quaternion) {
                this.setQuaternion(dieWithBody.quaternion as DiceBoxQuaternionLike | undefined, dieWithBody.body.quaternion);
            }
            (Array.isArray(die.material) ? die.material : [die.material]).forEach((material) => {
                if (!material) return;
                material.needsUpdate = true;
                if (material.map) {
                    material.map.needsUpdate = true;
                }
            });
            die.updateMatrixWorld?.(true);
        });
        this.syncDiceHighlightShells();
        this.box.scene?.updateMatrixWorld?.(true);
        this.box.camera?.updateProjectionMatrix?.();
        this.box.camera?.updateMatrixWorld?.(true);
        const renderer = this.box.renderer as DiceBoxRendererLike | undefined;
        renderer?.clear?.();
        renderer?.render?.(this.box.scene, this.box.camera);
    }

    private finalizeSettledFrame(): void {
        this.renderFrame();
        this.nudgeDiceIntoProjectedMargins();
        this.separateProjectedDice();
        this.nudgeDiceIntoProjectedMargins();
        this.separateProjectedDice();
        this.nudgeDiceIntoProjectedMargins();
    }

    private separateProjectedDice(): void {
        const minGap = this.styleProfile.projectedLayoutMinGap ?? 0;
        const canvas = this.box.renderer?.domElement;
        const canvasWidth = canvas?.clientWidth || canvas?.width || 0;
        const canvasHeight = canvas?.clientHeight || canvas?.height || 0;
        if (minGap <= 0 || !canvas || canvasWidth <= 0 || canvasHeight <= 0 || this.box.diceList.length < 2) return;

        let didNudge = false;
        const maxPasses = 12;
        for (let pass = 0; pass < maxPasses; pass += 1) {
            const layouts = this.box.diceList.map((_, index) => this.getProjectedLayout(index, index));
            const deltas = this.box.diceList.map(() => ({ x: 0, y: 0 }));

            for (let leftIndex = 0; leftIndex < layouts.length; leftIndex += 1) {
                const left = layouts[leftIndex];
                if (!left) continue;
                const leftWidth = left.visualWidth ?? left.width;
                const leftHeight = left.visualHeight ?? left.height;
                for (let rightIndex = leftIndex + 1; rightIndex < layouts.length; rightIndex += 1) {
                    const right = layouts[rightIndex];
                    if (!right) continue;
                    const rightWidth = right.visualWidth ?? right.width;
                    const rightHeight = right.visualHeight ?? right.height;
                    const dx = left.x - right.x;
                    const dy = left.y - right.y;
                    const centerDistance = Math.hypot(dx, dy);
                    const averageMinDimension = (
                        Math.min(leftWidth, leftHeight) + Math.min(rightWidth, rightHeight)
                    ) / 2;
                    const requiredCenterDistance = averageMinDimension * 1.08;
                    const centerShortfall = requiredCenterDistance - centerDistance;
                    const requiredX = (leftWidth + rightWidth) / 2 + minGap;
                    const requiredY = (leftHeight + rightHeight) / 2 + minGap;
                    const overlapX = requiredX - Math.abs(dx);
                    const overlapY = requiredY - Math.abs(dy);
                    if ((overlapX <= 0 || overlapY <= 0) && centerShortfall <= 0) continue;

                    const resolveOnX = overlapX > 0 && overlapY > 0
                        ? overlapX <= overlapY
                        : Math.abs(dx) >= Math.abs(dy);
                    const direction = resolveOnX
                        ? (dx === 0 ? (leftIndex < rightIndex ? -1 : 1) : Math.sign(dx))
                        : (dy === 0 ? (leftIndex < rightIndex ? -1 : 1) : Math.sign(dy));
                    const axisShortfall = resolveOnX
                        ? Math.max(overlapX > 0 && overlapY > 0 ? overlapX : 0, centerShortfall)
                        : Math.max(overlapX > 0 && overlapY > 0 ? overlapY : 0, centerShortfall);
                    const correction = Math.min(40, axisShortfall / 2 + 0.75);
                    if (resolveOnX) {
                        deltas[leftIndex].x += direction * correction;
                        deltas[rightIndex].x -= direction * correction;
                    } else {
                        deltas[leftIndex].y += direction * correction;
                        deltas[rightIndex].y -= direction * correction;
                    }
                }
            }

            let didNudgeThisPass = false;
            for (let index = 0; index < this.box.diceList.length; index += 1) {
                const delta = deltas[index];
                const layout = layouts[index];
                const die = this.box.diceList[index] as DiceBoxDieWithBody | undefined;
                if (!die || !layout || !delta) continue;
                const distance = Math.hypot(delta.x, delta.y);
                if (distance < 0.25) continue;
                const maxStep = 28;
                const scale = distance > maxStep ? maxStep / distance : 1;
                if (!this.translateDieByScreenDelta(
                    die,
                    layout,
                    delta.x * scale,
                    delta.y * scale,
                    canvasWidth,
                    canvasHeight,
                )) continue;
                didNudge = true;
                didNudgeThisPass = true;
            }

            if (didNudgeThisPass) {
                this.renderFrame();
            } else {
                break;
            }
        }
        if (didNudge) {
            this.renderFrame();
        }
    }

    private nudgeDiceIntoProjectedMargins(): void {
        const margin = this.styleProfile.projectedLayoutMargin ?? 0;
        const canvas = this.box.renderer?.domElement;
        const camera = this.box.camera;
        const canvasWidth = canvas?.clientWidth || canvas?.width || 0;
        const canvasHeight = canvas?.clientHeight || canvas?.height || 0;
        if (margin <= 0 || !canvas || !camera || canvasWidth <= 0 || canvasHeight <= 0) return;

        let didNudge = false;
        for (let pass = 0; pass < 3; pass += 1) {
            let didNudgeThisPass = false;
            for (let index = 0; index < this.box.diceList.length; index += 1) {
                const die = this.box.diceList[index] as DiceBoxDieWithBody | undefined;
                const layout = this.getProjectedLayout(index, index);
                if (!die || !layout) continue;

                const width = layout.visualWidth ?? layout.width;
                const height = layout.visualHeight ?? layout.height;
                const left = layout.x - width / 2;
                const right = layout.x + width / 2;
                const top = layout.y - height / 2;
                const bottom = layout.y + height / 2;
                let dx = 0;
                let dy = 0;
                if (left < margin) {
                    dx = margin - left;
                } else if (right > canvasWidth - margin) {
                    dx = canvasWidth - margin - right;
                }
                if (top < margin) {
                    dy = margin - top;
                } else if (bottom > canvasHeight - margin) {
                    dy = canvasHeight - margin - bottom;
                }
                if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) continue;
                if (!this.translateDieByScreenDelta(die, layout, dx, dy, canvasWidth, canvasHeight)) continue;
                didNudge = true;
                didNudgeThisPass = true;
            }
            if (!didNudgeThisPass) break;
        }
        if (didNudge) {
            this.renderFrame();
        }
    }

    private translateDieByScreenDelta(
        die: DiceBoxDieWithBody,
        layout: DiceBoxProjectedLayout,
        dx: number,
        dy: number,
        canvasWidth: number,
        canvasHeight: number,
    ): boolean {
        const camera = this.box.camera;
        if (!camera) return false;

        const dieDepth = new Vector3(die.position.x, die.position.y, die.position.z).project(camera).z;
        const from = new Vector3(
            (layout.x / canvasWidth) * 2 - 1,
            1 - (layout.y / canvasHeight) * 2,
            dieDepth,
        ).unproject(camera);
        const to = new Vector3(
            ((layout.x + dx) / canvasWidth) * 2 - 1,
            1 - ((layout.y + dy) / canvasHeight) * 2,
            dieDepth,
        ).unproject(camera);
        const delta = to.sub(from);
        if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y) || !Number.isFinite(delta.z)) {
            return false;
        }

        const nextPosition = {
            x: die.position.x + delta.x,
            y: die.position.y + delta.y,
            z: die.position.z + delta.z,
        };
        this.setVector(die.position, nextPosition);
        if (die.body) {
            this.setVector(die.body.position, nextPosition);
            this.setVector(die.body.velocity, { x: 0, y: 0, z: 0 });
            this.setVector(die.body.angularVelocity, { x: 0, y: 0, z: 0 });
            die.body.aabbNeedsUpdate = true;
            die.body.sleep?.();
        }
        die.updateMatrixWorld?.(true);
        this.box.scene?.updateMatrixWorld?.(true);
        return true;
    }

    getDebugSnapshot(): unknown {
        const sceneChildren = this.box.scene?.children ?? [];
        const camera = this.box.camera as {
            fov?: number;
            aspect?: number;
            zoom?: number;
            position?: { x?: number; y?: number; z?: number };
            near?: number;
            far?: number;
        } | undefined;
        const rendererCanvas = this.box.renderer?.domElement;
        const renderer = this.box.renderer as DiceBoxRendererLike | undefined;
        const gl = renderer?.getContext?.() ?? null;
        const contextAttributes = renderer?.getContextAttributes?.() ?? gl?.getContextAttributes?.() ?? null;
        return {
            diceListLength: this.box.diceList.length,
            renderer: renderer
                ? {
                    clearAlpha: renderer.getClearAlpha?.(),
                    contextAttributes,
                    framebuffer: this.readCurrentFramebufferDiagnostics(gl),
                    info: renderer.info,
                    isContextLost: gl?.isContextLost?.() ?? null,
                    renderTarget: renderer.getRenderTarget?.() ? 'custom' : 'default',
                    outputColorSpace: renderer.outputColorSpace,
                    physicallyCorrectLights: renderer.physicallyCorrectLights,
                    toneMapping: renderer.toneMapping,
                }
                : null,
            sceneChildren: sceneChildren.map((child: {
                type?: string;
                name?: string;
                isMesh?: boolean;
                geometry?: { boundingBox?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }; computeBoundingBox?: () => void };
                position?: { x?: number; y?: number; z?: number };
                scale?: { x?: number; y?: number; z?: number };
                visible?: boolean;
                material?: unknown;
            }, index: number) => ({
                index,
                type: child.type,
                name: child.name,
                isMesh: child.isMesh,
                visible: child.visible,
                position: child.position ? { x: child.position.x, y: child.position.y, z: child.position.z } : null,
                scale: child.scale ? { x: child.scale.x, y: child.scale.y, z: child.scale.z } : null,
                materialCount: Array.isArray(child.material) ? child.material.length : (child.material ? 1 : 0),
                materialSummary: Array.isArray(child.material)
                    ? child.material.map((material: DiceBoxMaterialInstance | undefined) => ({
                        opacity: material?.opacity,
                        transparent: material?.transparent,
                        visible: material?.visible,
                        hasMap: Boolean(material?.map),
                        mapImageSize: material?.map?.image
                            ? {
                                width: material.map.image.width ?? material.map.image.naturalWidth ?? null,
                                height: material.map.image.height ?? material.map.image.naturalHeight ?? null,
                            }
                            : null,
                    }))
                : [],
            })),
            transparentSurfaceHiddenObjects: this.transparentSurfaceHiddenObjects,
            diceHighlightRenderer: DICE_HIGHLIGHT_RENDERER,
            diceHighlights: this.diceHighlights.map((highlight) => ({
                dieId: highlight.dieId,
                dieIndex: this.resolveHighlightDieIndex(highlight),
                variant: highlight.variant,
                color: highlight.color ?? DEFAULT_DICE_HIGHLIGHT_COLORS[highlight.variant],
                scale: this.resolveHighlightScale(highlight),
                opacity: this.resolveHighlightOpacity(highlight),
            })),
            diceHighlightShells: Array.from(this.diceHighlightShells.values()).map((shell) => ({
                dieId: shell.dieId,
                dieIndex: shell.dieIndex,
                variant: shell.variant,
                renderer: DICE_HIGHLIGHT_RENDERER,
                visible: shell.mesh.visible,
                name: shell.mesh.name,
                scale: shell.scale,
                opacity: shell.material.opacity,
                materialType: shell.material.type,
                materialSide: shell.material.side,
                depthTest: shell.material.depthTest,
                depthWrite: shell.material.depthWrite,
                transparent: shell.material.transparent,
                shaderOpacity: shell.material.uniforms.uOpacity.value,
                renderOrder: shell.mesh.renderOrder,
                position: {
                    x: shell.mesh.position.x,
                    y: shell.mesh.position.y,
                    z: shell.mesh.position.z,
                },
            })),
            dice: this.box.diceList.map((die, index) => {
                const dieWithBody = die as DiceBoxDieWithBody;
                if (!die.geometry.boundingBox) {
                    die.geometry.computeBoundingBox?.();
                }
                const bounds = die.geometry.boundingBox;
                return {
                    index,
                    position: { x: die.position.x, y: die.position.y, z: die.position.z },
                    bodyPosition: dieWithBody.body?.position
                        ? { x: dieWithBody.body.position.x, y: dieWithBody.body.position.y, z: dieWithBody.body.position.z }
                        : null,
                    bounds: bounds
                        ? {
                            min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
                            max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
                        }
                        : null,
                    layout: this.getProjectedLayout(index, index),
                    motion: this.getMotionSnapshot(index),
                    value: readDieValue(die),
                    materialCount: Array.isArray(die.material) ? die.material.length : (die.material ? 1 : 0),
                    materialSummary: (Array.isArray(die.material) ? die.material : [die.material]).map((material) => ({
                        opacity: material?.opacity,
                        transparent: material?.transparent,
                        visible: material?.visible,
                        hasMap: Boolean(material?.map),
                        mapImageSize: material?.map?.image
                            ? {
                                width: material.map.image.width ?? material.map.image.naturalWidth ?? null,
                                height: material.map.image.height ?? material.map.image.naturalHeight ?? null,
                            }
                            : null,
                    })),
                };
            }),
            camera: camera
                ? {
                    fov: camera.fov,
                    aspect: camera.aspect,
                    zoom: camera.zoom,
                    near: camera.near,
                    far: camera.far,
                    position: camera.position ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null,
                }
                : null,
            canvas: rendererCanvas
                ? {
                    width: rendererCanvas.width,
                    height: rendererCanvas.height,
                    clientWidth: rendererCanvas.clientWidth,
                    clientHeight: rendererCanvas.clientHeight,
                    dataset: { ...rendererCanvas.dataset },
                }
                : null,
            worldBounds: this.worldBounds,
        };
    }

    private readCurrentFramebufferDiagnostics(gl: WebGLRenderingContext | WebGL2RenderingContext | null): unknown {
        if (!gl) return null;
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        if (!width || !height) {
            return { width, height, opaquePixelCount: 0, visiblePixelCount: 0, sampledPixelCount: 0 };
        }

        const sampleWidth = Math.min(width, 160);
        const sampleHeight = Math.min(height, 160);
        const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
        try {
            gl.readPixels(
                Math.floor((width - sampleWidth) / 2),
                Math.floor((height - sampleHeight) / 2),
                sampleWidth,
                sampleHeight,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                pixels,
            );
        } catch (error) {
            return {
                width,
                height,
                sampleWidth,
                sampleHeight,
                error: error instanceof Error ? error.message : String(error),
            };
        }

        let opaquePixelCount = 0;
        let visiblePixelCount = 0;
        let brightPixelCount = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
            const r = pixels[offset] ?? 0;
            const g = pixels[offset + 1] ?? 0;
            const b = pixels[offset + 2] ?? 0;
            const a = pixels[offset + 3] ?? 0;
            if (a > 0) opaquePixelCount += 1;
            if (a > 0 && (r > 8 || g > 8 || b > 8)) visiblePixelCount += 1;
            if (a > 0 && r + g + b > 180) brightPixelCount += 1;
        }

        return {
            width,
            height,
            sampleWidth,
            sampleHeight,
            opaquePixelCount,
            visiblePixelCount,
            brightPixelCount,
            sampledPixelCount: sampleWidth * sampleHeight,
            errorCode: gl.getError(),
        };
    }

    clear(): void {
        this.clearDiceHighlightShells();
        this.box.clearDice();
        this.updateCanvasHighlightDiagnostics();
    }

    destroy(): void {
        if (typeof window !== 'undefined' && this.debugCanvasTestId && this.debugSnapshotReader) {
            const debugWindow = window as unknown as {
                __diceBoxThreeDebug?: Record<string, () => unknown>;
                __dicethroneBoardDiceDebug?: () => unknown;
            };
            if (debugWindow.__diceBoxThreeDebug?.[this.debugCanvasTestId] === this.debugSnapshotReader) {
                delete debugWindow.__diceBoxThreeDebug[this.debugCanvasTestId];
            }
            if (debugWindow.__dicethroneBoardDiceDebug === this.debugSnapshotReader) {
                delete debugWindow.__dicethroneBoardDiceDebug;
            }
        }
        this.debugSnapshotReader = null;
        this.clearDiceHighlightShells();
        this.box.clearDice();
        this.disposeSceneResources();
        this.box.renderer?.dispose?.();
        this.box.renderer?.forceContextLoss?.();
        const canvas = this.box.renderer?.domElement;
        if (canvas?.parentElement === this.container) {
            this.container.removeChild(canvas);
        }
    }

    resize(): void {
        this.applyCameraProfile();
        const worldWidth = this.container.clientWidth;
        const worldHeight = this.container.clientHeight;
        this.worldBounds = { width: worldWidth, height: worldHeight };
        this.box.setDimensions({
            x: worldWidth,
            y: worldHeight,
        });
        this.applySurfaceVisibility();
        this.applyCameraProfile();

        const canvas = this.box.renderer?.domElement;
        if (canvas) {
            canvas.dataset.physicsWorldWidth = String(Math.round(worldWidth));
            canvas.dataset.physicsWorldHeight = String(Math.round(worldHeight));
            canvas.dataset.cameraZoom = String(this.styleProfile.cameraZoom ?? 1);
        }
        this.syncDiceHighlightShells();
        this.updateCanvasHighlightDiagnostics();
    }

    private applyCameraProfile(): void {
        const cameraZoom = this.styleProfile.cameraZoom ?? 1;
        const camera = this.box.camera as {
            zoom?: number;
            updateProjectionMatrix?: () => void;
        } | undefined;
        if (!camera || !Number.isFinite(cameraZoom) || cameraZoom <= 0) return;

        camera.zoom = cameraZoom;
        camera.updateProjectionMatrix?.();
        this.box.renderer?.render?.(this.box.scene, this.box.camera);
    }

    private applySurfaceVisibility(): void {
        if (!usesTransparentVirtualSurface(this.styleProfile)) return;

        const runtime = this.box as DiceBoxInternalRuntime & {
            desk?: DiceBoxSurfaceObject;
        };
        const hiddenObjects: string[] = [];
        const diceSet = new Set<unknown>(this.box.diceList);
        const hideSurface = (
            surface: DiceBoxSurfaceObject | null | undefined,
            fallbackName: string,
        ): void => {
            if (!surface) return;
            surface.visible = false;
            surface.receiveShadow = false;
            surface.castShadow = false;
            const materials = Array.isArray(surface.material) ? surface.material : [surface.material];
            for (const material of materials) {
                if (!material) continue;
                material.visible = false;
                material.transparent = true;
                material.opacity = 0;
                material.needsUpdate = true;
            }
            hiddenObjects.push(surface.name || surface.type || fallbackName);
        };

        hideSurface(runtime.desk, 'desk');

        const scene = this.box.scene as DiceBoxSurfaceObject | undefined;
        scene?.traverse?.((object) => {
            if (object === scene || diceSet.has(object)) return;
            if (!object.isMesh && !object.material) return;
            const label = `${object.name ?? ''} ${object.type ?? ''}`.toLowerCase();
            if (label.includes('die') || label.includes('dice')) return;
            hideSurface(object, 'scene-surface');
        });

        this.transparentSurfaceHiddenObjects = Array.from(new Set(hiddenObjects));
        this.box.renderer?.render?.(this.box.scene, this.box.camera);
    }

    async rollToValues(values: number[]): Promise<void> {
        if (values.length === 0) {
            this.clear();
            return;
        }
        this.applyPrimarySkinToDicePreset();
        await this.box.roll(createNotation(values));
        this.applyValues(values, undefined, true);
        this.applyCurrentSkins();
        this.syncDiceHighlightShells();
        this.finalizeSettledFrame();
    }

    async restoreValues(values: number[]): Promise<void> {
        if (values.length === 0) {
            this.clear();
            return;
        }
        if (!this.hasDice(values.length)) {
            await this.restoreDiceWithoutVisibleThrow(values);
            return;
        }
        this.syncValues(values);
    }

    async rerollToValues(indices: number[], values: number[], lockedIndices: number[] = []): Promise<void> {
        if (indices.length === 0) return;
        const lockedSnapshots = this.captureDieTransforms(lockedIndices);
        this.freezeDice(lockedSnapshots);
        let shouldFinalize = false;
        try {
            const didUsePhysicalReroll = await this.playPhysicalReroll(indices);
            if (!didUsePhysicalReroll) {
                await this.playContainedRerollSpin(indices);
            }
            this.restoreDieTransforms(lockedSnapshots, true);
            this.applyValues(values, indices, true);
            this.applyCurrentSkins();
            this.syncDiceHighlightShells();
            shouldFinalize = true;
        } finally {
            this.restoreDieTransforms(lockedSnapshots, false);
            if (shouldFinalize) {
                this.finalizeSettledFrame();
            }
        }
    }

    private async playPhysicalReroll(indices: number[]): Promise<boolean> {
        const runtime = this.box as DiceBoxInternalRuntime;
        if (typeof runtime.reroll !== 'function') return false;

        // dice-box-threejs does not reset this clock in reroll(); a stale value can
        // make the first animation tick simulate the whole throw and look like a flash.
        runtime.last_time = 0;
        runtime.steps = 0;

        const stopSyncLoop = this.startPhysicalRerollSyncLoop();
        try {
            await runtime.reroll.call(runtime, indices);
        } finally {
            stopSyncLoop();
            this.syncDiceHighlightShells();
            this.renderFrame();
        }
        return true;
    }

    private startPhysicalRerollSyncLoop(): () => void {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
            return () => undefined;
        }

        let frameId: number | null = null;
        let stopped = false;
        const step = () => {
            if (stopped) return;
            this.syncDiceHighlightShells();
            frameId = window.requestAnimationFrame(step);
        };
        frameId = window.requestAnimationFrame(step);

        return () => {
            stopped = true;
            if (frameId !== null && typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(frameId);
            }
            frameId = null;
        };
    }

    private async playContainedRerollSpin(indices: number[], durationMs = 900): Promise<void> {
        if (indices.length === 0) return;

        type RerollSpinSnapshot = {
            die: DiceBoxDieWithBody & {
                rotation?: DiceBoxVectorLike;
                updateMatrixWorld?: (force?: boolean) => void;
            };
            position: { x: number; y: number; z: number };
            rotation: { x: number; y: number; z: number } | null;
            order: number;
        };

        const snapshots = indices
            .map((index, order): RerollSpinSnapshot | null => {
                const die = this.box.diceList[index] as RerollSpinSnapshot['die'] | undefined;
                if (!die) return null;
                return {
                    die,
                    position: {
                        x: die.position.x,
                        y: die.position.y,
                        z: die.position.z,
                    },
                    rotation: die.rotation
                        ? {
                            x: die.rotation.x,
                            y: die.rotation.y,
                            z: die.rotation.z,
                        }
                        : null,
                    order,
                };
            })
            .filter((snapshot): snapshot is RerollSpinSnapshot => Boolean(snapshot));
        if (snapshots.length === 0) return;

        const baseScale = this.styleProfile.baseScale ?? DEFAULT_DICE_BOX_STYLE_PROFILE.baseScale ?? 64;
        const lift = Math.max(5, Math.min(9, baseScale * 0.1));
        const sideTravel = Math.max(3.5, Math.min(8, baseScale * 0.075));
        const duration = Math.max(240, durationMs);

        await new Promise<void>((resolve) => {
            let startAt: number | null = null;
            let frameId: number | null = null;
            let timerId: number | null = null;
            let completed = false;
            const clearScheduledStep = () => {
                if (frameId !== null) {
                    window.cancelAnimationFrame(frameId);
                    frameId = null;
                }
                if (timerId !== null) {
                    window.clearTimeout(timerId);
                    timerId = null;
                }
            };
            const scheduleStep = () => {
                frameId = window.requestAnimationFrame(step);
                timerId = window.setTimeout(() => step(performance.now()), 33);
            };
            const step = (now: number) => {
                if (completed) return;
                clearScheduledStep();
                if (startAt === null) {
                    startAt = now;
                }
                const progress = Math.min(1, Math.max(0, (now - startAt) / duration));
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                const liftPulse = Math.sin(progress * Math.PI);
                const spin = eased * Math.PI * 4;

                for (const snapshot of snapshots) {
                    const direction = snapshot.order % 2 === 0 ? 1 : -1;
                    const lateralPulse = Math.sin(progress * Math.PI * 2);
                    const forwardPulse = Math.sin(progress * Math.PI);
                    this.setVector(snapshot.die.position, {
                        x: snapshot.position.x + sideTravel * lateralPulse * direction,
                        y: snapshot.position.y + sideTravel * 0.36 * forwardPulse,
                        z: snapshot.position.z + lift * liftPulse,
                    });
                    if (snapshot.rotation && snapshot.die.rotation) {
                        const rotation = {
                            x: snapshot.rotation.x + spin * 0.85,
                            y: snapshot.rotation.y + direction * spin * 0.72,
                            z: snapshot.rotation.z + liftPulse * direction * 0.38,
                        };
                        const quaternion = createQuaternionFromEulerXYZ(rotation.x, rotation.y, rotation.z);
                        this.setVector(snapshot.die.rotation, rotation);
                        this.setQuaternion(snapshot.die.quaternion as DiceBoxQuaternionLike | undefined, quaternion);
                        this.setQuaternion(snapshot.die.body?.quaternion, quaternion);
                    }
                    if (snapshot.die.body) {
                        this.setVector(snapshot.die.body.position, {
                            x: snapshot.die.position.x,
                            y: snapshot.die.position.y,
                            z: snapshot.die.position.z,
                        });
                        this.setVector(snapshot.die.body.velocity, { x: 0, y: 0, z: 0 });
                        this.setVector(snapshot.die.body.angularVelocity, { x: 0, y: 0, z: 0 });
                        snapshot.die.body.aabbNeedsUpdate = true;
                    }
                    snapshot.die.updateMatrixWorld?.(true);
                }
                this.box.scene?.updateMatrixWorld?.(true);
                this.syncDiceHighlightShells();
                this.renderFrame();

                if (progress >= 1) {
                    completed = true;
                    for (const snapshot of snapshots) {
                        this.setVector(snapshot.die.position, snapshot.position);
                        if (snapshot.rotation && snapshot.die.rotation) {
                            this.setVector(snapshot.die.rotation, snapshot.rotation);
                            const quaternion = createQuaternionFromEulerXYZ(
                                snapshot.rotation.x,
                                snapshot.rotation.y,
                                snapshot.rotation.z,
                            );
                            this.setQuaternion(snapshot.die.quaternion as DiceBoxQuaternionLike | undefined, quaternion);
                            this.setQuaternion(snapshot.die.body?.quaternion, quaternion);
                        }
                        if (snapshot.die.body) {
                            this.setVector(snapshot.die.body.position, snapshot.position);
                            this.setVector(snapshot.die.body.velocity, { x: 0, y: 0, z: 0 });
                            this.setVector(snapshot.die.body.angularVelocity, { x: 0, y: 0, z: 0 });
                            snapshot.die.body.aabbNeedsUpdate = true;
                        }
                        snapshot.die.updateMatrixWorld?.(true);
                    }
                    this.box.scene?.updateMatrixWorld?.(true);
                    this.syncDiceHighlightShells();
                    this.renderFrame();
                    resolve();
                    return;
                }

                scheduleStep();
            };
            scheduleStep();
        });
    }

    async removeDice(indices: number[]): Promise<void> {
        if (indices.length === 0) return;
        indices.forEach((index) => this.removeDiceHighlightShell(index));
        await this.box.remove(indices);
        this.syncDiceHighlightShells();
        this.updateCanvasHighlightDiagnostics();
    }

    syncValues(values: number[]): void {
        this.applyValues(values, undefined, true);
        this.applyCurrentSkins();
        this.syncDiceHighlightShells();
        this.finalizeSettledFrame();
    }

    syncSettledValues(values: number[]): void {
        this.applyValues(values, undefined, true);
        this.applyCurrentSkins();
        this.syncDiceHighlightShells();
        this.finalizeSettledFrame();
    }

    previewValues(values: number[], indices?: number[]): void {
        this.applyValues(values, indices, false);
        this.syncDiceHighlightShells();
    }

    ensureValues(values: number[]): void {
        if (values.length === 0) {
            this.clear();
            return;
        }
        const hasExistingDice = this.hasDice(values.length);
        if (!hasExistingDice) {
            void this.restoreValues(values);
            return;
        }
        this.syncValues(values);
    }

    setDieSkins(skins: Array<DiceBoxDieSkin | null>): void {
        this.dieSkins = skins;
        const didUpdatePreset = this.applyPrimarySkinToDicePreset();
        if (didUpdatePreset) {
            this.rebuildExistingDicePresetMaterials();
        }
        this.applyCurrentSkins();
    }

    getValues(): Array<number | null> {
        return this.box.diceList.map((die) => readDieValue(die));
    }

    getMotionSnapshot(index: number): DiceBoxMotionSnapshot | null {
        const die = this.box.diceList[index];
        if (!die) return null;
        return {
            x: die.position.x,
            y: die.position.y,
            z: die.position.z,
            rotateX: die.rotation.x,
            rotateY: die.rotation.y,
            rotateZ: die.rotation.z,
        };
    }

    getPhysicsState(index: number, id: number, settled: boolean): DicePhysicsState | null {
        const layout = this.getProjectedLayout(index, id);
        const motion = this.getMotionSnapshot(index);
        if (!layout || !motion) return null;
        return {
            id,
            layout,
            motion,
            settled,
            value: readDieValue(this.box.diceList[index]),
        };
    }

    getProjectedLayout(index: number, id: number): DiceBoxProjectedLayout | null {
        const die = this.box.diceList[index];
        const canvas = this.box.renderer?.domElement;
        const camera = this.box.camera;
        if (!die || !canvas || !camera) return null;

        die.updateMatrixWorld?.(true);
        (camera as { updateMatrixWorld?: (force?: boolean) => void }).updateMatrixWorld?.(true);
        const geometry = die.geometry;
        if (!geometry.boundingBox) {
            geometry.computeBoundingBox?.();
        }
        const bounds = geometry.boundingBox;
        if (!bounds) return null;

        const { min, max } = bounds;
        const corners = [
            [min.x, min.y, min.z],
            [min.x, min.y, max.z],
            [min.x, max.y, min.z],
            [min.x, max.y, max.z],
            [max.x, min.y, min.z],
            [max.x, min.y, max.z],
            [max.x, max.y, min.z],
            [max.x, max.y, max.z],
        ];

        const projectLocalPoint = (x: number, y: number, z: number): DiceBoxProjectedPoint => {
            const point = new Vector3(x, y, z);
            point.applyMatrix4(die.matrixWorld);
            const projected = point.project(camera) as { x: number; y: number; z: number };
            return {
                x: ((projected.x + 1) / 2) * canvas.clientWidth,
                y: ((1 - projected.y) / 2) * canvas.clientHeight,
            };
        };

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        const projectedPoints: DiceBoxProjectedPoint[] = [];

        for (const [x, y, z] of corners) {
            const { x: screenX, y: screenY } = projectLocalPoint(x, y, z);
            projectedPoints.push({ x: screenX, y: screenY });
            minX = Math.min(minX, screenX);
            maxX = Math.max(maxX, screenX);
            minY = Math.min(minY, screenY);
            maxY = Math.max(maxY, screenY);
        }

        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
            return null;
        }

        const visualWidth = Math.max(1, maxX - minX);
        const visualHeight = Math.max(1, maxY - minY);
        const width = Math.max(40, visualWidth);
        const height = Math.max(40, visualHeight);
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const faceOutline = computeProjectedFaceOutline(
            { min, max },
            die.matrixWorld,
            camera,
            canvas,
            projectLocalPoint,
        );
        const orientedBounds = computeProjectedOrientedBounds(
            faceOutline?.points ?? projectedPoints,
        );

        return {
            id,
            x: centerX,
            y: centerY,
            width,
            height,
            visualWidth,
            visualHeight,
            outlineX: faceOutline?.x ?? orientedBounds?.x ?? centerX,
            outlineY: faceOutline?.y ?? orientedBounds?.y ?? centerY,
            outlineWidth: faceOutline?.width ?? orientedBounds?.width ?? visualWidth,
            outlineHeight: faceOutline?.height ?? orientedBounds?.height ?? visualHeight,
            outlinePoints: faceOutline?.points,
            outlineRotateZ: orientedBounds?.rotateZ ?? die.rotation.z,
            minX: centerX - halfWidth,
            maxX: centerX + halfWidth,
            minY: centerY - halfHeight,
            maxY: centerY + halfHeight,
            rotateX: die.rotation.x,
            rotateY: die.rotation.y,
            rotateZ: die.rotation.z,
        };
    }

    private applyValues(values: number[], indices?: number[], commit = false): void {
        const targetIndices = indices ?? values.map((_, index) => index);
        let didChange = false;

        for (const index of targetIndices) {
            const die = this.box.diceList[index];
            const targetValue = values[index];
            if (!die || typeof targetValue !== 'number') continue;
            const currentValue = readDieValue(die);
            if (currentValue === targetValue) continue;
            this.box.swapDiceFace(die, targetValue);
            if (commit) {
                die.storeRolledValue('forced');
            }
            didChange = true;
        }

        if (didChange) {
            this.box.renderer.render(this.box.scene, this.box.camera);
        }
    }

    private captureDieTransforms(indices: number[]): Map<number, DiceBoxDieTransformSnapshot> {
        const snapshots = new Map<number, DiceBoxDieTransformSnapshot>();
        for (const index of indices) {
            const die = this.box.diceList[index] as DiceBoxDieWithBody | undefined;
            if (!die) continue;
            const quaternion = die.quaternion as DiceBoxQuaternionLike | undefined;
            snapshots.set(index, {
                position: {
                    x: die.position.x,
                    y: die.position.y,
                    z: die.position.z,
                },
                quaternion: {
                    x: quaternion?.x ?? 0,
                    y: quaternion?.y ?? 0,
                    z: quaternion?.z ?? 0,
                    w: quaternion?.w ?? 1,
                },
                bodyType: die.body?.type,
                bodyMass: die.body?.mass,
            });
        }
        return snapshots;
    }

    private freezeDice(snapshots: Map<number, DiceBoxDieTransformSnapshot>): void {
        snapshots.forEach((snapshot, index) => {
            const die = this.box.diceList[index] as DiceBoxDieWithBody | undefined;
            if (!die?.body) return;
            this.applyDieTransform(die, snapshot);
            die.body.type = 2;
            die.body.mass = 0;
            die.body.updateMassProperties?.();
            die.body.sleep?.();
        });
    }

    private restoreDieTransforms(snapshots: Map<number, DiceBoxDieTransformSnapshot>, keepFrozen: boolean): void {
        snapshots.forEach((snapshot, index) => {
            const die = this.box.diceList[index] as DiceBoxDieWithBody | undefined;
            if (!die) return;
            this.applyDieTransform(die, snapshot);
            if (die.body && !keepFrozen) {
                if (typeof snapshot.bodyType === 'number') {
                    die.body.type = snapshot.bodyType;
                }
                if (typeof snapshot.bodyMass === 'number') {
                    die.body.mass = snapshot.bodyMass;
                }
                die.body.updateMassProperties?.();
                die.body.wakeUp?.();
            }
        });
        if (snapshots.size > 0) {
            this.box.renderer.render(this.box.scene, this.box.camera);
        }
    }

    private applyDieTransform(die: DiceBoxDieWithBody, snapshot: DiceBoxDieTransformSnapshot): void {
        die.position.set?.(snapshot.position.x, snapshot.position.y, snapshot.position.z);
        die.position.x = snapshot.position.x;
        die.position.y = snapshot.position.y;
        die.position.z = snapshot.position.z;

        const dieQuaternion = die.quaternion as DiceBoxQuaternionLike | undefined;
        this.setQuaternion(dieQuaternion, snapshot.quaternion);

        if (die.body) {
            this.setVector(die.body.position, snapshot.position);
            this.setQuaternion(die.body.quaternion, snapshot.quaternion);
            this.setVector(die.body.velocity, { x: 0, y: 0, z: 0 });
            this.setVector(die.body.angularVelocity, { x: 0, y: 0, z: 0 });
        }
        die.updateMatrixWorld?.(true);
    }

    private resolveHighlightDieIndex(highlight: DicePhysicsHighlightState): number {
        if (typeof highlight.dieIndex === 'number' && Number.isFinite(highlight.dieIndex)) {
            return Math.floor(highlight.dieIndex);
        }
        return Math.floor(highlight.dieId - 1);
    }

    private resolveHighlightScale(highlight: DicePhysicsHighlightState): number {
        const scale = typeof highlight.scale === 'number'
            ? highlight.scale
            : DEFAULT_DICE_HIGHLIGHT_SCALE[highlight.variant];
        return Number.isFinite(scale) && scale > 1 ? scale : DEFAULT_DICE_HIGHLIGHT_SCALE[highlight.variant];
    }

    private resolveHighlightOpacity(highlight: DicePhysicsHighlightState): number {
        const opacity = typeof highlight.opacity === 'number'
            ? highlight.opacity
            : DEFAULT_DICE_HIGHLIGHT_OPACITY[highlight.variant];
        if (!Number.isFinite(opacity)) return DEFAULT_DICE_HIGHLIGHT_OPACITY[highlight.variant];
        return Math.max(0.08, Math.min(1, opacity));
    }

    private syncDiceHighlightShells(): void {
        const desired = new Map<number, DicePhysicsHighlightState>();
        for (const highlight of this.diceHighlights) {
            const dieIndex = this.resolveHighlightDieIndex(highlight);
            if (dieIndex < 0) continue;
            desired.set(dieIndex, { ...highlight, dieIndex });
        }

        for (const dieIndex of Array.from(this.diceHighlightShells.keys())) {
            if (!desired.has(dieIndex)) {
                this.removeDiceHighlightShell(dieIndex);
            }
        }

        for (const [dieIndex, highlight] of desired.entries()) {
            const die = this.box.diceList[dieIndex];
            if (!die) {
                this.removeDiceHighlightShell(dieIndex);
                continue;
            }

            let shell = this.diceHighlightShells.get(dieIndex);
            if (!shell || shell.sourceDie !== die) {
                this.removeDiceHighlightShell(dieIndex);
                shell = this.createDiceHighlightShell(die, dieIndex, highlight);
                this.diceHighlightShells.set(dieIndex, shell);
            }

            this.configureDiceHighlightShell(shell, highlight);
            this.syncDiceHighlightShellTransform(shell, die);
        }
        this.updateCanvasHighlightDiagnostics();
    }

    private createDiceHighlightShell(
        die: DiceBoxDie,
        dieIndex: number,
        highlight: DicePhysicsHighlightState,
    ): DiceBoxHighlightShell {
        const color = (highlight.color ?? DEFAULT_DICE_HIGHLIGHT_COLORS[highlight.variant]) as DiceBoxColorRepresentation;
        const opacity = this.resolveHighlightOpacity(highlight);
        const material = this.createDiceHighlightMaterial(color, opacity);
        const mesh = (die as DiceBoxHighlightMesh).clone?.(false);
        if (!mesh) {
            throw new Error('DiceBox highlight shell requires cloneable dice mesh');
        }
        mesh.name = `dice-highlight-shell-${dieIndex}-${highlight.variant}`;
        mesh.material = material;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 100 + dieIndex;
        (mesh as { body?: unknown }).body = undefined;
        (this.box.scene as { add?: (object: unknown) => void }).add?.(mesh);
        return {
            dieId: highlight.dieId,
            dieIndex,
            sourceDie: die,
            variant: highlight.variant,
            mesh,
            material,
            scale: this.resolveHighlightScale(highlight),
            opacity,
            color,
        };
    }

    private createDiceHighlightMaterial(color: DiceBoxColorRepresentation, opacity: number): DiceBoxHighlightMaterial {
        const material = new ShaderMaterial({
            name: 'DiceHighlightShellMaterial',
            uniforms: {
                uColor: { value: new Color(color) },
                uOpacity: { value: opacity },
            },
            vertexShader: DICE_HIGHLIGHT_VERTEX_SHADER,
            fragmentShader: DICE_HIGHLIGHT_FRAGMENT_SHADER,
            side: BackSide,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            toneMapped: false,
        }) as DiceBoxHighlightMaterial;
        material.opacity = opacity;
        return material;
    }

    private configureDiceHighlightMaterial(
        material: DiceBoxHighlightMaterial,
        color: DiceBoxColorRepresentation,
        opacity: number,
    ): void {
        material.name = 'DiceHighlightShellMaterial';
        material.uniforms.uColor.value.set(color);
        material.uniforms.uOpacity.value = opacity;
        material.opacity = opacity;
        material.transparent = true;
        material.side = BackSide;
        material.depthTest = true;
        material.depthWrite = false;
        material.toneMapped = false;
        material.needsUpdate = true;
    }

    private configureDiceHighlightShell(
        shell: DiceBoxHighlightShell,
        highlight: DicePhysicsHighlightState,
    ): void {
        const color = (highlight.color ?? DEFAULT_DICE_HIGHLIGHT_COLORS[highlight.variant]) as DiceBoxColorRepresentation;
        const scale = this.resolveHighlightScale(highlight);
        const opacity = this.resolveHighlightOpacity(highlight);
        shell.dieId = highlight.dieId;
        shell.variant = highlight.variant;
        shell.scale = scale;
        shell.opacity = opacity;
        shell.color = color;
        shell.mesh.name = `dice-highlight-shell-${shell.dieIndex}-${highlight.variant}`;
        shell.mesh.visible = true;
        this.configureDiceHighlightMaterial(shell.material, color, opacity);
    }

    private syncDiceHighlightShellTransform(shell: DiceBoxHighlightShell, die: DiceBoxDie): void {
        this.setVector(shell.mesh.position, {
            x: die.position.x,
            y: die.position.y,
            z: die.position.z,
        });
        const dieQuaternion = die.quaternion as DiceBoxQuaternionLike | undefined;
        if (dieQuaternion) {
            this.setQuaternion(shell.mesh.quaternion as DiceBoxQuaternionLike, {
                x: dieQuaternion.x ?? 0,
                y: dieQuaternion.y ?? 0,
                z: dieQuaternion.z ?? 0,
                w: dieQuaternion.w ?? 1,
            });
        } else {
            shell.mesh.rotation.set(die.rotation.x, die.rotation.y, die.rotation.z);
        }
        shell.mesh.scale.set(
            (die.scale?.x ?? 1) * shell.scale,
            (die.scale?.y ?? 1) * shell.scale,
            (die.scale?.z ?? 1) * shell.scale,
        );
        shell.mesh.updateMatrixWorld(true);
    }

    private removeDiceHighlightShell(dieIndex: number): void {
        const shell = this.diceHighlightShells.get(dieIndex);
        if (!shell) return;
        (this.box.scene as { remove?: (object: unknown) => void }).remove?.(shell.mesh);
        shell.material.dispose();
        this.diceHighlightShells.delete(dieIndex);
    }

    private clearDiceHighlightShells(): void {
        for (const dieIndex of Array.from(this.diceHighlightShells.keys())) {
            this.removeDiceHighlightShell(dieIndex);
        }
    }

    private updateCanvasHighlightDiagnostics(): void {
        const canvas = this.box.renderer?.domElement;
        if (!canvas) return;
        const candidateCount = this.diceHighlights.filter((highlight) => highlight.variant === 'candidate').length;
        const selectedCount = this.diceHighlights.filter((highlight) => highlight.variant === 'selected').length;
        canvas.dataset.diceHighlightRenderer = this.diceHighlights.length > 0 ? DICE_HIGHLIGHT_RENDERER : 'none';
        canvas.dataset.diceHighlightCount = String(this.diceHighlights.length);
        canvas.dataset.diceHighlightShellCount = String(this.diceHighlightShells.size);
        canvas.dataset.diceHighlightCandidateCount = String(candidateCount);
        canvas.dataset.diceHighlightSelectedCount = String(selectedCount);
    }

    private setVector(vector: DiceBoxVectorLike | undefined, value: { x: number; y: number; z: number }): void {
        if (!vector) return;
        vector.set?.(value.x, value.y, value.z);
        vector.x = value.x;
        vector.y = value.y;
        vector.z = value.z;
    }

    private setQuaternion(
        quaternion: DiceBoxQuaternionLike | undefined,
        value: { x: number; y: number; z: number; w: number },
    ): void {
        if (!quaternion) return;
        quaternion.set?.(value.x, value.y, value.z, value.w);
        quaternion.x = value.x;
        quaternion.y = value.y;
        quaternion.z = value.z;
        quaternion.w = value.w;
    }

    private disposeSceneResources(): void {
        const scene = this.box.scene;
        if (!scene?.traverse) return;

        scene.traverse((object: unknown) => {
            const candidate = object as {
                geometry?: { dispose?: () => void };
                material?: unknown;
            };
            candidate.geometry?.dispose?.();

            const materials = Array.isArray(candidate.material)
                ? candidate.material
                : [candidate.material];
            for (const material of materials) {
                const disposable = material as {
                    dispose?: () => void;
                    map?: { dispose?: () => void };
                    normalMap?: { dispose?: () => void };
                    roughnessMap?: { dispose?: () => void };
                    metalnessMap?: { dispose?: () => void };
                    emissiveMap?: { dispose?: () => void };
                    bumpMap?: { dispose?: () => void };
                    alphaMap?: { dispose?: () => void };
                } | undefined;
                disposable?.map?.dispose?.();
                disposable?.normalMap?.dispose?.();
                disposable?.roughnessMap?.dispose?.();
                disposable?.metalnessMap?.dispose?.();
                disposable?.emissiveMap?.dispose?.();
                disposable?.bumpMap?.dispose?.();
                disposable?.alphaMap?.dispose?.();
                disposable?.dispose?.();
            }
        });
    }

    private async restoreDiceWithoutVisibleThrow(values: number[]): Promise<void> {
        const box = this.box as DiceBoxInternalRuntime;
        const notationVectors = box.startClickThrow?.(createNotation(values));
        const vectors = notationVectors?.vectors;
        if (!notationVectors || !Array.isArray(vectors) || vectors.length === 0 || !box.spawnDice || !box.simulateThrow) {
            await this.rollToValues(values);
            return;
        }

        this.applyPrimarySkinToDicePreset();
        box.notationVectors = notationVectors;
        this.clear();
        for (const vector of vectors) {
            box.spawnDice(vector);
        }
        box.simulateThrow();
        box.iteration = 0;
        box.steps = 0;
        vectors.forEach((vector, index) => {
            const die = this.box.diceList[index];
            if (die) {
                box.spawnDice?.(vector, die);
            }
        });
        this.applyValues(values, undefined, true);
        this.applyCurrentSkins();
        this.finalizeSettledFrame();
    }

    private applyPrimarySkinToDicePreset(): boolean {
        const primarySkin = this.dieSkins.find(Boolean);
        if (!primarySkin || this.activePresetSkinId === primarySkin.id) return false;

        const preset = this.box.DiceFactory?.get('d6');
        if (!preset) return false;

        const presetValues = Array.isArray(preset.values) ? preset.values : [1, 2, 3, 4, 5, 6];
        const labels = ['', '', '', '', '', '', '', ''];
        for (const [valueIndex, faceValue] of presetValues.entries()) {
            const label = primarySkin.faceLabels?.[Number(faceValue)];
            labels[valueIndex + 2] = typeof label === 'string' ? label : '';
        }
        // Full-face canvas skins must clear dice-box's default symbol labels to avoid
        // drawing an extra layer, while explicit text-label skins may opt back in.
        preset.labels = labels;
        if (this.box.DiceFactory?.materials_cache) {
            this.box.DiceFactory.materials_cache = {};
        }
        this.activePresetSkinId = primarySkin.id;
        return true;
    }

    private rebuildExistingDicePresetMaterials(): void {
        const preset = this.box.DiceFactory?.get?.('d6');
        const createMaterials = this.box.DiceFactory?.createMaterials?.bind(this.box.DiceFactory);
        const baseScale = this.styleProfile.baseScale ?? DEFAULT_DICE_BOX_STYLE_PROFILE.baseScale ?? 90;
        if (!preset || !createMaterials || this.box.diceList.length === 0) return;

        this.box.diceList.forEach((die) => {
            if (die.notation?.type !== 'd6') return;
            const materials = createMaterials(preset, baseScale / 2, 1);
            if (!materials.length) return;
            die.material = materials;
            materials.forEach((material) => this.normalizeFaceMaterial(material));
        });
    }

    private applyCurrentSkins(): void {
        let didChange = false;

        this.box.diceList.forEach((die, dieIndex) => {
            const skin = this.dieSkins[dieIndex] ?? this.dieSkins.find(Boolean);
            if (!skin) return;
            if (this.applySkinToDie(die, skin)) {
                didChange = true;
            }
        });

        if (didChange) {
            this.box.renderer.render(this.box.scene, this.box.camera);
        }
    }

    private getFaceValueForMaterialIndex(materialIndex: number): number | null {
        const preset = this.box.DiceFactory?.get?.('d6');
        const values = preset?.values ?? [1, 2, 3, 4, 5, 6];
        const valueIndex = materialIndex - 2;
        const value = values[valueIndex];
        return typeof value === 'number' ? value : null;
    }

    private getMaterialIndexForFaceValue(faceValue: number): number | null {
        const preset = this.box.DiceFactory?.get?.('d6');
        const values = preset?.values ?? [1, 2, 3, 4, 5, 6];
        const valueIndex = values.indexOf(faceValue);
        return valueIndex >= 0 ? valueIndex + 2 : null;
    }

    private getFaceNormalForValue(die: DiceBoxDie, faceValue: number): Vector3 | null {
        const materialIndex = this.getMaterialIndexForFaceValue(faceValue);
        if (!materialIndex) return null;

        const groupIndex = die.geometry.groups?.findIndex((group) => group.materialIndex === materialIndex) ?? -1;
        if (groupIndex < 0) return null;

        return this.getGroupAverageNormal(die.geometry, groupIndex);
    }

    private getGroupAverageNormal(geometry: DiceBoxDie['geometry'], groupIndex: number): Vector3 | null {
        const group = geometry.groups?.[groupIndex];
        const normalArray = geometry.getAttribute?.('normal')?.array;
        if (!group || !normalArray) return null;

        const indexArray = geometry.index?.array;
        const vertexCount = Math.floor(normalArray.length / 3);
        const startVertex = typeof group.start === 'number'
            ? Math.max(0, Math.floor(group.start))
            : groupIndex * 3;
        const count = typeof group.count === 'number'
            ? Math.max(1, Math.floor(group.count))
            : 3;
        const normal = new Vector3(0, 0, 0);
        const addVertexNormal = (vertex: number) => {
            if (vertex < 0 || vertex >= vertexCount) return;
            const offset = vertex * 3;
            normal.add(new Vector3(
                Number(normalArray[offset] ?? 0),
                Number(normalArray[offset + 1] ?? 0),
                Number(normalArray[offset + 2] ?? 0),
            ));
        };

        if (indexArray) {
            const endIndex = Math.min(indexArray.length, startVertex + count);
            for (let indexOffset = startVertex; indexOffset < endIndex; indexOffset += 1) {
                addVertexNormal(Number(indexArray[indexOffset] ?? -1));
            }
        } else {
            const endVertex = Math.min(vertexCount, startVertex + count);
            for (let vertex = startVertex; vertex < endVertex; vertex += 1) {
                addVertexNormal(vertex);
            }
        }

        if (normal.lengthSq() === 0) return null;
        return normal.normalize();
    }

    private applySkinToDie(die: DiceBoxDie, skin: DiceBoxDieSkin): boolean {
        let materials = Array.isArray(die.material) ? die.material : [die.material];
        let didChange = false;

        if (skin.preferPresetMaterials) {
            for (const material of materials) {
                this.normalizeFaceMaterial(material);
            }
            return false;
        }

        this.ensureIndependentMaterials(die);
        materials = Array.isArray(die.material) ? die.material : [die.material];

        const edgeCanvas = skin.edgeCanvas;
        const faceMaterialIndexes = materials
            .map((_, materialIndex) => materialIndex)
            .filter((materialIndex) => materialIndex > 1);
        for (const materialIndex of faceMaterialIndexes) {
            const material = materials[materialIndex];
            const faceValue = this.getFaceValueForMaterialIndex(materialIndex);
            if (faceValue === null) continue;
            const canvas = skin.faceCanvases[faceValue] ?? edgeCanvas;
            if (!material || !canvas) continue;

            if (this.updateExistingMaterialMap(material, canvas)) {
                didChange = true;
            }
        }

        if (edgeCanvas) {
            for (const [materialIndex, material] of materials.entries()) {
                if (materialIndex > 1) continue;
                if (this.updateExistingMaterialMap(material, edgeCanvas)) {
                    didChange = true;
                }
            }
        }

        for (const material of materials) {
            this.normalizeFaceMaterial(material);
        }
        return didChange;
    }

    private ensureIndependentMaterials(die: DiceBoxDie): void {
        const materials = Array.isArray(die.material) ? die.material : [die.material];
        die.material = materials.map((material) => {
            const clone = material.clone?.() ?? material;
            if (material.map?.clone) {
                clone.map = material.map.clone();
            }
            return clone;
        });
    }

    private updateExistingMaterialMap(material: DiceBoxMaterialInstance | undefined, canvas: HTMLCanvasElement): boolean {
        if (!material) return false;
        if (!material.map) return false;
        material.map.image = canvas;
        material.map.flipY = false;
        material.map.generateMipmaps = true;
        material.map.minFilter = LinearMipmapLinearFilter;
        material.map.magFilter = LinearFilter;
        material.map.colorSpace = SRGBColorSpace;
        material.map.needsUpdate = true;
        this.normalizeFaceMaterial(material);
        return true;
    }

    private normalizeFaceMaterial(material?: DiceBoxMaterialInstance): void {
        if (!material) return;
        material.color?.set?.(0xffffff);
        material.emissive?.set?.(0x000000);
        material.emissiveIntensity = 0;
        material.roughness = 0.52;
        material.metalness = 0.04;
        material.envMapIntensity = 0.35;
        material.bumpMap = null;
        material.opacity = 1;
        material.transparent = false;
        material.alphaTest = 0;
        material.depthTest = true;
        material.depthWrite = true;
        material.needsUpdate = true;
    }

}
