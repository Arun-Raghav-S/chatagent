import { useCallback, useState } from 'react';
import { TranscriptItem, PropertyProps } from '../types';
import { generateSafeId } from '../utils/helpers';

export const useTranscriptManagement = () => {
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [lastAgentTextMessage, setLastAgentTextMessage] = useState<string | null>(null);

  const addTranscriptMessage = useCallback((
    itemId: string, 
    role: "user" | "assistant" | "system", 
    text: string, 
    properties?: PropertyProps[], 
    agentName?: string
  ) => {
    // Generate safe ID if needed
    if (itemId === 'new' || itemId.length > 32) {
      itemId = generateSafeId();
    }
    
    if (role === 'assistant') {
      setLastAgentTextMessage(text);
    }
    
    setTranscriptItems((prev) => {
      // Avoid adding duplicates if item already exists
      if (prev.some(item => item.itemId === itemId)) {
        return prev; 
      }
      
      return [
        ...prev,
        {
          itemId,
          type: "MESSAGE",
          role,
          text: text, 
          createdAtMs: Date.now(),
          status: (role === 'assistant' || role === 'user') ? 'IN_PROGRESS' : 'DONE',
          agentName: agentName
        },
      ];
    });
  }, []);

  const updateTranscriptMessage = useCallback((itemId: string, textDelta: string, isDelta: boolean) => {
    setTranscriptItems((prev) =>
      prev.map((item) => {
        if (item.itemId === itemId && item.type === 'MESSAGE') {
          const newText = isDelta ? (item.text || "") + textDelta : textDelta;
          if(item.role === 'assistant') {
            setLastAgentTextMessage(newText);
          }
          return {
            ...item,
            text: newText,
            status: 'IN_PROGRESS',
          };
        }
        return item;
      })
    );
  }, []);

  const updateTranscriptItemStatus = useCallback((itemId: string, status: "IN_PROGRESS" | "DONE" | "ERROR") => {
    setTranscriptItems((prev) =>
      prev.map((item) => {
        if (item.itemId === itemId) {
          return { ...item, status };
        }
        return item;
      })
    );
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscriptItems([]);
    setLastAgentTextMessage(null);
  }, []);

  return {
    transcriptItems,
    lastAgentTextMessage,
    addTranscriptMessage,
    updateTranscriptMessage,
    updateTranscriptItemStatus,
    clearTranscript,
    setLastAgentTextMessage
  };
}; 