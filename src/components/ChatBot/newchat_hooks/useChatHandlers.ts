import { useCallback } from "react"
import { SessionStatus, AgentConfig } from "@/types/types"
import { generateSafeId } from "../newchat_utils"
import { PropertyProps } from "../newchat_types"

// Helper function to determine if a message should be hidden from UI
const shouldHideUIMessage = (text: string): boolean => {
  return (
    // OTP verification messages
    text.toLowerCase().includes('verification code') ||
    text.toLowerCase().includes('my code is') ||
    text.toLowerCase().includes('otp is') ||
    /verification code is \d{4,6}/.test(text.toLowerCase()) ||
    /my verification code is \d{4,6}/.test(text.toLowerCase()) ||
    
    // Verification form submission messages
    /my name is .+ and my phone number is .+/i.test(text) ||
    (text.toLowerCase().includes('my name is') && text.toLowerCase().includes('phone number is')) ||
    
    // Time slot selection messages
    /^selected .+ at .+\.?$/i.test(text) ||
    /^selected .+\.?$/i.test(text) ||
    text.toLowerCase().startsWith('selected ') ||
    
    // Schedule visit request messages
    text.toLowerCase().includes('schedule a visit for') ||
    text.toLowerCase().includes('book an appointment') ||
    /yes, i'd like to schedule a visit for .+/i.test(text) ||
    
    // Generic UI interaction patterns
    text.toLowerCase().includes('please help me book') ||
    text.toLowerCase().includes('i would like to schedule')
  );
};

interface UseChatHandlersProps {
  sessionStatus: SessionStatus
  dcRef: React.MutableRefObject<RTCDataChannel | null>
  addTranscriptMessage: (
    itemId: string,
    role: "user" | "assistant" | "system",
    text: string
  ) => void
  canCreateResponse: () => boolean
  inputValue: string
  setInputValue: (value: string) => void
  setSelectedProperty: (property: PropertyProps | null) => void
  setSelectedPropertyDetails: (property: PropertyProps | null) => void
  selectedAgentConfigSet: AgentConfig[] | null
  setSelectedDay: (day: string) => void
  setSelectedTime: (time: string | null) => void
  setVerificationData: (data: any) => void
  setIsVerifying: (isVerifying: boolean) => void
  setShowOtpScreen: (show: boolean) => void
  micMuted: boolean
  setMicMuted: (muted: boolean) => void
  audioContext: AudioContext | null
  chatbotId: string
  disconnectFromRealtime: () => void
  connectToRealtime: () => void
  sendClientEvent: (eventObj: any, eventNameSuffix?: string) => void
}

