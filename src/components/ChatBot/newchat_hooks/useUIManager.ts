import { useState, useEffect, useRef } from "react"
import { AgentMetadata, SessionStatus } from "@/types/types"
import { ActiveDisplayMode, ExtendedAgentMetadata, PropertyProps } from "../newchat_types"

export function useUIManager(
  selectedAgentName: string,
  agentMetadata: AgentMetadata | null,
  setLastAgentTextMessage: (text: string | null) => void,
  setActiveDisplayMode: (mode: ActiveDisplayMode) => void,
  setIsVerifying: (isVerifying: boolean) => void,
  setShowTimeSlots: (show: boolean) => void,
  setShowOtpScreen: (show: boolean) => void,
  setSelectedProperty: (property: PropertyProps | null) => void,
  setAvailableSlots: (slots: Record<string, string[]>) => void,
  setVerificationSuccessful: (successful: boolean) => void,
  setShowVerificationSuccess: (show: boolean) => void,
  canCreateResponse: () => boolean,
  sessionStatus: SessionStatus,
  connectToRealtime: () => void,
  updateSessionMicState: () => void
) {
  const [inputVisible, setInputVisible] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [selectedLanguage, setSelectedLanguage] = useState("English")
  const inputRef = useRef<HTMLInputElement>(null)
  const prevAgentNameRef = useRef<string | null>(null)
  const hasShownSuccessMessageRef = useRef<boolean>(false)
  const pendingQuestionProcessedRef = useRef<boolean>(false)
  const initialSessionSetupDoneRef = useRef<boolean>(false)

  const toggleInput = () => {
    setInputVisible(!inputVisible)
    if (!inputVisible) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 300)
    }
  }

  // Effect to add a `transition` to the `document.body`
  useEffect(() => {
    // Add a transition to the body element for smooth color changes
    document.body.style.transition = "background-color 0.5s ease"
  }, [])

  // Add useEffect to monitor agent changes and display the scheduling UI
  useEffect(() => {
    // Skip effect if there's no real change
    if (prevAgentNameRef.current === selectedAgentName) {
      return
    }

    // Log the newly loaded agent and its current metadata from chat.tsx state
    console.log(
      `🎯 [AGENT ACTIVE] "${selectedAgentName.toUpperCase()}" is now the active agent`
    )
    console.log(`📋 [AGENT METADATA] Current agentMetadata:`, agentMetadata)

    const wasFromAuthentication = prevAgentNameRef.current === "authentication"

    // Clear last agent message when switching agents to avoid confusion
    setLastAgentTextMessage(null)

    if (selectedAgentName === "authentication") {
      console.log(
        `🔐 [AGENT SWITCH] Switched TO authentication agent from: ${
          prevAgentNameRef.current || "initial"
        }`
      )
      setIsVerifying(true) // Show verification UI elements
      setShowTimeSlots(false) // Hide scheduling UI
      // Explicitly set VERIFICATION_FORM display mode when switching to authentication
      setActiveDisplayMode("VERIFICATION_FORM")
      console.log(
        `🖥️ [UI MODE] Setting VERIFICATION_FORM display mode for authentication agent`
      )

      // Reset success message flag when entering authentication again
      hasShownSuccessMessageRef.current = false
    } else if (selectedAgentName === "scheduleMeeting") {
      console.log(
        `📅 [AGENT SWITCH] Switched TO scheduleMeeting agent from: ${
          prevAgentNameRef.current || "initial"
        }`
      )
      setIsVerifying(false) // Hide verification UI if switching *to* scheduling
      setShowOtpScreen(false) // Hide OTP screen when switching away from authentication

      // CRITICAL FIX: Ensure the UI is set up immediately when switching to scheduling agent
      console.log(
        "[Agent Change] Setting SCHEDULING_FORM display mode for scheduleMeeting agent"
      )
      setActiveDisplayMode("SCHEDULING_FORM")

      // Check if we need to set up a property for scheduling
      const metadata = agentMetadata as any
      // Use property_id_to_schedule if available
      if (metadata?.property_id_to_schedule) {
        const propertyName = metadata.property_name || "Selected Property"
        console.log(
          `[Agent Change] Creating property with ID: ${metadata.property_id_to_schedule}, name: ${propertyName}`
        )

        setSelectedProperty({
          id: metadata.property_id_to_schedule,
          name: propertyName,
          // Add more data to make it look complete
          price: "Contact for pricing",
          area: "Available on request",
          description: `Schedule a visit to see ${propertyName} in person.`,
          mainImage: "/placeholder.svg", // Use a default image
        })
      }

      // Always enable time slots when switching to scheduling agent
      setShowTimeSlots(true)
    } else if (selectedAgentName === "realEstate") {
      console.log(
        `🏠 [AGENT SWITCH] Switched TO realEstate agent from: ${
          prevAgentNameRef.current || "initial"
        }`
      )

      // Check if this is a transition from authentication agent AND we haven't shown the success message yet
      if (wasFromAuthentication && !hasShownSuccessMessageRef.current) {
        console.log(
          `✅ [AUTH SUCCESS] Transition from authentication to realEstate - showing verification success UI`
        )

        // Mark that we've shown the success message to prevent infinite loops
        hasShownSuccessMessageRef.current = true

        // Set success flag and UI state for verification success display
        // The actual spoken confirmation will come from the realEstateAgent via the trigger from useHandleServerEvent
        setVerificationSuccessful(true)
        setShowVerificationSuccess(true) // This can be used if there's a separate UI element for it

        // Hide the success message UI after a few seconds (this is for the separate UI element if any)
        setTimeout(() => {
          setShowVerificationSuccess(false)
        }, 5000)
      }

      setIsVerifying(false) // Hide verification UI
      setShowOtpScreen(false) // Hide OTP screen
      setShowTimeSlots(false) // Hide scheduling UI
      setAvailableSlots({})
    }

    // Update previous agent ref for next transition
    prevAgentNameRef.current = selectedAgentName
  }, [
    selectedAgentName,
    agentMetadata,
    canCreateResponse,
    setActiveDisplayMode,
    setLastAgentTextMessage,
    setIsVerifying,
    setShowTimeSlots,
    setShowOtpScreen,
    setSelectedProperty,
    setAvailableSlots,
    setVerificationSuccessful,
    setShowVerificationSuccess,
  ])

  const handleLanguageSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedLanguage(e.target.value)
  }

  const handleProceed = () => {
    setShowIntro(false)

    // Connect to realtime service if not already connected
    if (sessionStatus === "DISCONNECTED") {
      connectToRealtime()
    }
  }

  // Effect to update session when language changes (for live language switching)
  useEffect(() => {
    if (sessionStatus === "CONNECTED" && !showIntro) {
      console.log(
        `[Language Change] Language changed to: ${selectedLanguage}, updating session`
      )
      // This will be handled by the main component's effect that calls updateSession
    }
  }, [selectedLanguage, sessionStatus, showIntro])

  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  // Use useEffect to update session when micMuted changes to avoid closure issues
  useEffect(() => {
    if (sessionStatus === "CONNECTED" && initialSessionSetupDoneRef.current) {
      console.log(
        `[Audio] Mic state changed to ${
          micMuted ? "muted" : "unmuted"
        }, updating session`
      )
      updateSessionMicState() // Use the new function that doesn't cause recursion
    }
  }, [micMuted, sessionStatus, updateSessionMicState])

  // Add effect to initialize audio context once connected
  useEffect(() => {
    if (sessionStatus === "CONNECTED" && !audioContext) {
      try {
        // Create audio context when needed
        const newAudioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)()
        setAudioContext(newAudioContext)
        console.log("[Audio] Audio context initialized")
      } catch (e) {
        console.error("[Audio] Error initializing audio context:", e)
      }
    }
  }, [sessionStatus, audioContext])

  return {
    inputVisible,
    setInputVisible,
    micMuted,
    setMicMuted,
    showIntro,
    setShowIntro,
    selectedLanguage,
    setSelectedLanguage,
    inputRef,
    toggleInput,
    handleLanguageSelect,
    handleProceed,
    audioContext,
    setAudioContext,
    prevAgentNameRef,
    hasShownSuccessMessageRef,
    pendingQuestionProcessedRef,
    initialSessionSetupDoneRef,
  }
} 