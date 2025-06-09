import { useState, useCallback, useRef } from "react"
import { TranscriptItem } from "@/types/types"
import { PropertyProps } from "../newchat_types"
import { generateSafeId } from "../newchat_utils"

export function useTranscript(selectedAgentName: string) {
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([])
  const [lastAgentTextMessage, setLastAgentTextMessage] = useState<
    string | null
  >(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  const addTranscriptMessage = useCallback(
    (
      itemId: string,
      role: "user" | "assistant" | "system",
      text: string,
      properties?: PropertyProps[],
      agentName?: string
    ) => {
      if (itemId === "new" || itemId.length > 32) {
        itemId = generateSafeId()
      }

      if (role === "assistant") {
        setLastAgentTextMessage(text)
      }

      setTranscriptItems(prev => {
        if (prev.some(item => item.itemId === itemId)) {
          return prev
        }
        return [
          ...prev,
          {
            itemId,
            type: "MESSAGE",
            role,
            text: text,
            createdAtMs: Date.now(),
            status:
              role === "assistant" || role === "user" ? "IN_PROGRESS" : "DONE",
            agentName: agentName,
          },
        ]
      })
    },
    []
  )

  const updateTranscriptMessage = useCallback(
    (itemId: string, textDelta: string, isDelta: boolean) => {
      setTranscriptItems(prev =>
        prev.map(item => {
          if (item.itemId === itemId && item.type === "MESSAGE") {
            const newText = isDelta ? (item.text || "") + textDelta : textDelta
            if (item.role === "assistant") {
              setLastAgentTextMessage(newText)

              console.log(
                `📝 [${selectedAgentName.toUpperCase()} STREAMING]: "${newText}"`
              )
              console.log(
                `📊 [STREAMING DETAILS] Agent: ${selectedAgentName} | ItemID: ${itemId.substring(
                  0,
                  8
                )}... | Length: ${
                  newText.length
                } chars | isDelta: ${isDelta}`
              )
            }
            return {
              ...item,
              text: newText,
              status: "IN_PROGRESS",
            }
          }
          return item
        })
      )
    },
    [selectedAgentName]
  )

  const updateTranscriptItemStatus = useCallback(
    (itemId: string, status: "IN_PROGRESS" | "DONE" | "ERROR") => {
      setTranscriptItems(prev =>
        prev.map(item => {
          if (item.itemId === itemId) {
            return { ...item, status }
          }
          return item
        })
      )
    },
    []
  )

  return {
    transcriptItems,
    setTranscriptItems,
    lastAgentTextMessage,
    setLastAgentTextMessage,
    addTranscriptMessage,
    updateTranscriptMessage,
    updateTranscriptItemStatus,
    transcriptEndRef,
  }
} 