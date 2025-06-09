import { useCallback, useEffect, useState } from "react"
import { debounce } from "lodash"
import { TranscriptItem, SessionStatus, AgentMetadata } from "@/types/types"

export function useChatHistory(
  transcriptItems: TranscriptItem[],
  agentMetadata: AgentMetadata | null,
  verificationData: { phone: string },
  startTime: string | null,
  sessionStatus: SessionStatus
) {
  const [lastSentMessageBatch, setLastSentMessageBatch] = useState<
    Record<string, boolean>
  >({})

  const debouncedUpdateChatHistory = useCallback(
    debounce((chatHistory: TranscriptItem[]) => {
      if (
        !agentMetadata?.org_id ||
        !agentMetadata?.session_id ||
        !agentMetadata?.chatbot_id ||
        !startTime
      ) {
        console.log("[Chat History] Missing required metadata, skipping update")
        return
      }

      // Find messages that haven't been sent yet
      const newMessages = chatHistory.filter(item => {
        // Skip system messages, empty messages, and transcribing messages
        if (
          item.role === "system" ||
          !item.text ||
          item.text === "[Transcribing...]"
        ) {
          return false
        }
        // Skip messages that have already been sent
        return !lastSentMessageBatch[item.itemId]
      })

      // If there are no new messages, skip the update
      if (newMessages.length === 0) {
        return
      }

      console.log(
        `[Chat History] Sending ${newMessages.length} new messages to server`
      )

      // Update the last sent message batch
      const newBatch = { ...lastSentMessageBatch }
      newMessages.forEach(item => {
        newBatch[item.itemId] = true
      })
      setLastSentMessageBatch(newBatch)

      // Make the API call
      const url =
        "https://dashboard.propzing.in/functions/v1/update_agent_history"
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      }

      const body = JSON.stringify({
        org_id: agentMetadata?.org_id || "",
        chatbot_id: agentMetadata?.chatbot_id || "",
        session_id: agentMetadata?.session_id || "",
        phone_number: verificationData.phone || "",
        chat_history: newMessages.map(item => ({
          role: item.role,
          content: item.text,
          timestamp: new Date(item.createdAtMs).toISOString(),
        })),
        start_time: startTime,
        end_time: new Date().toISOString(),
      })

      fetch(url, {
        method: "POST",
        headers,
        body,
      })
        .then(response => response.json())
        .then(result => {
          console.log("[Chat History] Update result:", result)
        })
        .catch(error => {
          console.error("[Chat History] Error updating chat history:", error)
        })
    }, 1000), // Debounce for 1 second
    [agentMetadata, startTime, verificationData.phone, lastSentMessageBatch]
  )

  // Replace the updateChatHistory function and its useEffect with this one
  useEffect(() => {
    // Skip the update if there are no transcript items
    if (transcriptItems.length === 0) {
      return
    }

    // Call the debounced function
    debouncedUpdateChatHistory(transcriptItems)
  }, [transcriptItems, debouncedUpdateChatHistory])

  // Add an effect to clear the sent message batch when disconnecting
  useEffect(() => {
    if (sessionStatus === "DISCONNECTED") {
      setLastSentMessageBatch({})
    }
  }, [sessionStatus])
} 