export function useChatHandlers({
  sessionStatus,
  dcRef,
  addTranscriptMessage,
  canCreateResponse,
  inputValue,
  setInputValue,
  setSelectedProperty,
  setSelectedPropertyDetails,
  selectedAgentConfigSet,
  setSelectedDay,
  setSelectedTime,
  setVerificationData,
  setIsVerifying,
  setShowOtpScreen,
  micMuted,
  setMicMuted,
  audioContext,
  chatbotId,
  disconnectFromRealtime,
  connectToRealtime,
  sendClientEvent,
}: UseChatHandlersProps) {
  const stopCurrentResponse = useCallback(() => {
    const responseIsActive = !canCreateResponse()
    if (responseIsActive) {
      console.log("[Audio] Stopping current response (active response detected)")
      sendClientEvent(
        { type: "response.cancel" },
        "(canceling current response)"
      )
      sendClientEvent(
        { type: "output_audio_buffer.clear" },
        "(clearing audio buffer)"
      )
    } else {
      console.log(
        "[Audio] No active response to stop, just clearing audio buffer"
      )
      sendClientEvent(
        { type: "output_audio_buffer.clear" },
        "(clearing audio buffer only)"
      )
    }
  }, [canCreateResponse, sendClientEvent])

  const handleSend = useCallback(() => {
    const textToSend = inputValue.trim()
    if (!textToSend || sessionStatus !== "CONNECTED" || !dcRef.current) return

    stopCurrentResponse()

    console.log(`[Send Text] Sending: "${textToSend}"`)
    const userMessageId = generateSafeId()
    addTranscriptMessage(userMessageId, "user", textToSend)
    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          id: userMessageId,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: textToSend }],
        },
      },
      "(user text message)"
    )
    setInputValue("")
    sendClientEvent({ type: "response.create" }, "(trigger response)")
  }, [
    inputValue,
    sessionStatus,
    dcRef,
    stopCurrentResponse,
    addTranscriptMessage,
    sendClientEvent,
    setInputValue,
  ])

  const handleScheduleVisitRequest = (property: PropertyProps) => {
    console.log(
      `[UI] Schedule visit requested for: ${property.name} (${property.id})`
    )
    setSelectedProperty(property)
    stopCurrentResponse()

    const scheduleMessage = `Yes, I'd like to schedule a visit for ${property.name}. Please help me book an appointment.`
    const userMessageId = generateSafeId()

    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          id: userMessageId,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: scheduleMessage }],
        },
      },
      "(schedule request from UI)"
    )
    sendClientEvent(
      { type: "response.create" },
      "(trigger response after schedule request)"
    )
    // Don't add schedule request messages to transcript - they're UI-generated
    if (!shouldHideUIMessage(scheduleMessage)) {
      addTranscriptMessage(userMessageId, "user", scheduleMessage)
    }
    setSelectedPropertyDetails(null)
  }

  const handleTimeSlotSelection = useCallback(
    (date: string, time?: string) => {
      console.log(
        `[UI] User selected time slot: date=${date}, time=${time || "none"}`
      )
      setSelectedDay(date)
      if (time) {
        setSelectedTime(time)
      }

      const schedulingAgent = selectedAgentConfigSet?.find(
        a => a.name === "scheduleMeeting"
      )
      if (schedulingAgent && schedulingAgent.metadata) {
        ;(schedulingAgent.metadata as any).selectedDate = date
        if (time) {
          ;(schedulingAgent.metadata as any).selectedTime = time
          console.log(`[UI] Saved date ${date} and time ${time} to agent metadata`)
        } else {
          console.log(`[UI] Saved only date ${date} to agent metadata (no time yet)`)
        }
      }

      setTimeout(() => {
        const userMessageId = generateSafeId()
        let selectionMessage
        if (time) {
          selectionMessage = `Selected ${date} at ${time}.`
        } else {
          selectionMessage = `Selected ${date}.`
        }

        if (!canCreateResponse()) {
          console.log(
            "[UI] Stopping any active response before sending selection"
          )
          sendClientEvent(
            { type: "response.cancel" },
            "(canceling before selection)"
          )
          sendClientEvent(
            { type: "output_audio_buffer.clear" },
            "(clearing audio buffer)"
          )
          setTimeout(() => {
            // Don't add time slot selection messages to transcript - they're UI-generated
            if (!shouldHideUIMessage(selectionMessage)) {
              addTranscriptMessage(userMessageId, "user", selectionMessage)
            }
            sendClientEvent(
              {
                type: "conversation.item.create",
                item: {
                  id: userMessageId,
                  type: "message",
                  role: "user",
                  content: [{ type: "input_text", text: selectionMessage }],
                },
              },
              time ? "(time slot selection)" : "(date selection only)"
            )
            setTimeout(() => {
              sendClientEvent(
                { type: "response.create" },
                "(trigger response after selection)"
              )
            }, 150)
          }, 250)
        } else {
          // Don't add time slot selection messages to transcript - they're UI-generated
          if (!shouldHideUIMessage(selectionMessage)) {
            addTranscriptMessage(userMessageId, "user", selectionMessage)
          }
          sendClientEvent(
            {
              type: "conversation.item.create",
              item: {
                id: userMessageId,
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: selectionMessage }],
              },
            },
            time ? "(time slot selection)" : "(date selection only)"
          )
          setTimeout(() => {
            sendClientEvent(
              { type: "response.create" },
              "(trigger response after selection)"
            )
          }, 100)
        }
      }, 100)
    },
    [
      sendClientEvent,
      addTranscriptMessage,
      selectedAgentConfigSet,
      canCreateResponse,
      setSelectedDay,
      setSelectedTime,
    ]
  )

  const handleVerificationSubmit = useCallback(
    (name: string, phone: string) => {
      console.log(
        `[UI] User submitted verification data: name=${name}, phone=${phone}`
      )
      setVerificationData((prev: any) => ({ ...prev, name, phone }))
      const userMessageId = generateSafeId()
      const detailsMessage = `My name is ${name} and my phone number is ${phone}.`
      // Don't add verification form messages to transcript - they're UI-generated
      if (!shouldHideUIMessage(detailsMessage)) {
        addTranscriptMessage(userMessageId, "user", detailsMessage)
      }
      sendClientEvent(
        {
          type: "conversation.item.create",
          item: {
            id: userMessageId,
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: detailsMessage }],
          },
        },
        "(user verification details)"
      )
      sendClientEvent(
        { type: "response.create" },
        "(trigger response after details)"
      )
      setIsVerifying(false)
      setShowOtpScreen(true)
    },
    [
      sendClientEvent,
      addTranscriptMessage,
      setVerificationData,
      setIsVerifying,
      setShowOtpScreen,
    ]
  )

  const handleOtpSubmit = useCallback(
    (otp: string) => {
      console.log(`[UI] User submitted OTP: ${otp}`)
      const userMessageId = generateSafeId()
      const otpMessage = `My verification code is ${otp}.`
      // Don't add OTP messages to transcript - they're UI-generated
      if (!shouldHideUIMessage(otpMessage)) {
        addTranscriptMessage(userMessageId, "user", otpMessage)
      }
      sendClientEvent(
        {
          type: "conversation.item.create",
          item: {
            id: userMessageId,
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: otpMessage }],
          },
        },
        "(user OTP submission)"
      )
      sendClientEvent({ type: "response.create" }, "(trigger response after OTP)")
      setShowOtpScreen(false)
      addTranscriptMessage(generateSafeId(), "system", "Verifying your code...")
    },
    [sendClientEvent, addTranscriptMessage, setShowOtpScreen]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSend()
    }
  }

  const handleCallButtonClick = () => {
    if (sessionStatus === "DISCONNECTED") {
      if (chatbotId) {
        connectToRealtime()
      } else {
        addTranscriptMessage(
          generateSafeId(),
          "system",
          "Cannot connect: Chatbot ID is missing."
        )
        console.error("Attempted to connect without a chatbotId.")
      }
    } else {
      disconnectFromRealtime()
    }
  }

  const commitAudioBuffer = useCallback(() => {
    if (sessionStatus !== "CONNECTED" || !dcRef.current) return
    console.log("[Audio] Manually committing audio buffer")
    sendClientEvent({ type: "input_audio_buffer.commit" }, "manual commit")
    sendClientEvent(
      { type: "response.create" },
      "trigger response after commit"
    )
  }, [sessionStatus, sendClientEvent, dcRef])

  const toggleMic = useCallback(() => {
    const turningOn = micMuted
    if (sessionStatus !== "CONNECTED" || !dcRef.current) {
      console.log("[Audio] Cannot toggle microphone, not connected")
      return
    }
    console.log(`[Audio] ${turningOn ? "Enabling" : "Disabling"} microphone`)
    setMicMuted(!micMuted)
    if (turningOn && audioContext) {
      setTimeout(() => {
        sendClientEvent(
          { type: "input_audio_buffer.clear" },
          "clear buffer on mic enable"
        )
      }, 200)
    }
  }, [micMuted, sessionStatus, dcRef, audioContext, sendClientEvent, setMicMuted])

  const sendTriggerMessage = useCallback(
    (triggerText: string) => {
      if (sessionStatus !== "CONNECTED" || !dcRef.current) {
        console.log("[UI] Cannot send trigger message - not connected")
        return
      }
      stopCurrentResponse()
      const triggerMessageId = generateSafeId()
      console.log(`[UI] Sending trigger message: "${triggerText}"`)
      sendClientEvent(
        {
          type: "conversation.item.create",
          item: {
            id: triggerMessageId,
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: triggerText }],
          },
        },
        "(UI trigger message)"
      )
      sendClientEvent(
        { type: "response.create" },
        "(trigger response for UI trigger)"
      )
    },
    [sessionStatus, dcRef, sendClientEvent, stopCurrentResponse]
  )

  const sendSimulatedUserMessage = useCallback(
    (text: string) => {
      const id = generateSafeId()
      sendClientEvent(
        {
          type: "conversation.item.create",
          item: {
            id,
            type: "message",
            role: "user",
            content: [{ type: "input_text", text }],
          },
        },
        "(simulated user text message)"
      )
      sendClientEvent(
        { type: "response.create" },
        "(trigger response after simulated user message)"
      )
    },
    [sendClientEvent]
  )

  return {
    stopCurrentResponse,
    handleSend,
    handleScheduleVisitRequest,
    handleTimeSlotSelection,
    handleVerificationSubmit,
    handleOtpSubmit,
    handleKeyDown,
    handleCallButtonClick,
    commitAudioBuffer,
    toggleMic,
    sendTriggerMessage,
    sendSimulatedUserMessage,
  }
} 