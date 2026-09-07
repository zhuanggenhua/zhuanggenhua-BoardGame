import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { OptimizedImage } from "../../components/common/media/OptimizedImage";
import { MagnifyOverlay } from "../../components/common/overlays/MagnifyOverlay";
import { UI_Z_INDEX } from "../../core";
import { BETRAYAL_POSSESSION_CARD_SHELL_ASPECT_RATIO } from "./possessionAtlas";
import type { ReferencePage } from "./referencePresentation";
import {
  isScenarioReaderCinematicSection,
  type ScenarioBookTurnSnapshot,
  type ScenarioReaderPage,
  type ScenarioReaderScope,
  type ScenarioReaderSection,
} from "./scenarioReader";
import { CinematicNarrationPanel } from "./cinematicNarrationSurface";
import { ScenarioBookTurnSheet } from "./scenarioBookTurnSurface";

const REFERENCE_CARD_FRAME_WIDTH = `min(92vw, calc(86vh * ${BETRAYAL_POSSESSION_CARD_SHELL_ASPECT_RATIO}))`;
const SCENARIO_REFERENCE_BOOK_FRAME_WIDTH = "min(94vw, 1120px)";
const SCENARIO_REFERENCE_BOOK_FRAME_HEIGHT = "min(86vh, 760px)";
const SCENARIO_READER_MODAL_Z_INDEX = UI_Z_INDEX.modalContent;

type BetrayalReferenceOverlaySurfaceProps = {
  referenceOpen: boolean;
  scenarioReaderOpen: boolean;
  isReferenceScenarioOpeningStage: boolean;
  isPhoneLandscapeLayout: boolean;
  currentReferencePage: ReferencePage;
  referenceFallbackAsset: string;
  effectiveLocale: string;
  scenarioReaderScope: ScenarioReaderScope;
  scenarioReaderScopeLabel: string;
  activeHauntCaseLabel: string;
  activeHauntTitle: string;
  referenceScenarioSpreadIndex: number;
  referenceScenarioSpreadCount: number;
  referenceScenarioOpeningSection: ScenarioReaderSection | null;
  referenceScenarioTurnDirection: "back" | "forward" | null;
  referenceScenarioTurnSnapshot: ScenarioBookTurnSnapshot | null;
  referenceScenarioLeftPage: ScenarioReaderPage | null;
  referenceScenarioRightPage: ScenarioReaderPage | null;
  canTurnReferenceScenarioBack: boolean;
  canTurnReferenceScenarioForward: boolean;
  onClose: () => void;
  onToggleReferenceSide: () => void;
  onReferenceScenarioTurn: (direction: "back" | "forward") => void;
  onScenarioTurnComplete: () => void;
};

