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
  setActiveDisplayMode: (mode: any) => void
  setBookingDetails: (details: any) => void
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
  setActiveDisplayMode,
  setBookingDetails,
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
    async (name: string, phone: string) => {
      console.log(
        `[UI] User submitted verification data: name=${name}, phone=${phone}`
      )
      
      try {
        setVerificationData((prev: any) => ({ ...prev, name, phone }))
        setIsVerifying(false)
        
        // Get current agent metadata for IDs
        const authAgent = selectedAgentConfigSet?.find(a => a.name === "authentication")
        const metadata = authAgent?.metadata
        
        if (!authAgent) {
          throw new Error("Authentication agent not found")
        }
        
        // Call submitPhoneNumber tool directly from UI
        const { submitPhoneNumber } = await import("../../../agentConfigs/realEstate/authTools/submitPhoneNumber")
        
        const result = await submitPhoneNumber({
          name,
          phone_number: phone,
          session_id: metadata?.session_id || "default_session",
          org_id: metadata?.org_id || "default_org", 
          chatbot_id: metadata?.chatbot_id || "default_chatbot"
        }, authAgent)
        
        console.log("[UI] submitPhoneNumber result:", result)
        
        if (result.error) {
          // Show error message from agent
          const errorMessageId = generateSafeId()
          addTranscriptMessage(errorMessageId, "assistant", result.message || "There was an issue sending the verification code. Please try again.")
          throw new Error(result.message || "Failed to send verification code")
        } else {
          // Success - show OTP form
          setShowOtpScreen(true)
          setActiveDisplayMode('OTP_FORM')
          console.log("[UI] ✅ Verification form submitted successfully, showing OTP screen")
          
          // Update agent metadata with user's name for personalized responses
          if (authAgent.metadata) {
            const metadata = authAgent.metadata as any
            metadata.customer_name = name
            metadata.phone_number = phone
          }
          
          // 🎯 TRIGGER AGENT TO SPEAK: Send a message to authentication agent to get conversational response
          const triggerMessageId = generateSafeId()
          const triggerMessage = `I have provided my details: Name: ${name}, Phone: ${phone}. Please confirm the OTP has been sent.`
          
          // Send the trigger message to the agent
          sendClientEvent(
            {
              type: "conversation.item.create",
              item: {
                id: triggerMessageId,
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: triggerMessage }],
              },
            },
            "(trigger auth agent response after form submission)"
          )
          
          // Trigger agent response
          sendClientEvent(
            { type: "response.create" },
            "(trigger auth agent to speak about OTP sent)"
          )
        }
        
      } catch (error) {
        console.error("[UI] Error in handleVerificationSubmit:", error)
        const errorMessageId = generateSafeId()
        addTranscriptMessage(errorMessageId, "assistant", "There was an unexpected error. Please try again.")
        // Re-throw error so VerificationForm can reset its submitting state
        throw error
      }
    },
    [
      addTranscriptMessage,
      setVerificationData,
      setIsVerifying,
      setShowOtpScreen,
      setActiveDisplayMode,
      selectedAgentConfigSet,
      sendClientEvent
    ]
  )

  const handleOtpSubmit = useCallback(
    async (otp: string) => {
      console.log(`[UI] User submitted OTP: ${otp}`)
      
      // Show verifying message
      addTranscriptMessage(generateSafeId(), "system", "Verifying your code...")
      
      try {
        // Get verification data and agent metadata
        const authAgent = selectedAgentConfigSet?.find(a => a.name === "authentication")
        const metadata = authAgent?.metadata
        
        if (!authAgent) {
          throw new Error("Authentication agent not found")
        }
        
        // Call verifyOTP tool directly from UI
        const { verifyOTP } = await import("../../../agentConfigs/realEstate/authTools/verifyOTP")
        
        const result = await verifyOTP({
          phone_number: metadata?.phone_number || "",
          otp,
          session_id: metadata?.session_id || "default_session",
          org_id: metadata?.org_id || "default_org", 
          chatbot_id: metadata?.chatbot_id || "default_chatbot"
        }, authAgent)
        
        console.log("[UI] verifyOTP result:", result)
        
        const assistantMessageId = generateSafeId()
        
        if (result.verified) {
          // Check if this is coming from scheduling flow
          const flowContext = (result as any).flow_context
          const cameFromScheduling = flowContext === 'from_scheduling_verification'
          
          console.log(`[UI] 🎯 Verification success - Flow context: ${flowContext}, Came from scheduling: ${cameFromScheduling}`)
          
          if (cameFromScheduling) {
            // MANUAL BOOKING CONFIRMATION FLOW for 100% success rate
            console.log(`[UI] 🎯 MANUAL BOOKING CONFIRMATION: Processing scheduling verification success`)
            
            // Extract all the scheduling data from result
            const customerName = (result as any).customer_name || ""
            const propertyName = (result as any).property_name || ""
            const selectedDate = (result as any).selectedDate || ""
            const selectedTime = (result as any).selectedTime || ""
            
            console.log(`[UI] 🎯 Booking data:`, { customerName, propertyName, selectedDate, selectedTime })
            
            // Step 1: Show success message with booking confirmation
            const confirmationMessage = `Great ${customerName}! Your visit to ${propertyName} has been scheduled on ${selectedDate}.`
            addTranscriptMessage(assistantMessageId, "assistant", confirmationMessage)
            
            // Step 2: Set booking details and show booking confirmation UI
            const bookingDetails = {
              customerName: customerName,
              propertyName: propertyName,
              date: selectedDate.split(' at ')[0].trim(), // Clean date
              time: selectedTime,
              phoneNumber: (result as any).phone_number
            }
            
            console.log(`[UI] 🎯 Setting booking details:`, bookingDetails)
            setBookingDetails(bookingDetails)
            setShowOtpScreen(false)
            setActiveDisplayMode('BOOKING_CONFIRMATION')
            
                        // Step 3: Update realEstate agent metadata with scheduling data, then call completeScheduling
            setTimeout(async () => {
              try {
                const realEstateAgent = selectedAgentConfigSet?.find(a => a.name === "realEstate")
                if (realEstateAgent) {
                  // Update realEstate agent metadata with all the scheduling data
                  if (!realEstateAgent.metadata) realEstateAgent.metadata = {}
                  const metadata = realEstateAgent.metadata as any
                  
                  // Copy all the scheduling data from verification result
                  metadata.customer_name = customerName
                  metadata.property_name = propertyName
                  metadata.selectedDate = selectedDate
                  metadata.selectedTime = selectedTime
                  metadata.phone_number = (result as any).phone_number
                  metadata.is_verified = true
                  metadata.has_scheduled = true
                  metadata.active_project = propertyName
                  metadata.property_id_to_schedule = (result as any).property_id_to_schedule
                  
                  console.log(`[UI] 🎯 Updated realEstate agent metadata:`, metadata)
                  
                                     // Now call completeScheduling with updated metadata
                   if (realEstateAgent.toolLogic?.completeScheduling) {
                     console.log(`[UI] 🎯 Calling completeScheduling tool in background`)
                     const schedulingResult = await realEstateAgent.toolLogic.completeScheduling({}, [])
                     console.log(`[UI] 🎯 CompleteScheduling result:`, schedulingResult)
                     
                     // Send trigger message to make agent say the confirmation message
                     if (schedulingResult?.success && schedulingResult?.message) {
                       console.log(`[UI] 🎯 Sending trigger message to agent:`, schedulingResult.message)
                       setTimeout(() => {
                         if (sessionStatus === "CONNECTED" && dcRef.current) {
                           const triggerMessage = `{Trigger msg: Say "${schedulingResult.message}"}`
                           console.log(`[UI] 🎯 Sending trigger: "${triggerMessage}"`)
                           
                           const triggerMessageId = generateSafeId()
                           sendClientEvent({
                             type: "conversation.item.create",
                             item: {
                               id: triggerMessageId,
                               type: "message",
                               role: "user",
                               content: [{ type: "input_text", text: triggerMessage }],
                             },
                           }, "(booking confirmation trigger)")
                           
                           sendClientEvent({ type: "response.create" }, "(trigger response for booking confirmation)")
                         }
                       }, 1000) // Wait 1 second to ensure UI is ready
                     }
                   }
                }
              } catch (error) {
                console.error("[UI] Error calling completeScheduling:", error)
              }
            }, 500)
            
          } else {
            // Regular verification success flow
            addTranscriptMessage(assistantMessageId, "assistant", "Perfect! You're now verified! 🎉")
            setShowOtpScreen(false)
            setActiveDisplayMode('VERIFICATION_SUCCESS')
            
            // Handle transfer if needed
            if (result.destination_agent) {
              console.log(`[UI] Transferring to: ${result.destination_agent}`)
              // After a brief success display, go to chat mode
              setTimeout(() => {
                setActiveDisplayMode('CHAT')
              }, 2000)
            }
          }
        } else {
          // Error - show error message
          addTranscriptMessage(assistantMessageId, "assistant", result.message || "The code doesn't seem to match. Please double-check and try again.")
          // Stay on OTP form for retry
        }
        
      } catch (error) {
        console.error("[UI] Error calling verifyOTP:", error)
        const errorMessageId = generateSafeId()
        addTranscriptMessage(errorMessageId, "assistant", "An unexpected error occurred during verification. Please try again.")
      }
    },
    [addTranscriptMessage, setShowOtpScreen, setActiveDisplayMode, setBookingDetails, selectedAgentConfigSet, sessionStatus, dcRef, sendClientEvent]
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