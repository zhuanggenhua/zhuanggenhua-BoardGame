import React from "react";

import type { DiceBoxStyleProfile } from "../../lib/dice-box-threejs/engine";
import { DiceBoxPhysicsSource } from "../../lib/dice-physics/DiceBoxPhysicsSource";
import type {
  DicePhysicsHighlightState,
  DicePhysicsState,
} from "../../lib/dice-physics/types";
import type { BetrayalRecentRollState } from "./game";
import {
  BETRAYAL_HOUSE_D6_FACE_TO_RULE_VALUE,
  BETRAYAL_HOUSE_DICE_FACE_SYSTEM,
  BETRAYAL_HOUSE_DICE_STYLE_PROFILE,
  BETRAYAL_REROLL_HIGHLIGHT_CANDIDATE_COLOR,
  BETRAYAL_REROLL_HIGHLIGHT_CANDIDATE_OPACITY,
  BETRAYAL_REROLL_HIGHLIGHT_CANDIDATE_SCALE,
  BETRAYAL_REROLL_HIGHLIGHT_RENDERER,
  BETRAYAL_REROLL_HIGHLIGHT_SELECTED_COLOR,
  BETRAYAL_REROLL_HIGHLIGHT_SELECTED_OPACITY,
  BETRAYAL_REROLL_HIGHLIGHT_SELECTED_SCALE,
  BETRAYAL_REROLL_VISUAL_CONTRACT,
  createBetrayalHouseDiceSkin,
  getBetrayalRerollTargetOutlinePoints,
  getBetrayalRerollTargetVisualCenter,
  getBetrayalRerollTargetVisualRotation,
  getBetrayalRerollTargetVisibleSize,
  normalizeBetrayalHouseRuleValue,
  resolveBetrayalHouseD6Face,
} from "./houseDicePresentation";
import { buildRecentRollDisplayKey } from "./recentRollPresentation";

export type RecentRollRerollSelection = {
  promptLabel: string;
  allowedDieIndices?: readonly number[];
  selectedDieIndex?: number | null;
  getDieActionLabel: (dieIndex: number) => string;
  onSelectDie: (dieIndex: number) => void;
};

type BetrayalHouseDice3DGroupProps = {
  roll: BetrayalRecentRollState;
  className?: string;
  locale: string;
  canvasTestId: string;
  animateInitialRoll?: boolean;
  styleProfile?: DiceBoxStyleProfile;
  visualScale?: number;
  rerollSelection?: RecentRollRerollSelection | null;
  onDiceSettledChange?: (rollId: string, settled: boolean) => void;
};