export function BetrayalReferenceOverlaySurface({
  referenceOpen,
  scenarioReaderOpen,
  isReferenceScenarioOpeningStage,
  isPhoneLandscapeLayout,
  currentReferencePage,
  referenceFallbackAsset,
  effectiveLocale,
  scenarioReaderScope,
  scenarioReaderScopeLabel,
  activeHauntCaseLabel,
  activeHauntTitle,
  referenceScenarioSpreadIndex,
  referenceScenarioSpreadCount,
  referenceScenarioOpeningSection,
  referenceScenarioTurnDirection,
  referenceScenarioTurnSnapshot,
  referenceScenarioLeftPage,
  referenceScenarioRightPage,
  canTurnReferenceScenarioBack,
  canTurnReferenceScenarioForward,
  onClose,
  onToggleReferenceSide,
  onReferenceScenarioTurn,
  onScenarioTurnComplete,
}: BetrayalReferenceOverlaySurfaceProps) {
  const { t } = useTranslation("game-betrayal");

  return (
    <MagnifyOverlay
      isOpen={referenceOpen || scenarioReaderOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      overlayTestId={
        scenarioReaderOpen
          ? "betrayal-scenario-reader-dialog"
          : "betrayal-reference-overlay"
      }
      overlayClassName={
        scenarioReaderOpen && isReferenceScenarioOpeningStage
          ? "bg-[rgba(0,0,0,0.58)] p-0 backdrop-blur-[1px]"
          : "bg-[rgba(3,6,5,0.82)] p-3 md:p-6"
      }
      containerClassName="rounded-none overflow-visible bg-transparent"
      zIndex={
        scenarioReaderOpen ? SCENARIO_READER_MODAL_Z_INDEX : UI_Z_INDEX.magnify
      }
    >
      <div
        className="pointer-events-auto relative"
        style={
          scenarioReaderOpen
            ? isReferenceScenarioOpeningStage
              ? {
                  width: "100vw",
                  height: "100vh",
                }
              : {
                  width: isPhoneLandscapeLayout
                    ? "min(96vw, 900px)"
                    : SCENARIO_REFERENCE_BOOK_FRAME_WIDTH,
                  height: isPhoneLandscapeLayout
                    ? "min(94vh, 420px)"
                    : SCENARIO_REFERENCE_BOOK_FRAME_HEIGHT,
                }
            : {
                width: REFERENCE_CARD_FRAME_WIDTH,
                aspectRatio: `${BETRAYAL_POSSESSION_CARD_SHELL_ASPECT_RATIO} / 1`,
              }
        }
      >
        {!scenarioReaderOpen ? (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleReferenceSide}
              data-testid="betrayal-reference-toggle"
              className="inline-flex items-center gap-1 rounded-[5px] bg-[rgba(9,13,12,0.84)] px-3 py-1.5 text-xs font-medium text-[#f3e0b4] shadow-[0_8px_22px_rgba(0,0,0,0.32)] transition hover:bg-[rgba(22,31,27,0.92)]"
            >
              <ChevronRight size={14} />
              <span>{t("board.reference.toggle")}</span>
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          data-testid={
            scenarioReaderOpen
              ? "betrayal-scenario-reader-close"
              : "betrayal-reference-close"
          }
          className="pointer-events-auto absolute right-3 top-3 z-50 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[5px] bg-[rgba(9,13,12,0.84)] px-4 text-[12px] font-medium text-[#f3e0b4] shadow-[0_8px_22px_rgba(0,0,0,0.32)] transition hover:bg-[rgba(22,31,27,0.92)]"
        >
          {scenarioReaderOpen
            ? t("board.characterSelect.hideScenarioDetails")
            : t("board.reference.close")}
        </button>
        {scenarioReaderOpen ? (
          <div
            data-testid="betrayal-scenario-objective-page"
            data-reference-page="scenario"
            data-scenario-reader-scope={scenarioReaderScope}
            className={`relative flex h-full w-full flex-col overflow-hidden text-[#f3e0b4] ${
              isReferenceScenarioOpeningStage
                ? "border border-transparent bg-transparent p-0 shadow-none"
                : `border border-[#7b633d] bg-[linear-gradient(180deg,rgba(31,24,15,0.98),rgba(10,12,9,0.98))] shadow-[0_24px_56px_rgba(0,0,0,0.44)] ${isPhoneLandscapeLayout ? "p-3" : "p-5"}`
            }`}
          >
            <div
              className={`flex items-start justify-between gap-4 border-b border-[rgba(211,179,109,0.24)] pr-32 ${
                isReferenceScenarioOpeningStage
                  ? "sr-only"
                  : isPhoneLandscapeLayout
                    ? "pb-2"
                    : "pb-3"
              }`}
            >
              <div>
                <div
                  data-testid="betrayal-scenario-reader-case-label"
                  className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#c9a35e]"
                >
                  {activeHauntCaseLabel}
                </div>
              </div>
              <div className="rounded-[4px] border border-[rgba(211,179,109,0.22)] bg-[rgba(8,11,9,0.48)] px-3 py-1.5 text-right text-[12px] font-semibold text-[#d5c5a2]">
                <span
                  data-testid="betrayal-scenario-reader-role"
                  className="block text-[12px] uppercase tracking-[0.12em] text-[#c9a35e]"
                >
                  {scenarioReaderScopeLabel}
                </span>
                <span data-testid="betrayal-scenario-reader-header-progress">
                  {referenceScenarioSpreadIndex + 1}/
                  {referenceScenarioSpreadCount}
                </span>
              </div>
            </div>
            <div
              data-testid={
                isReferenceScenarioOpeningStage
                  ? "betrayal-scenario-opening-stage"
                  : "betrayal-scenario-book"
              }
              className={`relative min-h-0 flex-1 overflow-hidden ${
                isReferenceScenarioOpeningStage
                  ? "mt-0"
                  : `grid grid-cols-2 ${isPhoneLandscapeLayout ? "mt-2 gap-2" : "mt-4 gap-3"}`
              }`}
            >
              {isReferenceScenarioOpeningStage &&
              referenceScenarioOpeningSection ? (
                <CinematicNarrationPanel
                  testId="betrayal-scenario-opening-cinematic"
                  label={t(referenceScenarioOpeningSection.labelKey)}
                  text={t(referenceScenarioOpeningSection.bodyKey)}
                  variant="opening"
                  presentation="stage"
                  compact={isPhoneLandscapeLayout}
                  actionSlot={
                    <>
                      <span
                        data-testid="betrayal-scenario-reader-footer-progress"
                        className="sr-only"
                      >
                        {referenceScenarioSpreadIndex + 1}/
                        {referenceScenarioSpreadCount}
                      </span>
                      <button
                        type="button"
                        data-testid="betrayal-scenario-reader-next-zone"
                        onClick={() => onReferenceScenarioTurn("forward")}
                        disabled={!canTurnReferenceScenarioForward}
                        className="inline-flex min-h-11 min-w-[144px] items-center justify-center gap-2 border border-[rgba(242,207,130,0.42)] bg-[rgba(8,10,9,0.82)] px-6 text-[12px] font-black uppercase tracking-[0.22em] text-[#f5e6c7] shadow-[0_16px_38px_rgba(0,0,0,0.58)] transition hover:border-[#f2cf82] hover:bg-[rgba(18,20,16,0.92)] disabled:opacity-35"
                      >
                        {t("board.scenario.readerEnterBook")}
                        <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    </>
                  }
                  className="h-full min-h-full"
                />
              ) : (
                <>
                  <ScenarioBookTurnSheet
                    direction={referenceScenarioTurnDirection}
                    fromPages={
                      referenceScenarioTurnSnapshot?.fromPages ?? [null, null]
                    }
                    toPages={
                      referenceScenarioTurnSnapshot?.toPages ?? [null, null]
                    }
                    title={activeHauntTitle}
                    isPhoneLandscapeLayout={isPhoneLandscapeLayout}
                    onTurnComplete={onScenarioTurnComplete}
                  />
                  {[referenceScenarioLeftPage, referenceScenarioRightPage].map(
                    (page, sideIndex) => (
                      <section
                        key={page?.id ?? `blank-${sideIndex}`}
                        data-testid={
                          page
                            ? `betrayal-scenario-book-page-${page.id}`
                            : `betrayal-scenario-book-page-blank-${sideIndex}`
                        }
                        className={`relative min-h-0 overflow-hidden border border-[#c7a06b] bg-[radial-gradient(circle_at_48%_18%,rgba(255,243,204,0.94),rgba(229,200,151,0.98)_58%,rgba(205,164,102,0.98)_100%)] text-[#3b2211] shadow-[inset_0_0_0_1px_rgba(255,246,215,0.36),inset_0_0_42px_rgba(95,54,19,0.18)] ${isPhoneLandscapeLayout ? "p-3" : "p-6"}`}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:repeating-linear-gradient(0deg,rgba(92,55,24,0.08)_0_1px,transparent_1px_8px),radial-gradient(circle_at_18%_22%,rgba(88,49,18,0.12),transparent_18%),radial-gradient(circle_at_80%_70%,rgba(96,55,21,0.10),transparent_22%)]" />
                        {page ? (
                          <div className="relative flex h-full flex-col">
                            <div
                              data-testid={
                                sideIndex === 0
                                  ? "betrayal-scenario-reader-page-label-desktop-left"
                                  : "betrayal-scenario-reader-page-label-desktop-right"
                              }
                              className="absolute left-0 top-0 text-[12px] font-bold tracking-[0.14em] text-[#86643f]"
                            >
                              {String(page.pageNumber).padStart(2, "0")}
                            </div>
                            <div
                              data-testid="betrayal-scenario-reader-body-scroll"
                              className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1"
                            >
                              <div
                                className={`grid min-h-full content-center ${isPhoneLandscapeLayout ? "gap-2 py-5" : "gap-6 px-3 py-10"}`}
                              >
                                {(page.sections ?? []).map((section) => {
                                  const isCinematicSection =
                                    isScenarioReaderCinematicSection(
                                      section.id,
                                    );

                                  return (
                                    <section
                                      key={section.id}
                                      data-testid={`betrayal-scenario-book-section-${section.id}`}
                                      data-cinematic-narration={
                                        isCinematicSection
                                          ? "opening"
                                          : undefined
                                      }
                                      className={
                                        isCinematicSection
                                          ? "min-h-[250px]"
                                          : `border-l-4 ${isPhoneLandscapeLayout ? "pl-2" : "pl-4"} ${section.accentClass}`
                                      }
                                    >
                                      {isCinematicSection ? (
                                        <CinematicNarrationPanel
                                          label={t(section.labelKey)}
                                          text={t(section.bodyKey)}
                                          variant="opening"
                                          compact={isPhoneLandscapeLayout}
                                          className={
                                            isPhoneLandscapeLayout
                                              ? "min-h-[232px]"
                                              : "min-h-[390px]"
                                          }
                                        />
                                      ) : (
                                        <>
                                          <h2
                                            data-testid={`betrayal-scenario-book-section-title-${section.id}`}
                                            className={`${isPhoneLandscapeLayout ? "text-[14px]" : "text-[22px]"} font-black tracking-[0.03em] text-[#3b2211]`}
                                          >
                                            {t(section.labelKey)}
                                          </h2>
                                          <p
                                            className={`${isPhoneLandscapeLayout ? "mt-1 text-[12px] leading-[1.45]" : "mt-3 text-[14px] leading-[1.6]"} whitespace-pre-line font-medium text-[#4e321c]`}
                                          >
                                            {t(section.bodyKey)}
                                          </p>
                                        </>
                                      )}
                                    </section>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </section>
                    ),
                  )}
                </>
              )}
            </div>
            {isReferenceScenarioOpeningStage ? null : (
              <div
                className={`flex items-center justify-between border-t border-[rgba(211,179,109,0.24)] text-[12px] font-semibold text-[#d5c5a2] ${isPhoneLandscapeLayout ? "mt-2 pt-2" : "mt-3 pt-3"}`}
              >
                <button
                  type="button"
                  data-testid="betrayal-scenario-reader-prev-zone"
                  onClick={() => onReferenceScenarioTurn("back")}
                  disabled={!canTurnReferenceScenarioBack}
                  className="inline-flex min-h-11 min-w-[112px] items-center justify-center gap-2 rounded-[5px] border border-[rgba(211,179,109,0.22)] bg-[rgba(9,13,12,0.84)] px-4 text-[#f3e0b4] transition hover:bg-[rgba(22,31,27,0.92)] disabled:opacity-35 disabled:hover:bg-[rgba(9,13,12,0.84)]"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  {t("board.scenario.readerPrev")}
                </button>
                <span
                  data-testid="betrayal-scenario-reader-footer-progress"
                  className="sr-only"
                >
                  {referenceScenarioSpreadIndex + 1}/
                  {referenceScenarioSpreadCount}
                </span>
                <button
                  type="button"
                  data-testid="betrayal-scenario-reader-next-zone"
                  onClick={() => onReferenceScenarioTurn("forward")}
                  disabled={!canTurnReferenceScenarioForward}
                  className="inline-flex min-h-11 min-w-[112px] items-center justify-center gap-2 rounded-[5px] border border-[rgba(211,179,109,0.22)] bg-[rgba(9,13,12,0.84)] px-4 text-[#f3e0b4] transition hover:bg-[rgba(22,31,27,0.92)] disabled:opacity-35 disabled:hover:bg-[rgba(9,13,12,0.84)]"
                >
                  {t("board.scenario.readerNext")}
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <OptimizedImage
            src={currentReferencePage.asset ?? referenceFallbackAsset}
            locale={effectiveLocale}
            alt={t(`board.reference.${currentReferencePage.id}`)}
            data-testid="betrayal-reference-card-image"
            data-asset-src={currentReferencePage.asset}
            className="h-full w-full object-contain shadow-[0_24px_56px_rgba(0,0,0,0.44)]"
            draggable={false}
          />
        )}
      </div>
    </MagnifyOverlay>
  );
}
