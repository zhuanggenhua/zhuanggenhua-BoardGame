import { type ComponentProps } from 'react';
import { GameHUD } from '../components/game/framework/widgets/GameHUD';
import { resolveGameHudPhase } from '../components/game/framework/widgets/gameHudModel';
import type { MatchSeatSwapConfig } from '../components/game/framework';
import { type AiSeatController } from '../engine/ai';
import type { OnlineAiRecoveryEngineConfig } from '../engine/transport/onlineAiRecovery';
import { useGameClient } from '../engine/transport/react';
import { useMatchRoomHudForceDismiss } from './useMatchRoomHudForceDismiss';
import { useMatchRoomHudPresenceModel } from './useMatchRoomHudPresenceModel';
import { useMatchRoomHudSeatSwapModel } from './useMatchRoomHudSeatSwapModel';

type MatchRoomOnlineHudModel = ComponentProps<typeof GameHUD>;

export type MatchRoomOnlineHudBridgeProps = {
    matchId?: string;
    gameId?: string;
    isHost: boolean;
    credentials?: string;
    myPlayerId?: string | null;
    fallbackPlayers: Array<{ id: number; name?: string; isConnected?: boolean }>;
    fallbackOpponentName?: string | null;
    onLeave?: () => void;
    onDestroy?: () => void;
    onForceExit?: () => void;
    onForceEndAiPhase?: () => Promise<boolean>;
    showForceEndAiPhase?: boolean;
    isLoading?: boolean;
    seatControllers: Record<string, AiSeatController>;
    seatSwapConfig?: MatchSeatSwapConfig | null;
    engineConfig?: OnlineAiRecoveryEngineConfig | null;
    preferredFullscreenOrientation?: MatchRoomOnlineHudModel['preferredFullscreenOrientation'];
    renderRuntimeSettings?: MatchRoomOnlineHudModel['renderRuntimeSettings'];
    availableEmotes?: MatchRoomOnlineHudModel['availableEmotes'];
    resolveEmote?: MatchRoomOnlineHudModel['resolveEmote'];
};

export function useMatchRoomOnlineHudModel({
    matchId,
    gameId,
    isHost,
    credentials,
    myPlayerId,
    fallbackPlayers,
    fallbackOpponentName,
    onLeave,
    onDestroy,
    onForceExit,
    onForceEndAiPhase,
    showForceEndAiPhase,
    isLoading,
    seatControllers,
    seatSwapConfig,
    engineConfig,
    preferredFullscreenOrientation,
    renderRuntimeSettings,
    availableEmotes,
    resolveEmote,
}: MatchRoomOnlineHudBridgeProps): MatchRoomOnlineHudModel {
    const { state, dispatch, matchPlayers, isConnected } = useGameClient();
    const hudPresence = useMatchRoomHudPresenceModel({
        fallbackPlayers,
        transportPlayers: matchPlayers,
        transportConnected: isConnected,
        myPlayerId,
        seatControllers,
    });
    const canForceEndAiPhase = Boolean(showForceEndAiPhase && onForceEndAiPhase);
    const canForceDismissPopup = true;
    const isPregameSetupPhase = resolveGameHudPhase(
        state as { sys?: { phase?: unknown; flow?: { phase?: unknown } } } | null | undefined,
    ) === 'setup';
    const forceDismissPopup = useMatchRoomHudForceDismiss({
        gameId,
        state,
        dispatch,
        myPlayerId,
        engineConfig,
    });
    const seatSwapModel = useMatchRoomHudSeatSwapModel({
        seatSwapConfig,
        state,
        dispatch,
        myPlayerId,
        players: hudPresence.players,
        seatControllers,
    });

    return {
        mode: 'online',
        matchId,
        gameId,
        isHost,
        credentials,
        myPlayerId,
        opponentName: hudPresence.opponentName ?? fallbackOpponentName ?? null,
        opponentConnected: hudPresence.opponentConnected,
        presenceReady: hudPresence.presenceReady,
        players: hudPresence.players,
        onLeave,
        onDestroy,
        onForceExit,
        showForceEndAiPhase: canForceEndAiPhase,
        onForceEndAiPhase: canForceEndAiPhase ? onForceEndAiPhase : undefined,
        showForceDismissPopup: canForceDismissPopup,
        onForceDismissPopup: forceDismissPopup,
        ...seatSwapModel,
        isPregameSetupPhase,
        isLoading,
        preferredFullscreenOrientation,
        renderRuntimeSettings,
        availableEmotes,
        resolveEmote,
    };
}
