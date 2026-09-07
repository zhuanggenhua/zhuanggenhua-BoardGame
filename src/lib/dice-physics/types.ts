export interface DicePhysicsProjectedLayout {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    visualWidth?: number;
    visualHeight?: number;
    outlineX?: number;
    outlineY?: number;
    outlineWidth?: number;
    outlineHeight?: number;
    outlineRotateZ?: number;
    outlinePoints?: Array<{
        x: number;
        y: number;
    }>;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    rotateX: number;
    rotateY: number;
    rotateZ: number;
}

export interface DicePhysicsMotionSnapshot {
    x: number;
    y: number;
    z: number;
    rotateX: number;
    rotateY: number;
    rotateZ: number;
}

export interface DicePhysicsState {
    id: number;
    layout: DicePhysicsProjectedLayout;
    motion: DicePhysicsMotionSnapshot;
    settled: boolean;
    value: number | null;
}

export type DicePhysicsHighlightVariant = 'candidate' | 'selected';

export interface DicePhysicsHighlightState {
    dieId: number;
    dieIndex?: number;
    variant: DicePhysicsHighlightVariant;
    color?: number | string;
    scale?: number;
    opacity?: number;
}

export type DicePhysicsRendererMode = 'debug-visible' | 'physics-only';

export interface DiceRendererContract<TDie> {
    dice: TDie[];
    physicsStates?: DicePhysicsState[];
}
