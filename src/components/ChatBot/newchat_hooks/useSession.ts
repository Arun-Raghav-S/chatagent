import { useCallback } from "react"
import {
  SessionStatus,
  AgentConfig,
  AgentMetadata,
  TranscriptItem,
} from "@/types/types"
import { ExtendedAgentMetadata } from "../newchat_types"
import { generateSafeId } from "../newchat_utils"

export function useSession(
  sessionStatus: SessionStatus,
  selectedAgentName: string,
  selectedAgentConfigSet: AgentConfig[] | null,
  agentMetadata: AgentMetadata | null,
  setAgentMetadata: (
    value: React.SetStateAction<AgentMetadata | null>
  ) => void,
  chatbotId: string,
  sendClientEvent: (eventObj: any, eventNameSuffix?: string) => void,
  selectedLanguage: string,
  setActiveDisplayMode: (mode: any) => void,
  addTranscriptMessage: (
    itemId: string,
    role: "user" | "assistant" | "system",
    text: string
  ) => void,
  transcriptItems: TranscriptItem[],
  micMuted: boolean,
  sendSimulatedUserMessage: (text: string) => void
) {
  const fetchOrgMetadata = useCallback(async () => {
    if (!selectedAgentConfigSet || !chatbotId) {
      console.warn("[Metadata] Agent config set or chatbotId missing.")
      if (!chatbotId)
        addTranscriptMessage(
          generateSafeId(),
          "system",
          "Configuration Error: Chatbot ID missing."
        )
      return
    }
    console.log("[Metadata] Attempting to fetch org metadata...")

    const agentWithFetch = selectedAgentConfigSet.find(
      a => a.toolLogic?.fetchOrgMetadata
    )
    const fetchTool = agentWithFetch?.toolLogic?.fetchOrgMetadata

    if (fetchTool) {
      try {
        const sessionId = agentMetadata?.session_id || generateSafeId()
        console.log(
          `[Metadata] Calling fetch tool with session: ${sessionId}, chatbot: ${chatbotId}`
        )
        const result = await fetchTool(
          { session_id: sessionId, chatbot_id: chatbotId },
          transcriptItems
        )
        console.log("[Metadata] fetchOrgMetadata result:", result)

        if (result && !result.error) {
          setAgentMetadata(prev => ({
            ...(prev || {}),
            ...result,
            session_id: sessionId,
            chatbot_id: chatbotId,
          }))
          addTranscriptMessage(
            generateSafeId(),
            "system",
            "Agent context updated."
          )
        } else {
          addTranscriptMessage(
            generateSafeId(),
            "system",
            `Error fetching agent context: ${result?.error || "Unknown error"}`
          )
          setAgentMetadata(prev => ({
            ...(prev || {}),
            session_id: sessionId,
            chatbot_id: chatbotId,
          }))
        }
      } catch (error: any) {
        console.error("[Metadata] Error executing fetchOrgMetadata:", error)
        addTranscriptMessage(
          generateSafeId(),
          "system",
          `Error fetching agent context: ${error.message}`
        )
        const sessionId = agentMetadata?.session_id || generateSafeId()
        setAgentMetadata(prev => ({
          ...(prev || {}),
          session_id: sessionId,
          chatbot_id: chatbotId,
        }))
      }
    } else {
      console.warn("[Metadata] No agent found with fetchOrgMetadata tool.")
      addTranscriptMessage(
        generateSafeId(),
        "system",
        "Agent configuration error: Metadata fetch tool missing."
      )
    }
  }, [
    selectedAgentConfigSet,
    chatbotId,
    agentMetadata?.session_id,
    addTranscriptMessage,
    transcriptItems,
    setAgentMetadata,
  ])

  const updateSession = useCallback(
    async (shouldTriggerResponse: boolean = false) => {
      if (
        sessionStatus !== "CONNECTED" ||
        !selectedAgentConfigSet
      ) {
        return
      }

      const currentAgent = selectedAgentConfigSet.find(
        a => a.name === selectedAgentName
      )
      if (!currentAgent) {
        console.error(
          `[Update Session] Agent config not found for: ${selectedAgentName}`
        )
        return
      }

      if (agentMetadata) {
        currentAgent.metadata = {
          ...(currentAgent.metadata || {}),
          ...agentMetadata,
        }
        currentAgent.metadata.language = selectedLanguage
      } else {
        currentAgent.metadata = {
          ...(currentAgent.metadata || {}),
          chatbot_id: chatbotId,
          session_id: generateSafeId(),
          language: selectedLanguage,
        }
        console.warn(
          "[Update Session] agentMetadata state was null, initializing from props/new session."
        )
      }

      setAgentMetadata(prev => ({
        ...(prev || {}),
        ...currentAgent.metadata,
        language: selectedLanguage,
      }))

      console.log(
        `[Update Session] Updating server session for agent: ${selectedAgentName}, language: ${selectedLanguage}`
      )

      let instructions = currentAgent.instructions

      if (currentAgent.name === "realEstate") {
        try {
          const { getInstructions } = await import(
            "@/agentConfigs/realEstate/realEstateAgent"
          )
          instructions = getInstructions(currentAgent.metadata)
          console.log(
            "[Update Session] Dynamic instructions applied for realEstate agent with language:",
            selectedLanguage
          )
        } catch (e) {
          console.error(
            "[Update Session] Error loading realEstate agent for dynamic instructions:",
            e
          )
          instructions = instructions.replace(
            /Respond ONLY in \$\{.*?\}\./,
            `Respond ONLY in ${selectedLanguage}.`
          )
        }
      } else if (currentAgent.name === "authentication") {
        try {
          const { getAuthInstructions } = await import(
            "@/agentConfigs/realEstate/authentication"
          )
          const extendedMetadata =
            currentAgent.metadata as ExtendedAgentMetadata
          const metadataForInstructions = {
            ...currentAgent.metadata,
            flow_context: extendedMetadata?.flow_context,
            pending_question: extendedMetadata?.pending_question,
            came_from: (currentAgent.metadata as any)?.came_from,
          }
          console.log(
            "🚨🚨🚨 [Update Session] Auth agent metadata for instructions:",
            {
              flow_context: metadataForInstructions.flow_context,
              pending_question: metadataForInstructions.pending_question,
              came_from: metadataForInstructions.came_from,
              customer_name: metadataForInstructions.customer_name,
            }
          )
          instructions = getAuthInstructions(metadataForInstructions)
          console.log(
            "[Update Session] Dynamic instructions applied for authentication agent with language:",
            selectedLanguage
          )
        } catch (e) {
          console.error(
            "[Update Session] Error loading auth agent for dynamic instructions:",
            e
          )
          instructions = instructions.replace(
            /Respond ONLY in \$\{.*?\}\./,
            `Respond ONLY in ${selectedLanguage}.`
          )
        }
      } else if (currentAgent.name === "scheduleMeeting") {
        try {
          const { getScheduleMeetingInstructions } = await import(
            "@/agentConfigs/realEstate/scheduleMeetingAgent"
          )
          instructions = getScheduleMeetingInstructions(currentAgent.metadata)
          console.log(
            "[Update Session] Dynamic instructions applied for scheduling agent with language:",
            selectedLanguage
          )
        } catch (e) {
          console.error(
            "[Update Session] Error loading schedule agent for dynamic instructions:",
            e
          )
          instructions = instructions.replace(
            /Respond ONLY in \$\{.*?\}\./,
            `Respond ONLY in ${selectedLanguage}.`
          )
        }
      } else {
        instructions = instructions.replace(
          /Respond ONLY in \$\{.*?\}\./,
          `Respond ONLY in ${selectedLanguage}.`
        )
        instructions = instructions.replace(
          /LANGUAGE: Respond ONLY in \$\{.*?\}\./,
          `LANGUAGE: Respond ONLY in ${selectedLanguage}.`
        )
      }

      const languageMapping: Record<string, string> = {
        English: "en",
        Hindi: "hi",
        Tamil: "ta",
        Spanish: "es",
        French: "fr",
        German: "de",
        Chinese: "zh",
        Japanese: "ja",
        Arabic: "ar",
        Russian: "ru",
      }
      const languageCode = languageMapping[selectedLanguage] || "en"
      console.log(
        `[Update Session] Using language code: ${languageCode} for ${selectedLanguage}`
      )

      const turnDetection = !micMuted
        ? {
            type: "server_vad",
            threshold: 0.9,
            prefix_padding_ms: 250,
            silence_duration_ms: 800,
            create_response: true,
          }
        : null

      sendClientEvent(
        { type: "input_audio_buffer.clear" },
        "clear audio buffer on session update"
      )

      const sessionUpdatePayload = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: instructions,
          voice: "coral",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1",
            language: languageCode,
          },
          turn_detection: turnDetection,
          tools: currentAgent.tools || [],
          // Response length controls for concise answers
         
        },
      }

      sendClientEvent(sessionUpdatePayload, `(agent: ${selectedAgentName})`)

      if (shouldTriggerResponse) {
        console.log(
          "[Update Session] Triggering initial response with simulated 'hi' message"
        )
        if (selectedAgentName === "authentication") {
          setActiveDisplayMode("VERIFICATION_FORM")
          console.log(
            "[Update Session] Setting VERIFICATION_FORM display mode for authentication agent"
          )
        }
        sendSimulatedUserMessage("hi")
      }
    },
    [
      sessionStatus,
      selectedAgentName,
      selectedAgentConfigSet,
      agentMetadata,
      chatbotId,
      sendClientEvent,
      selectedLanguage,
      setActiveDisplayMode,
      setAgentMetadata,
      sendSimulatedUserMessage,
      micMuted,
    ]
  )

  const updateSessionMicState = useCallback(async () => {
    if (
      sessionStatus !== "CONNECTED" ||
      !selectedAgentConfigSet
    ) {
      return
    }

    const currentAgent = selectedAgentConfigSet.find(
      a => a.name === selectedAgentName
    )
    if (!currentAgent) {
      console.error(
        `[Update Mic Session] Agent config not found for: ${selectedAgentName}`
      )
      return
    }

    const turnDetection = !micMuted
      ? {
          type: "server_vad",
          threshold: 0.9,
          prefix_padding_ms: 250,
          silence_duration_ms: 800,
          create_response: true,
        }
      : null

    console.log(
      `[Update Mic Session] Updating turn detection: ${
        turnDetection ? "enabled" : "disabled"
      }`
    )

    const sessionUpdatePayload = {
      type: "session.update",
      session: {
        turn_detection: turnDetection,
      },
    }

    sendClientEvent(
      sessionUpdatePayload,
      `(mic state update: ${micMuted ? "muted" : "unmuted"})`
    )
  }, [
    sessionStatus,
    selectedAgentConfigSet,
    selectedAgentName,
    micMuted,
    sendClientEvent,
  ])

  return {
    fetchOrgMetadata,
    updateSession,
    updateSessionMicState,
  }
} 