export function BetrayalHouseDice3DGroup({
  roll,
  className = "",
  canvasTestId,
  animateInitialRoll = true,
  rerollSelection,
  styleProfile = BETRAYAL_HOUSE_DICE_STYLE_PROFILE,
  visualScale = 1,
  onDiceSettledChange,
}: BetrayalHouseDice3DGroupProps) {
  const rollDice = roll.dice;
  const diceSignature = rollDice.join(",");
  const diceInputs = React.useMemo(
    () =>
      rollDice.map((pip, index) => ({
        id: index + 1,
        value: resolveBetrayalHouseD6Face(pip),
      })),
    [rollDice],
  );
  const physicalD6Faces = React.useMemo(
    () => rollDice.map(resolveBetrayalHouseD6Face),
    [rollDice],
  );
  const dieSkins = React.useMemo(
    () =>
      rollDice.map((pip) =>
        createBetrayalHouseDiceSkin(normalizeBetrayalHouseRuleValue(pip)),
      ),
    [rollDice],
  );
  const rerollingDieIndex = roll.lastRabbitFootRerollDieIndex ?? null;
  const rollMotionId = buildRecentRollDisplayKey(roll) ?? roll.id;
  const consumedRabbitFootSignature = roll.consumedRabbitFootCardIds.join(",");
  const previousRerollDice = roll.lastRabbitFootRerollPreviousDice;
  const previousRerollDiceSignature = previousRerollDice?.join(",") ?? "";
  const previousRerollPhysicalFaces = React.useMemo(
    () => (previousRerollDice ?? []).map(resolveBetrayalHouseD6Face),
    [previousRerollDice],
  );
  const diceMotion = React.useMemo(
    () => {
      if (rerollingDieIndex !== null) {
        return {
          type: "reroll" as const,
          id: [
            roll.id,
            "rabbit-foot",
            rerollingDieIndex,
            consumedRabbitFootSignature,
            previousRerollDiceSignature,
            diceSignature,
          ].join("::"),
          dieIds: [rerollingDieIndex + 1],
          previousValues:
            previousRerollPhysicalFaces.length === rollDice.length
              ? previousRerollPhysicalFaces
              : undefined,
        };
      }
      if (animateInitialRoll) {
        return { type: "roll" as const, id: rollMotionId };
      }
      return { type: "settled" as const };
    },
    [
      animateInitialRoll,
      consumedRabbitFootSignature,
      diceSignature,
      previousRerollDiceSignature,
      previousRerollPhysicalFaces,
      rerollingDieIndex,
      rollDice.length,
      roll.id,
      rollMotionId,
    ],
  );
  const [hasPhysicsState, setHasPhysicsState] = React.useState(false);
  const [physicsStates, setPhysicsStates] = React.useState<DicePhysicsState[]>(
    [],
  );
  React.useEffect(() => {
    setHasPhysicsState(false);
    setPhysicsStates([]);
  }, [diceSignature, roll.id]);
  const visibleRuleValues = React.useMemo(
    () =>
      rollDice.map((pip, index) => {
        const physicalValue = physicsStates[index]?.value;
        return physicalValue
          ? (BETRAYAL_HOUSE_D6_FACE_TO_RULE_VALUE[physicalValue] ??
              normalizeBetrayalHouseRuleValue(pip))
          : normalizeBetrayalHouseRuleValue(pip);
      }),
    [physicsStates, rollDice],
  );
  const allowedRerollDieIndices = rerollSelection?.allowedDieIndices;
  const selectableDiceTargets = React.useMemo(() => {
    const allowedDieIndexSet = allowedRerollDieIndices
      ? new Set(allowedRerollDieIndices)
      : null;
    const physicsTargets = physicsStates
      .map((state) => ({
        dieIndex: state.id - 1,
        layout: state.layout,
        source: "physics" as const,
      }))
      .filter(
        (target) =>
          target.dieIndex >= 0 &&
          target.dieIndex < rollDice.length &&
          (!allowedDieIndexSet || allowedDieIndexSet.has(target.dieIndex)),
      );

    if (physicsTargets.length > 0) {
      return physicsTargets;
    }

    const spacing = 82;
    const totalWidth = Math.max(0, (rollDice.length - 1) * spacing);
    return rollDice
      .map((_, dieIndex) => ({
        dieIndex,
        layout: {
          id: dieIndex + 1,
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          minX: 0,
          maxX: 0,
          minY: 0,
          maxY: 0,
          rotateX: 0,
          rotateY: 0,
          rotateZ: 0,
        },
        fallbackStyle: {
          left: `calc(50% + ${dieIndex * spacing - totalWidth / 2}px)`,
          top: "50%",
        },
        source: "fallback-projection" as const,
      }))
      .filter(
        (target) => !allowedDieIndexSet || allowedDieIndexSet.has(target.dieIndex),
      );
  }, [allowedRerollDieIndices, physicsStates, rollDice]);
  const selectedRerollDieIndex = rerollSelection?.selectedDieIndex ?? null;
  const highlightedRerollDice = React.useMemo<DicePhysicsHighlightState[]>(
    () => {
      if (!rerollSelection) return [];
      return selectableDiceTargets.map((target) => {
        const isSelected = selectedRerollDieIndex === target.dieIndex;
        return {
          dieId: target.dieIndex + 1,
          variant: isSelected ? "selected" : "candidate",
          color: isSelected
            ? BETRAYAL_REROLL_HIGHLIGHT_SELECTED_COLOR
            : BETRAYAL_REROLL_HIGHLIGHT_CANDIDATE_COLOR,
          scale: isSelected
            ? BETRAYAL_REROLL_HIGHLIGHT_SELECTED_SCALE
            : BETRAYAL_REROLL_HIGHLIGHT_CANDIDATE_SCALE,
          opacity: isSelected
            ? BETRAYAL_REROLL_HIGHLIGHT_SELECTED_OPACITY
            : BETRAYAL_REROLL_HIGHLIGHT_CANDIDATE_OPACITY,
        };
      });
    },
    [rerollSelection, selectableDiceTargets, selectedRerollDieIndex],
  );
  const handleRerollTargetKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, dieIndex: number) => {
      if (!rerollSelection) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      rerollSelection.onSelectDie(dieIndex);
    },
    [rerollSelection],
  );

  return (
    <div
      data-testid="betrayal-house-dice-3d-group"
      data-render-mode="betrayal-house-dice-box-visible"
      data-dice-tray-style="transparent-virtual"
      data-dice-surface-mode={
        styleProfile.surface === "transparent-virtual"
          ? "transparent-virtual"
          : "theme-surface"
      }
      data-dice-physics-ready={hasPhysicsState ? "true" : "false"}
      data-dice-preload-state="none"
      data-dice-physics-state-count={physicsStates.length}
      data-dice-count={roll.dice.length}
      data-dice-rule-values={roll.dice.join(",")}
      data-dice-visible-rule-values={visibleRuleValues.join(",")}
      data-dice-rule-subtotal={roll.dice.reduce((sum, pip) => sum + pip, 0)}
      data-dice-physical-d6-faces={physicalD6Faces.join(",")}
      data-dice-rerolling-die-index={rerollingDieIndex ?? undefined}
      data-dice-debug-key={canvasTestId}
      data-dice-boundary-highlight="subtle-open-stage"
      className={`relative min-h-0 bg-transparent ${
        styleProfile.surface === "transparent-virtual"
          ? "overflow-visible rounded-none"
          : "overflow-hidden rounded-[18px]"
      } ${className}`}
      style={
        visualScale !== 1
          ? {
              transform: `scale(${visualScale})`,
              transformOrigin: "center center",
            }
          : undefined
      }
    >
      <div
        aria-hidden="true"
        data-testid="betrayal-house-dice-tray-surface"
        data-dice-tray-surface="transparent"
        className={`pointer-events-none absolute inset-0 z-0 bg-transparent ${
          styleProfile.surface === "transparent-virtual"
            ? "rounded-none"
            : "rounded-[18px]"
        }`}
      />
      <div
        aria-hidden="true"
        data-testid="betrayal-house-dice-boundary-highlight"
        data-dice-boundary-highlight="runtime-visible"
        className="pointer-events-none absolute inset-[10px] z-30 rounded-[28px]"
        style={{
          backgroundImage: "none",
          border: "0",
          boxShadow: "none",
        }}
      />
      <DiceBoxPhysicsSource
        dice={diceInputs}
        motion={diceMotion}
        styleProfile={styleProfile}
        dieSkins={dieSkins}
        highlightedDice={highlightedRerollDice}
        testId="betrayal-house-dice-physics-source"
        canvasTestId={canvasTestId}
        rendererMode="debug-visible"
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        dataAttributes={{
          "data-dice-face-system": BETRAYAL_HOUSE_DICE_FACE_SYSTEM,
          "data-dice-model-source":
            "dice-box-d6-with-betrayal-0-0-1-1-2-2-face-skin",
        }}
        onPhysicsStatesChange={(states) => {
          setHasPhysicsState(
            roll.dice.length > 0 && states.length >= roll.dice.length,
          );
          setPhysicsStates(states);
        }}
        onSettledChange={(settled) => {
          onDiceSettledChange?.(buildRecentRollDisplayKey(roll) ?? roll.id, settled);
        }}
      />
      {hasPhysicsState ? (
        <div
          data-testid="betrayal-house-dice-readable-faces"
          data-visual-layer="diagnostic-only"
          className="sr-only"
        >
          {physicsStates.map((state) => {
            const dieIndex = state.id - 1;
            const ruleValue =
              visibleRuleValues[dieIndex] ??
              normalizeBetrayalHouseRuleValue(roll.dice[dieIndex] ?? 0);
            const visualSize = Math.max(
              28,
              Math.min(
                46,
                Math.min(
                  state.layout.visualWidth ?? state.layout.width,
                  state.layout.visualHeight ?? state.layout.height,
                ) * 0.78,
              ),
            );
            const faceText =
              ruleValue === 0 ? "0" : ruleValue === 1 ? "●" : "●●";
            return (
              <span
                key={`${roll.id}-readable-face-${state.id}`}
                data-testid={`betrayal-house-dice-readable-face-${dieIndex}`}
                data-rule-value={ruleValue}
                data-projected-x={Math.round(state.layout.x)}
                data-projected-y={Math.round(state.layout.y)}
                data-projected-size={Math.round(visualSize)}
              >
                {faceText}
              </span>
            );
          })}
        </div>
      ) : null}
      {rerollSelection ? (
        <div
          data-testid="betrayal-rabbit-foot-dice"
          data-reroll-target-count={selectableDiceTargets.length}
          data-reroll-highlight-renderer={BETRAYAL_REROLL_HIGHLIGHT_RENDERER}
          data-reroll-visual-contract={BETRAYAL_REROLL_VISUAL_CONTRACT}
          className="pointer-events-none absolute inset-0 z-20"
        >
          {selectableDiceTargets.map((target) => {
            const isSelectedRerollTarget =
              rerollSelection.selectedDieIndex === target.dieIndex;
            const targetVisibleSize = getBetrayalRerollTargetVisibleSize(
              target.layout,
            );
            const targetVisualCenter = getBetrayalRerollTargetVisualCenter(
              target.layout,
            );
            const targetVisualRotation =
              getBetrayalRerollTargetVisualRotation(target.layout);
            const targetOutlinePoints = getBetrayalRerollTargetOutlinePoints(
              target.layout,
            );
            const targetWidth = Math.max(1, targetVisibleSize.width);
            const targetHeight = Math.max(1, targetVisibleSize.height);
            const targetMaxSize = Math.max(targetWidth, targetHeight);
            const outlineStrokeWidth = isSelectedRerollTarget ? 3.25 : 2.25;
            const outlineColor = isSelectedRerollTarget ? "#ffd447" : "#00e7ff";
            const outlineFilter = isSelectedRerollTarget
              ? "drop-shadow(0 0 1px rgba(74, 46, 0, 0.95)) drop-shadow(0 0 8px rgba(255, 212, 71, 0.8))"
              : "drop-shadow(0 0 1px rgba(0, 42, 49, 0.95)) drop-shadow(0 0 6px rgba(0, 231, 255, 0.72))";
            const outlineBleed = 8;
            const outlineOutset = outlineStrokeWidth / 2;
            const targetLeft = targetVisualCenter.x - targetWidth / 2;
            const targetTop = targetVisualCenter.y - targetHeight / 2;
            const outlinePointString = targetOutlinePoints
              ?.map((point) => {
                const dx = point.x - targetVisualCenter.x;
                const dy = point.y - targetVisualCenter.y;
                const distance = Math.hypot(dx, dy) || 1;
                const outsetX = (dx / distance) * outlineOutset;
                const outsetY = (dy / distance) * outlineOutset;
                return `${(point.x - targetLeft + outlineBleed + outsetX).toFixed(
                  2,
                )},${(point.y - targetTop + outlineBleed + outsetY).toFixed(2)}`;
              })
              .join(" ");
            const outlinePointData =
              targetOutlinePoints
                ?.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
                .join(";") ?? "";
            const outlineRadius = Math.max(
              6,
              Math.min(10, Math.min(targetWidth, targetHeight) * 0.18),
            );
            return (
              <div
                key={`${roll.id}-reroll-target-${target.dieIndex}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSelectedRerollTarget}
                aria-label={rerollSelection.getDieActionLabel(target.dieIndex)}
                title={rerollSelection.getDieActionLabel(target.dieIndex)}
                data-testid={`betrayal-house-dice-reroll-target-${target.dieIndex}`}
                data-reroll-target-rotate-z={targetVisualRotation.toFixed(4)}
                data-reroll-target-outline-rotate-z={targetVisualRotation.toFixed(4)}
                data-reroll-target-source={target.source}
                data-reroll-target-shape="die-face"
                data-reroll-target-selected={isSelectedRerollTarget ? "true" : "false"}
                data-reroll-target-box-size={targetMaxSize.toFixed(2)}
                data-reroll-target-hit-width={targetWidth.toFixed(2)}
                data-reroll-target-hit-height={targetHeight.toFixed(2)}
                data-reroll-target-visual-width={targetVisibleSize.width.toFixed(2)}
                data-reroll-target-visual-height={targetVisibleSize.height.toFixed(2)}
                data-reroll-target-outline-width={targetVisibleSize.width.toFixed(2)}
                data-reroll-target-outline-height={targetVisibleSize.height.toFixed(2)}
                data-reroll-target-outline-gap="0.00"
                data-reroll-target-outline-paint={
                  targetOutlinePoints
                    ? "projected-face-outside-svg-outline"
                    : "oriented-outside-outline"
                }
                data-reroll-target-outline-point-count={
                  targetOutlinePoints?.length ?? 0
                }
                data-reroll-target-outline-points={outlinePointData}
                data-reroll-target-highlight-renderer={BETRAYAL_REROLL_HIGHLIGHT_RENDERER}
                data-reroll-target-visual-contract={BETRAYAL_REROLL_VISUAL_CONTRACT}
                data-reroll-target-visual-layer={BETRAYAL_REROLL_VISUAL_CONTRACT}
                className="group pointer-events-auto absolute outline-none"
                style={{
                  left:
                    target.source === "fallback-projection"
                      ? target.fallbackStyle.left
                      : `${targetVisualCenter.x}px`,
                  top:
                    target.source === "fallback-projection"
                      ? target.fallbackStyle.top
                      : `${targetVisualCenter.y}px`,
                  width: `${targetWidth}px`,
                  height: `${targetHeight}px`,
                  transform: targetOutlinePoints
                    ? "translate(-50%, -50%)"
                    : `translate(-50%, -50%) rotate(${targetVisualRotation}rad)`,
                  transformOrigin: "center center",
                }}
                onClick={() => rerollSelection.onSelectDie(target.dieIndex)}
                onKeyDown={(event) => {
                  handleRerollTargetKeyDown(event, target.dieIndex);
                }}
              >
                <span className="sr-only">
                  {rerollSelection.getDieActionLabel(target.dieIndex)}
                </span>
                {outlinePointString ? (
                  <svg
                    aria-hidden="true"
                    data-reroll-target-candidate-box={
                      isSelectedRerollTarget ? undefined : "true"
                    }
                    data-reroll-target-selected-border={
                      isSelectedRerollTarget ? "true" : undefined
                    }
                    data-reroll-target-outline="true"
                    data-reroll-target-outline-kind="projected-face-svg"
                    className="pointer-events-none absolute"
                    style={{
                      left: `${-outlineBleed}px`,
                      top: `${-outlineBleed}px`,
                      width: `${targetWidth + outlineBleed * 2}px`,
                      height: `${targetHeight + outlineBleed * 2}px`,
                      overflow: "visible",
                      filter: outlineFilter,
                    }}
                    viewBox={`0 0 ${targetWidth + outlineBleed * 2} ${
                      targetHeight + outlineBleed * 2
                    }`}
                  >
                    <polygon
                      data-reroll-target-outline-stroke="true"
                      points={outlinePointString}
                      fill="transparent"
                      stroke={outlineColor}
                      strokeWidth={outlineStrokeWidth}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                ) : (
                  <span
                    aria-hidden="true"
                    data-reroll-target-candidate-box={
                      isSelectedRerollTarget ? undefined : "true"
                    }
                    data-reroll-target-selected-border={
                      isSelectedRerollTarget ? "true" : undefined
                    }
                    data-reroll-target-outline="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: "transparent",
                      border: "0",
                      borderRadius: `${outlineRadius}px`,
                      boxShadow: outlineFilter,
                      outline: `${outlineStrokeWidth}px solid ${outlineColor}`,
                      outlineOffset: "0px",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="sr-only">
        {roll.dice.map((pip, dieIndex) => (
          <span
            key={`${roll.id}-${dieIndex}`}
            data-testid={`betrayal-recent-roll-die-${dieIndex}`}
            data-render-mode="betrayal-house-die-dice-box-visible"
            data-dice-physics-source={
              hasPhysicsState ? "dice-box-threejs" : "pending"
            }
            data-rule-value={pip}
            data-physical-d6-face={physicalD6Faces[dieIndex]}
          >
            {pip}
          </span>
        ))}
      </div>
    </div>
  );
}
