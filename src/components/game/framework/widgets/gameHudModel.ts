import { UI_Z_INDEX } from '../../../../core';
import {
    buildGameFeedbackActionLog,
    buildGameFeedbackStateSnapshot,
} from '../../../../lib/feedback/gameFeedbackDiagnostics';
import type { MatchChatMessage } from '../../../../services/matchSocket';
import { MAX_CHAT_MESSAGES } from '../../../../shared/chat';

export type HudPhaseStateLike = {
    sys?: {
        phase?: unknown;
        flow?: {
            phase?: unknown;
        };
    };
};

export const resolveGameHudPhase = (state?: HudPhaseStateLike | null) => {
    const phase = state?.sys?.phase ?? state?.sys?.flow?.phase;
    return typeof phase === 'string' ? phase : null;
};

export const isSelfChatMessage = (
    message: MatchChatMessage,
    myPlayerId?: string | null,
    myDisplayName?: string
) => {
    return message.senderId != null
        ? String(message.senderId) === String(myPlayerId ?? '')
        : message.senderName === myDisplayName;
};

export const getLatestIncomingMessage = (
    messages: MatchChatMessage[],
    myPlayerId?: string | null,
    myDisplayName?: string
) => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (!isSelfChatMessage(message, myPlayerId, myDisplayName)) return message;
    }
    return null;
};

export const trimChatMessages = (
    messages: MatchChatMessage[],
    maxMessages = MAX_CHAT_MESSAGES
) => {
    if (messages.length <= maxMessages) return messages;
    return messages.slice(messages.length - maxMessages);
};

export const buildGameHudFeedbackActionLog = buildGameFeedbackActionLog;
export const buildGameHudFeedbackStateSnapshot = buildGameFeedbackStateSnapshot;

export const GAME_HUD_FAB_Z_INDEX = UI_Z_INDEX.emergencyHud;
