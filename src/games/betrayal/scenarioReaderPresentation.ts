import type { BetrayalCore } from "./game";
import {
  buildScenarioReaderPages,
  findScenarioOpeningNarrationSection,
  resolveActiveHauntDossier,
  resolveScenarioReaderScope,
  type HauntDossier,
  type ScenarioReaderPage,
  type ScenarioReaderScope,
  type ScenarioReaderSection,
} from "./scenarioReader";

type ScenarioReaderText = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type BetrayalScenarioReaderPresentation = {
  activeHauntDossier: HauntDossier;
  activeHauntTitle: string;
  activeHauntCaseLabel: string;
  scenarioReaderScope: ScenarioReaderScope;
  scenarioReaderScopeLabel: string;
  scenarioReferenceButtonLabel: string;
  scenarioReferenceAccessibleLabel: string;
  referenceScenarioOpeningSection: ScenarioReaderSection | null;
  scenarioStartOpeningScope: ScenarioReaderScope;
  scenarioStartOpeningSection: ScenarioReaderSection | null;
  scenarioStartOpeningKey: string | null;
  shouldShowScenarioStartOpening: boolean;
  referenceScenarioPages: ScenarioReaderPage[];
  referenceScenarioBookSpreadCount: number;
  referenceScenarioHasOpeningStage: boolean;
  referenceScenarioSpreadCount: number;
  isReferenceScenarioOpeningStage: boolean;
  referenceScenarioBookSpreadIndex: number;
  referenceScenarioLeftPage: ScenarioReaderPage | null;
  referenceScenarioRightPage: ScenarioReaderPage | null;
  canTurnReferenceScenarioBack: boolean;
  canTurnReferenceScenarioForward: boolean;
};

export function resolveBetrayalScenarioReaderPresentation({
  core,
  viewerPlayerId,
  referenceScenarioOpeningStageActive,
  referenceScenarioSpreadIndex,
  scenarioStartOpeningCinematicKey,
  dismissedScenarioStartOpeningCinematicKey,
  text,
}: {
  core: BetrayalCore;
  viewerPlayerId: string;
  referenceScenarioOpeningStageActive: boolean;
  referenceScenarioSpreadIndex: number;
  scenarioStartOpeningCinematicKey: string | null;
  dismissedScenarioStartOpeningCinematicKey: string | null;
  text: ScenarioReaderText;
}): BetrayalScenarioReaderPresentation {
  const activeHauntDossier = resolveActiveHauntDossier(core);
  const activeHauntTitle = text(activeHauntDossier.titleKey);
  const activeHauntCaseLabel = text("board.haunts.goalCard.caseNo", {
    number: activeHauntDossier.cardNumber,
  });
  const scenarioReaderScope = resolveScenarioReaderScope(core, viewerPlayerId);
  const scenarioReaderScopeLabel =
    scenarioReaderScope === "traitor"
      ? text("board.scenario.readerStatusTraitorBook")
      : scenarioReaderScope === "heroes"
        ? text("board.scenario.readerStatusHeroBook")
        : text("board.scenario.readerStatusPublicBook");
  const scenarioReferenceButtonLabel = text("board.scenario.button");
  const scenarioReferenceAccessibleLabel = `${activeHauntCaseLabel} / ${activeHauntTitle}`;
  const referenceScenarioOpeningSection = findScenarioOpeningNarrationSection(
    activeHauntDossier,
    scenarioReaderScope,
  );
  const scenarioStartOpeningScope =
    core.phase === "characterSelect" || core.phase === "preHaunt"
      ? "heroes"
      : scenarioReaderScope;
  const scenarioStartOpeningSection = findScenarioOpeningNarrationSection(
    activeHauntDossier,
    scenarioStartOpeningScope,
  );
  const scenarioStartOpeningKey = scenarioStartOpeningSection
    ? `${activeHauntDossier.id}:${scenarioStartOpeningScope}:${scenarioStartOpeningSection.id}`
    : null;
  const shouldShowScenarioStartOpening =
    core.phase === "preHaunt" &&
    Boolean(scenarioStartOpeningSection) &&
    scenarioStartOpeningCinematicKey === scenarioStartOpeningKey &&
    dismissedScenarioStartOpeningCinematicKey !== scenarioStartOpeningKey;
  const referenceScenarioPages = buildScenarioReaderPages(
    activeHauntDossier,
    scenarioReaderScope,
  );
  const referenceScenarioBookSpreadCount = Math.max(
    1,
    Math.ceil(referenceScenarioPages.length / 2),
  );
  const referenceScenarioHasOpeningStage =
    referenceScenarioOpeningStageActive &&
    Boolean(referenceScenarioOpeningSection);
  const referenceScenarioSpreadCount =
    referenceScenarioBookSpreadCount +
    (referenceScenarioHasOpeningStage ? 1 : 0);
  const isReferenceScenarioOpeningStage =
    referenceScenarioHasOpeningStage && referenceScenarioSpreadIndex === 0;
  const referenceScenarioBookSpreadIndex = referenceScenarioHasOpeningStage
    ? Math.max(0, referenceScenarioSpreadIndex - 1)
    : referenceScenarioSpreadIndex;
  const referenceScenarioLeftPage =
    referenceScenarioPages[referenceScenarioBookSpreadIndex * 2] ?? null;
  const referenceScenarioRightPage =
    referenceScenarioPages[referenceScenarioBookSpreadIndex * 2 + 1] ?? null;

  return {
    activeHauntDossier,
    activeHauntTitle,
    activeHauntCaseLabel,
    scenarioReaderScope,
    scenarioReaderScopeLabel,
    scenarioReferenceButtonLabel,
    scenarioReferenceAccessibleLabel,
    referenceScenarioOpeningSection,
    scenarioStartOpeningScope,
    scenarioStartOpeningSection,
    scenarioStartOpeningKey,
    shouldShowScenarioStartOpening,
    referenceScenarioPages,
    referenceScenarioBookSpreadCount,
    referenceScenarioHasOpeningStage,
    referenceScenarioSpreadCount,
    isReferenceScenarioOpeningStage,
    referenceScenarioBookSpreadIndex,
    referenceScenarioLeftPage,
    referenceScenarioRightPage,
    canTurnReferenceScenarioBack: referenceScenarioSpreadIndex > 0,
    canTurnReferenceScenarioForward:
      referenceScenarioSpreadIndex < referenceScenarioSpreadCount - 1,
  };
}
