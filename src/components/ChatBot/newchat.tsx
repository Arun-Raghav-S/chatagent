"use client"

import React, { useState, useEffect, useRef, useCallback, startTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  MessageSquare,
  X,
  Mic,
  MicOff,
  Phone,
  Send,
  PhoneOff,
  Loader,
  ArrowLeft,
  CheckCircle,
} from "lucide-react"

// UI Components
import PropertyList from "../PropertyComponents/PropertyList"
import PropertyDetails from "../PropertyComponents/propertyDetails"
import { VoiceWaveform } from "./VoiceWaveForm"
import PropertyImageGallery from "../PropertyComponents/PropertyImageGallery"
import LocationMap from "../PropertyComponents/LocationMap"
import BrochureViewer from "../PropertyComponents/brochureViewer"

// --- Appointment UI Components ---
import TimePick from "../Appointment/timePick"
import VerificationForm from "../Appointment/VerificationForm"
import OTPInput from "../Appointment/otp"
import BookingDetailsCard from "../Appointment/BookingDetailsCard"

// Agent Logic Imports
import { SessionStatus, AgentConfig, AgentMetadata, ServerEvent } from "@/types/types"
import { allAgentSets, defaultAgentSetKey } from "@/agentConfigs"

// Import hooks
import { useTranscript } from "./newchat_hooks/useTranscript"
import { useChatHistory } from "./newchat_hooks/useChatHistory"
import { useConnection } from "./newchat_hooks/useConnection"
import { useSession } from "./newchat_hooks/useSession"
import { usePropertyData } from "./newchat_hooks/usePropertyData"
import { useServerEvents } from "./newchat_hooks/useServerEvents"
import { useChatHandlers } from "./newchat_hooks/useChatHandlers"
import { generateSafeId } from "./newchat_utils"

// Import types
import {
  RealEstateAgentProps,
  PropertyProps,
  ActiveDisplayMode,
  ExtendedAgentMetadata,
} from "./newchat_types"

// Initialize cache utilities in development
if (process.env.NODE_ENV === 'development') {
  import('../../agentConfigs/realEstate/tools/cacheUtils').then(() => {
    console.log('🔧 Property cache utilities loaded for development');
  });
}

// --- OPTIMIZED ANIMATION CONFIGURATIONS ---
const FAST_SPRING = { type: "spring", stiffness: 500, damping: 35 }
const FAST_TRANSITION = { duration: 0.15, ease: "easeOut" }
const INSTANT_TRANSITION = { duration: 0.08, ease: "easeOut" }

// Optimized animation variants for better performance
const inputAnimationVariants = {
  hidden: { y: 60, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: FAST_TRANSITION
  },
  exit: { 
    y: 60, 
    opacity: 0,
    transition: INSTANT_TRANSITION
  }
}

const uiTransitionVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: INSTANT_TRANSITION
  },
  exit: { 
    opacity: 0, 
    scale: 0.98,
    transition: INSTANT_TRANSITION
  }
}

// Debounce utility for preventing multiple rapid clicks
const useDebounce = (callback: (...args: unknown[]) => void, delay: number) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  return useCallback((...args: unknown[]) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => callback(...args), delay)
  }, [callback, delay])
}

// Helper function to determine if a message should be hidden from UI (pending questions, UI-generated messages, etc.)
const shouldHideFromUI = (text: string, agentName?: string): boolean => {
  if (!text) return false;
  
  // Hide UI-generated messages (form submissions, etc.)
  const isUIGenerated = (
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
    
    // Hide scheduling agent trigger message
    text === "Hello, I need help with booking a visit. Please show me available dates."
  );
  
  // Hide pending questions that are being replayed after authentication
  // These are questions that were asked before authentication and are now being sent to the agent
  const isPendingQuestion = agentName === 'realEstate' && (
    text.toLowerCase().includes('show me') ||
    text.toLowerCase().includes('what is') ||
    text.toLowerCase().includes('tell me') ||
    text.toLowerCase().includes('location') ||
    text.toLowerCase().includes('price') ||
    text.toLowerCase().includes('details')
  );
  
  return isUIGenerated || isPendingQuestion;
};

export default function RealEstateAgent({ chatbotConfig }: RealEstateAgentProps) {
  // --- Chatbot Configuration ---
  const chatbotId = chatbotConfig.id;
  const chatbotName = chatbotConfig.chatbot_name || "Real Estate AI Agent";
  const bgColor = chatbotConfig.bg_color || "#1e3a8a"; // Default blue-900
  const textColor = chatbotConfig.text_color || "#ffffff"; // Default white
  const logoUrl = chatbotConfig.logo;
  
  // --- State Declarations ---
  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED")
  const [selectedAgentConfigSet] = useState<
    AgentConfig[] | null
  >(allAgentSets[defaultAgentSetKey] || null)
  const [selectedAgentName, setSelectedAgentName] = useState<string>(
    selectedAgentConfigSet?.[0]?.name || ""
  )
  const [agentMetadata, setAgentMetadata] = useState<AgentMetadata | null>(null)
  const [activeDisplayMode, setActiveDisplayMode] =
    useState<ActiveDisplayMode>("CHAT")
  const [selectedProperty, setSelectedProperty] =
    useState<PropertyProps | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>("Monday")
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [showTimeSlots, setShowTimeSlots] = useState<boolean>(false)
  const [availableSlots, setAvailableSlots] = useState<Record<string, string[]>>(
    {}
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showVerificationScreen, setShowVerificationScreen] =
    useState<boolean>(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showOtpScreen, setShowOtpScreen] = useState<boolean>(false)
  const [verificationData, setVerificationData] = useState<{
    name: string
    phone: string
    date: string
    time: string
  }>({ name: "", phone: "", date: "", time: "" })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [verificationSuccessful, setVerificationSuccessful] =
    useState<boolean>(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showVerificationSuccess, setShowVerificationSuccess] =
    useState<boolean>(false)
  const [isVerifying, setIsVerifying] = useState<boolean>(false)
  const [startTime, setStartTime] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [appointment, setAppointment] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false)
  const [inputValue, setInputValue] = useState("")
  const [inputVisible, setInputVisible] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [selectedLanguage, setSelectedLanguage] = useState("English")
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  // Force a fresh subtree mount on reset to avoid DOM placement conflicts
  const [contentKey, setContentKey] = useState(0)
  
  // User guidance states
  const [showUserHints, setShowUserHints] = useState(false)
  const [hasShownInitialHints, setHasShownInitialHints] = useState(false)
  const [hintsDismissed, setHintsDismissed] = useState(false)

  // --- Refs ---
  const inputRef = useRef<HTMLInputElement>(null)
  const prevAgentNameRef = useRef<string | null>(null)
  const initialSessionSetupDoneRef = useRef<boolean>(false)
  const handleServerEventRef = useRef<(event: ServerEvent) => void>(() => {})
  const hasShownSuccessMessageRef = useRef<boolean>(false)
  const hasEverSentInitialHiRef = useRef<boolean>(false)

  // --- Custom Hooks (Ordered to resolve dependencies) ---

  const {
    transcriptItems,
    setTranscriptItems,
    lastAgentTextMessage,
    setLastAgentTextMessage,
    addTranscriptMessage,
    updateTranscriptMessage,
    updateTranscriptItemStatus,
    transcriptEndRef,
  } = useTranscript(selectedAgentName)

  const {
    dcRef,
    audioElementRef,
    connectToRealtime,
    disconnectFromRealtime,
  } = useConnection(
    sessionStatus,
    setSessionStatus,
    addTranscriptMessage,
    (e) => handleServerEventRef.current(e),
    setAgentMetadata,
    initialSessionSetupDoneRef
  )

  const sendClientEvent = useCallback(
    (eventObj: Record<string, unknown>, eventNameSuffix = "") => {
      if (dcRef.current && dcRef.current.readyState === "open") {
        dcRef.current.send(JSON.stringify(eventObj))
      } else {
        console.error(
          `[Send Event Error] Data channel not open. Attempted to send: ${(eventObj as { type?: string }).type} ${eventNameSuffix}`,
          eventObj
        )
        addTranscriptMessage(
          generateSafeId(),
          "system",
          `Error: Could not send message. Connection lost.`
        )
      }
    },
    [dcRef, addTranscriptMessage]
  )

    const {
    propertyListData,
    setPropertyListData,
    selectedPropertyDetails,
    setSelectedPropertyDetails,
    isLoadingProperties,
    setIsLoadingProperties,
    propertyGalleryData,
    setPropertyGalleryData,
    locationMapData,
    setLocationMapData,
    brochureData,
    setBrochureData,
    handlePropertySelect,
    handleClosePropertyDetails,
    handleBackFromPropertyDetails,
    handleGetAllProperties,
    handleCloseGallery,
    handleCloseLocationMap,
    handleCloseBrochure,
  } = usePropertyData(
    selectedAgentConfigSet,
    agentMetadata,
    addTranscriptMessage,
    setActiveDisplayMode,
    (text: string) => sendTriggerMessage(text),
    sessionStatus,
    transcriptItems,
    initialSessionSetupDoneRef,
    selectedAgentName
  )

  const { handleServerEvent, canCreateResponse, bookingDetails, setBookingDetails } =
    useServerEvents(
      setSessionStatus,
      selectedAgentName,
      setSelectedAgentName,
      selectedAgentConfigSet,
      sendClientEvent,
      agentMetadata,
      setAgentMetadata,
      transcriptItems,
      addTranscriptMessage,
      updateTranscriptMessage,
      updateTranscriptItemStatus,
      setActiveDisplayMode,
      setPropertyListData,
      setSelectedPropertyDetails,
      setPropertyGalleryData,
      setLocationMapData,
      setBrochureData,
      isLoadingProperties,
      setIsLoadingProperties,
      setLastAgentTextMessage,
      propertyListData,
      activeDisplayMode,
      selectedProperty,
      setSelectedProperty,
      showTimeSlots,
      setShowTimeSlots,
      setAvailableSlots,
      setShowVerificationScreen,
      selectedTime,
      selectedDay,
      prevAgentNameRef,
      setMicMuted
    )

  useEffect(() => {
    handleServerEventRef.current = handleServerEvent
  }, [handleServerEvent])

  const {
    handleSend,
    handleScheduleVisitRequest,
    handleTimeSlotSelection,
    handleVerificationSubmit,
    handleOtpSubmit,
    handleKeyDown,
    handleCallButtonClick,
    toggleMic,
    sendTriggerMessage,
    sendSimulatedUserMessage,
  } = useChatHandlers({
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
  })

  const { fetchOrgMetadata, updateSession, updateSessionMicState } = useSession(
    sessionStatus,
    selectedAgentName,
    selectedAgentConfigSet,
    agentMetadata,
    setAgentMetadata,
    chatbotId,
    sendClientEvent,
    selectedLanguage,
    setActiveDisplayMode,
    addTranscriptMessage,
    transcriptItems,
    micMuted,
    sendSimulatedUserMessage
  )

  useChatHistory(
    transcriptItems,
    agentMetadata,
    verificationData,
    startTime,
    sessionStatus
  )

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && !startTime) {
      setStartTime(new Date().toISOString())
    }
  }, [sessionStatus, startTime])

  // Show user hints after agent responds
  useEffect(() => {
    if (
      lastAgentTextMessage && 
      sessionStatus === 'CONNECTED' && 
      activeDisplayMode === 'CHAT' && 
      !hasShownInitialHints && 
      !hintsDismissed &&
      transcriptItems.some(item => item.role === 'assistant' && item.text)
    ) {
      const timer = setTimeout(() => {
        setShowUserHints(true)
        setHasShownInitialHints(true)
      }, 2000) // Show hints 2 seconds after agent responds
      
      return () => clearTimeout(timer)
    }
  }, [lastAgentTextMessage, sessionStatus, activeDisplayMode, hasShownInitialHints, hintsDismissed, transcriptItems])
  
  // Hide hints after 8 seconds or on interaction
  useEffect(() => {
    if (showUserHints) {
      const timer = setTimeout(() => {
        setShowUserHints(false)
      }, 8000)
      
      return () => clearTimeout(timer)
    }
  }, [showUserHints])

  // --- PERFORMANCE OPTIMIZATIONS ---
  
  // Simple click handlers with debouncing
  const toggleInput = () => {
    setInputVisible(!inputVisible)
    if (!inputVisible) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
    // Hide hints when user interacts
    if (showUserHints) {
      setShowUserHints(false)
      setHintsDismissed(true)
    }
  }

  // Modified mic toggle to hide hints on interaction
  const handleMicToggle = () => {
    if (showUserHints) {
      setShowUserHints(false)
      setHintsDismissed(true)
    }
    toggleMic()
  }

  // Debounced handlers to prevent multiple rapid clicks
  const debouncedToggleInput = useDebounce(toggleInput, 150)
  const debouncedHandleCallButtonClick = useDebounce(() => handleCallButtonClick(), 200)
  const debouncedToggleMic = useDebounce(handleMicToggle, 100)

  // Batch state updates for better performance
  const batchUIStateUpdate = useCallback((updates: () => void) => {
    startTransition(() => {
      updates()
    })
  }, [])

  // Optimized language selection handler
  const handleLanguageSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    batchUIStateUpdate(() => {
      setSelectedLanguage(e.target.value)
    })
  }, [batchUIStateUpdate])

  // Optimized proceed handler
  const handleProceed = useCallback(() => {
    batchUIStateUpdate(() => {
      setShowIntro(false)
    })
    if (sessionStatus === "DISCONNECTED") {
      connectToRealtime()
    }
  }, [sessionStatus, connectToRealtime, batchUIStateUpdate])
  
  useEffect(() => {
    if (sessionStatus === "CONNECTED" && !showIntro) {
      updateSession(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage, sessionStatus, showIntro]);

  // Reset to language selection screen when call disconnects
  useEffect(() => {
    if (sessionStatus === "DISCONNECTED" && !showIntro && !isResetting) {
      console.log("🔄 [DISCONNECT] Call disconnected, resetting to language selection screen");
      
      // Step 1: Enter resetting state to prevent animation conflicts
      setIsResetting(true);
      
      // Step 2: After a delay, reset all states
      setTimeout(() => {
        batchUIStateUpdate(() => {
          // Reset all UI states
          setActiveDisplayMode("CHAT");
          setSelectedProperty(null);
          setShowTimeSlots(false);
          setIsVerifying(false);
          setShowOtpScreen(false);
          setShowVerificationScreen(false);
          setVerificationSuccessful(false);
          setShowVerificationSuccess(false);
          setAppointment(false);
          setIsConfirmed(false);
          setSelectedTime(null);
          setSelectedDay("Monday");
          setInputValue("");
          setInputVisible(false);
          // Clear data states
          setPropertyListData(null);
          setSelectedPropertyDetails(null);
          setPropertyGalleryData(null);
          setLocationMapData(null);
          setBrochureData(null);
          setBookingDetails(null);
          // Clear transcript items to avoid leftover animation nodes
          setTranscriptItems([]);
          setLastAgentTextMessage(null);
          hasEverSentInitialHiRef.current = false;
        });
        
        // Step 3: Show intro screen after states are cleared
        setTimeout(() => {
          setShowIntro(true);
          setIsResetting(false);
          // Force remount of UI subtree
          setContentKey(prev => prev + 1);
        }, 100);
      }, 200);
    }
  }, [sessionStatus, showIntro, isResetting, batchUIStateUpdate]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && initialSessionSetupDoneRef.current) {
      updateSessionMicState()
    }
  }, [micMuted, sessionStatus, updateSessionMicState])

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && !audioContext) {
      try {
        const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        const newAudioContext = new (AudioContextClass || AudioContext)()
        setAudioContext(newAudioContext)
      } catch (e) {
        console.error("[Audio] Error initializing audio context:", e)
      }
    }
  }, [sessionStatus, audioContext])

  useEffect(() => {
    if (chatbotId && !agentMetadata) {
      setAgentMetadata({
        chatbot_id: chatbotId,
        session_id: generateSafeId(),
      })
    }
  }, [chatbotId, agentMetadata])

  useEffect(() => {
    if (sessionStatus === 'CONNECTED' && selectedAgentConfigSet && agentMetadata) {
      if (!initialSessionSetupDoneRef.current) {
        initialSessionSetupDoneRef.current = true;
  
        fetchOrgMetadata().then(() => {
          if (sessionStatus === 'CONNECTED') {
            const agentAutoTriggersFirstAction =
              selectedAgentName === 'scheduleMeeting' ||
              selectedAgentName === 'authentication';
  
            const isReturningToRealEstateAfterVerification =
              selectedAgentName === 'realEstate' &&
              (agentMetadata as ExtendedAgentMetadata)?.flow_context === 'from_scheduling_verification';
  
            const isReturningToRealEstateAfterQuestionAuth =
              selectedAgentName === 'realEstate' &&
              (agentMetadata as ExtendedAgentMetadata)?.flow_context === 'from_question_auth';
  
            const isInitialAgentLoad = !(agentMetadata as ExtendedAgentMetadata)?.flow_context;
  
                      const shouldSendSimulatedHi = !agentAutoTriggersFirstAction &&
            !isReturningToRealEstateAfterVerification &&
            !isReturningToRealEstateAfterQuestionAuth &&
            isInitialAgentLoad &&
            !hasEverSentInitialHiRef.current;
  
            const shouldSendPendingQuestion = isReturningToRealEstateAfterQuestionAuth;
            
            // 🚨 CRITICAL: For scheduleMeeting agent, we need to trigger getAvailableSlots
            const shouldTriggerSchedulingAgent = selectedAgentName === 'scheduleMeeting';
  
            if (shouldSendPendingQuestion) {
              const pendingQuestion = (agentMetadata as ExtendedAgentMetadata).pending_question;
              updateSession(false);
              setTimeout(() => {
                if (pendingQuestion) {
                  console.log(`🔍 [PENDING QUESTION] Sending pending question: "${pendingQuestion}"`);
                  // Note: The filtering logic is handled in useHandleServerEvent.ts 
                  // The pending question will be filtered from the UI but processed by the agent
                  sendSimulatedUserMessage(pendingQuestion);
                }
                setAgentMetadata(prev => ({
                  ...prev,
                  flow_context: undefined,
                  pending_question: undefined
                } as ExtendedAgentMetadata));
              }, 500);
            } else if (shouldTriggerSchedulingAgent) {
              console.log(`📅 [SCHEDULING TRIGGER] Scheduling agent activated - sending greeting trigger`);
              updateSession(false);
              setTimeout(() => {
                // Send a trigger message to make the scheduling agent say the greeting
                sendSimulatedUserMessage("Hello");
              }, 500);
            } else {
              updateSession(shouldSendSimulatedHi);
              // Mark that we've sent the initial hi message if we did
              if (shouldSendSimulatedHi) {
                hasEverSentInitialHiRef.current = true;
              }
            }
  
            setTimeout(() => {
              updateSessionMicState();
            }, 500);
          }
        });
      }
    }
  }, [sessionStatus, selectedAgentName, agentMetadata, selectedAgentConfigSet, fetchOrgMetadata, updateSession, updateSessionMicState, activeDisplayMode]);

  useEffect(() => {
    // Only run on actual agent change
    if (selectedAgentName === prevAgentNameRef.current) {
      return
    }

    // On change, reset the setup flag (if it's not the initial agent)
    if (prevAgentNameRef.current !== null) {
      initialSessionSetupDoneRef.current = false
    }

    // --- Agent switching UI logic ---
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
      setActiveDisplayMode("VERIFICATION_FORM")
      console.log(
        `🖥️ [UI MODE] Setting VERIFICATION_FORM display mode for authentication agent`
      )
      hasShownSuccessMessageRef.current = false
      
      // Re-enable mic for authentication agent after UI transition
      setTimeout(() => {
        console.log(`🚨🚨🚨 [MIC CONTROL] Re-enabling mic for authentication agent`)
        setMicMuted(false)
      }, 700) // Small delay to ensure UI has switched
    } else if (selectedAgentName === "scheduleMeeting") {
      console.log(
        `📅 [AGENT SWITCH] Switched TO scheduleMeeting agent from: ${
          prevAgentNameRef.current || "initial"
        }`
      )
      setIsVerifying(false)
      setShowOtpScreen(false)
      setActiveDisplayMode("SCHEDULING_FORM")
      if (!selectedProperty) {
        const metadata = agentMetadata as ExtendedAgentMetadata
        if (metadata?.property_id_to_schedule) {
          const propertyName = metadata.property_name || "Selected Property"
          setSelectedProperty({
            id: metadata.property_id_to_schedule,
            name: propertyName,
            price: "Contact for pricing",
            area: "Available on request",
            description: `Schedule a visit to see ${propertyName} in person.`,
            mainImage: "/placeholder.svg",
          })
        }
      }
      setShowTimeSlots(true)
      
      // 🔥 MANUAL CALL: Call getAvailableSlots directly instead of relying on agent
      const manuallyCallGetAvailableSlots = async () => {
        try {
          console.log("📅 [MANUAL SLOTS] Calling getAvailableSlots manually when scheduling UI loads")
          
          // Import the function
          const { getAvailableSlots } = await import("@/agentConfigs/realEstate/scheduleTools")
          
          // Get the scheduling agent
          const schedulingAgent = selectedAgentConfigSet?.find(a => a.name === "scheduleMeeting")
          if (!schedulingAgent) {
            console.error("[MANUAL SLOTS] No scheduling agent found")
            return
          }
          
          // Set the metadata
          schedulingAgent.metadata = agentMetadata || undefined
          
          // Call getAvailableSlots
          const result = await getAvailableSlots({ property_id: "" }, schedulingAgent)
          
          console.log("📅 [MANUAL SLOTS] getAvailableSlots result:", result)
          
          // Set the slots in UI
          if (result.slots) {
            setAvailableSlots(result.slots)
            console.log("📅 [MANUAL SLOTS] Set available slots:", Object.keys(result.slots).length, "dates")
          }
          
          // Show the greeting message
          if (result.message) {
            setLastAgentTextMessage(result.message)
            console.log("📅 [MANUAL SLOTS] Set greeting message:", result.message.substring(0, 50) + "...")
          }
          
          // Ensure property is set
          if (result.property_name && !selectedProperty) {
            setSelectedProperty({
              id: result.property_id || "default-property",
              name: result.property_name,
              price: "Contact for pricing", 
              area: "Available on request",
              description: `Schedule a visit to see ${result.property_name} in person.`,
              mainImage: "/placeholder.svg",
            })
          }
          
        } catch (error) {
          console.error("📅 [MANUAL SLOTS] Error calling getAvailableSlots:", error)
          
          // Fallback slots
          const fallbackSlots: Record<string, string[]> = {}
          const today = new Date()
          for (let i = 1; i <= 5; i++) {
            const date = new Date(today)
            date.setDate(today.getDate() + i)
            if (date.getDay() >= 1 && date.getDay() <= 5) { // Weekdays only
              const dateStr = date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric',
                year: 'numeric'
              })
              fallbackSlots[dateStr] = ["11:00 AM", "4:00 PM"]
            }
          }
          setAvailableSlots(fallbackSlots)
          console.log("📅 [MANUAL SLOTS] Set fallback slots")
        }
      }
      
      // Call it after a short delay to ensure UI is ready
      setTimeout(manuallyCallGetAvailableSlots, 100)
    } else if (selectedAgentName === "realEstate") {
      console.log(
        `🏠 [AGENT SWITCH] Switched TO realEstate agent from: ${
          prevAgentNameRef.current || "initial"
        }`
      )
      if (wasFromAuthentication && !hasShownSuccessMessageRef.current) {
        console.log(
          `✅ [AUTH SUCCESS] Transition from authentication to realEstate - showing verification success UI`
        )
        hasShownSuccessMessageRef.current = true
        setVerificationSuccessful(true)
        setShowVerificationSuccess(true)
        setTimeout(() => {
          setShowVerificationSuccess(false)
        }, 5000)
      }
      setIsVerifying(false)
      setShowOtpScreen(false)
      setShowTimeSlots(false)
      setAvailableSlots({})
    }
    // Update the ref at the end
    prevAgentNameRef.current = selectedAgentName
  }, [
    selectedAgentName,
    selectedProperty,
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

  useEffect(() => {
    const shouldAutoLoadProperties = false
    if (
      sessionStatus === "CONNECTED" &&
      agentMetadata?.project_ids &&
      agentMetadata.project_ids.length > 0 &&
      !propertyListData &&
      !selectedPropertyDetails &&
      initialSessionSetupDoneRef.current &&
      shouldAutoLoadProperties
    ) {
      const timer = setTimeout(() => {
        handleGetAllProperties()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [
    sessionStatus,
    agentMetadata?.project_ids,
    propertyListData,
    selectedPropertyDetails,
    handleGetAllProperties,
  ])

  useEffect(() => {
    return () => {
      disconnectFromRealtime()
      if (audioElementRef.current) {
        audioElementRef.current.srcObject = null
      }
    }
  }, [disconnectFromRealtime, audioElementRef])

  // Optimized scrolling effect
  useEffect(() => {
    if (!selectedPropertyDetails) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        transcriptEndRef.current?.scrollIntoView({ 
          behavior: "smooth",
          block: "end"
        })
      })
    }
  }, [transcriptItems, lastAgentTextMessage, propertyListData, selectedPropertyDetails])

  const languageOptions = [
    "English", "Hindi", "Tamil", "Telugu", "Malayalam", "Spanish", "French",
    "German", "Chinese", "Japanese", "Arabic", "Russian"
  ]



  // Scheduling navigation handlers
  const handleSchedulingBack = () => {
    console.log("[UI] Back from scheduling form")
    // Go back to previous screen - could be property details or chat
    if (selectedPropertyDetails) {
      // Switch back to real estate agent and show property details
      setSelectedAgentName("realEstate")
      setActiveDisplayMode("PROPERTY_DETAILS")
    } else {
      // No property details, go back to chat
      setSelectedAgentName("realEstate")
      setActiveDisplayMode("CHAT")
    }
  }

  const handleSchedulingClose = () => {
    console.log("[UI] Close scheduling form")
    // Always go back to real estate agent and chat
    setSelectedAgentName("realEstate")
    setActiveDisplayMode("CHAT")
  }

  // Authentication navigation handlers
  const handleOtpBack = () => {
    console.log("[UI] Back from OTP to verification form")
    setActiveDisplayMode("VERIFICATION_FORM")
  }

  const handleBookingConfirmationClose = () => {
    console.log("[UI] Closing booking confirmation")
    setActiveDisplayMode("CHAT")
    setBookingDetails(null)
  }

  // Early escape UI during reset to avoid rendering heavy tree
  if (isResetting) {
    return (
      <div 
        className="relative rounded-3xl overflow-hidden flex flex-col" 
        style={{ 
          width: '329px', 
          height: '611px',
          backgroundColor: bgColor,
          color: textColor
        }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: textColor }} />
            <p style={{ color: `${textColor}cc` }}>Resetting...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-3xl overflow-hidden flex flex-col"
      style={{ 
        width: "329px", 
        height: "611px",
        backgroundColor: bgColor,
        color: textColor 
      }}
    >
              <motion.div 
        className="flex items-center p-4 border-b flex-shrink-0"
        style={{ borderBottomColor: `${textColor}20` }}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={INSTANT_TRANSITION}
      >
        <div className="flex items-center">
          <div className="bg-white rounded-full p-1 mr-2">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt="Chatbot Logo" 
                className="w-8 h-8 rounded-full object-cover"
                onError={(e) => {
                  // Fallback to default SVG if logo fails to load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`text-blue-800 w-8 h-8 flex items-center justify-center ${logoUrl ? 'hidden' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42" fill="none">
                <circle cx="21" cy="21" r="21" fill="white" />
                <path d="M15.9833 12.687L11 16.2194V30.1284H15.9833V12.687Z" fill="#2563EB" />
                <rect width="9.58318" height="4.98325" transform="matrix(-1 0 0 1 31.3162 25.1455)" fill="#2563EB" />
                <rect width="4.79159" height="7.85821" transform="matrix(-1 0 0 1 31.3162 17.2871)" fill="#2563EB" />
                <path d="M20.4589 9.45097L16.3664 12.0161L28.2862 21.0735L31.3162 17.2868L20.4589 9.45097Z" fill="#2563EB" />
                <g filter="url(#filter0_i_3978_26224)">
                  <path d="M15.9833 12.687L16.7499 13.262V29.5534L15.9833 30.1284V12.687Z" fill="#6193FF" />
                </g>
                <g filter="url(#filter1_i_3978_26224)">
                  <path d="M16.2157 12.7009L16.3665 12.0161L26.5735 19.773L25.8041 20.0584L16.2157 12.7009Z" fill="#3B71E6" />
                </g>
                <g filter="url(#filter2_i_3978_26224)">
                  <path d="M25.7582 19.9701L26.5248 19.6826V25.145H25.7582V19.9701Z" fill="#3B71E6" />
                </g>
                <g filter="url(#filter3_i_3978_26224)">
                  <path d="M21.7331 25.1455L20.9665 24.3789H25.7581L26.5247 25.1455H21.7331Z" fill="#3B71E6" />
                </g>
                <g filter="url(#filter4_i_3978_26224)">
                  <path d="M20.9665 24.3779L21.7331 25.1446V30.1278L20.9665 29.5528V24.3779Z" fill="#6193FF" />
                </g>
                <path d="M25.7582 24.3779L26.5248 25.1446" stroke="#4B83FC" strokeWidth="0.0134678" strokeLinecap="round" />
                <path d="M25.7582 19.9701L26.5248 19.6826" stroke="#4B83FC" strokeWidth="0.0134678" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <span className="font-medium" style={{ color: textColor }}>{chatbotName}</span>
        </div>
        {/* <button className="ml-auto p-2 hover:bg-blue-800 rounded-full transition-colors duration-100">
          <X size={20} />
        </button> */}
      </motion.div>
      {/* Keyed wrapper to force complete remount on reset */}
      <React.Fragment key={contentKey}>
      {isResetting ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-white/80">Resetting...</p>
          </div>
        </div>
      ) : showIntro ? (
        <AnimatePresence mode="wait">
          <motion.div 
            key="intro"
            className="flex flex-col h-full items-center justify-center p-6 text-center"
            variants={uiTransitionVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.h2 
              className="text-2xl font-medium mb-6"
              style={{ color: textColor }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...INSTANT_TRANSITION, delay: 0.05 }}
            >
              Hey there, Please select a language
            </motion.h2>
            
            <motion.div 
              className="relative w-full mb-8"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...INSTANT_TRANSITION, delay: 0.1 }}
            >
              <select
                value={selectedLanguage}
                onChange={handleLanguageSelect}
                className="appearance-none bg-transparent py-2 pr-10 border-b-2 w-full text-center text-xl font-medium focus:outline-none transition-all duration-100"
                style={{ 
                  borderBottomColor: textColor,
                  color: textColor 
                }}
              >
                {languageOptions.map(lang => (
                  <option 
                    key={lang} 
                    value={lang} 
                    style={{ 
                      backgroundColor: bgColor,
                      color: textColor 
                    }}
                  >
                    {lang}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2" style={{ color: textColor }}>
                <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </motion.div>
            
            <motion.p 
              className="text-xl mb-8"
              style={{ color: textColor }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...INSTANT_TRANSITION, delay: 0.15 }}
            >
              to continue.
            </motion.p>
            
            <motion.button 
              onClick={handleProceed}
              className="px-6 py-2 rounded-md font-medium transition-all duration-100 active:scale-95"
              style={{
                backgroundColor: textColor,
                color: bgColor
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...INSTANT_TRANSITION, delay: 0.2 }}
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.02 }}
            >
              Let&apos;s go
            </motion.button>
          </motion.div>
        </AnimatePresence>
      ) : (
        <>
          {sessionStatus === 'CONNECTED' && (activeDisplayMode === 'CHAT' || activeDisplayMode === 'IMAGE_GALLERY') && (
            <motion.div 
              className="border-1 h-10 rounded-3xl w-72 p-4 justify-evenly ml-5 my-2 flex-shrink-0"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={INSTANT_TRANSITION}
            >
              <VoiceWaveform
                mediaStream={audioElementRef.current?.srcObject as MediaStream}
                active={sessionStatus === 'CONNECTED' && !!audioElementRef.current?.srcObject}
              />
            </motion.div>
          )}
          <AnimatePresence mode="wait">
            {activeDisplayMode === 'IMAGE_GALLERY' && (
              <motion.button
                key="gallery-back"
                onClick={handleCloseGallery}
                className="mb-2 ml-4 self-start font-medium py-2 px-4 rounded-lg flex items-center shadow transition-all duration-100 active:scale-95"
                style={{
                  backgroundColor: `${textColor}30`,
                  color: textColor
                }}
                variants={uiTransitionVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft size={16} className="mr-2" />
                Back
              </motion.button>
            )}
            
            {activeDisplayMode === 'LOCATION_MAP' && (
              <motion.button
                key="map-back"
                onClick={handleCloseLocationMap}
                className="mb-2 ml-4 self-start font-medium py-2 px-4 rounded-lg flex items-center shadow transition-all duration-100 active:scale-95"
                style={{
                  backgroundColor: `${textColor}30`,
                  color: textColor
                }}
                variants={uiTransitionVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft size={16} className="mr-2" />
                Back
              </motion.button>
            )}
            
            {activeDisplayMode === 'BROCHURE_VIEWER' && (
              <motion.button
                key="brochure-back"
                onClick={handleCloseBrochure}
                className="mb-2 ml-4 self-start font-medium py-2 px-4 rounded-lg flex items-center shadow transition-all duration-100 active:scale-95"
                style={{
                  backgroundColor: `${textColor}30`,
                  color: textColor
                }}
                variants={uiTransitionVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft size={16} className="mr-2" />
                Back
              </motion.button>
            )}
          </AnimatePresence>
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-blue-700 scrollbar-track-blue-800 space-y-4">
            <AnimatePresence mode="wait" initial={false}>
              {activeDisplayMode === 'PROPERTY_LIST' && propertyListData && (
                <motion.div
                  key="property-list"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="space-y-2"
                >
                  {/* Header with close button */}
                  <div className="flex items-center justify-between px-2">
                    <h3 className="font-medium text-lg" style={{ color: textColor }}>Available Properties</h3>
                    <motion.button
                      onClick={() => setActiveDisplayMode('CHAT')}
                      className="backdrop-blur-sm rounded-full p-1 transition-all duration-100 active:scale-95"
                      style={{ 
                        backgroundColor: `${textColor}20`,
                        color: textColor
                      }}
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.05 }}
                      title="Close"
                    >
                      <X size={18} />
                    </motion.button>
                  </div>
                  <PropertyList 
                    properties={propertyListData}
                    onScheduleVisit={() => {}} 
                    onPropertySelect={handlePropertySelect}
                  />
                </motion.div>
              )}
              {activeDisplayMode === 'SCHEDULING_FORM' && selectedProperty && selectedProperty.id && !isVerifying && (
                <motion.div 
                  key="scheduling-form"
                  className="relative w-full"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <TimePick
                    schedule={Object.keys(availableSlots).length > 0 ? availableSlots : {}}
                    property={selectedProperty as { id: string; name: string; price: string; area: string; description: string; mainImage: string }}
                    onTimeSelect={(selectedDate: string, selectedTime?: string) => {
                      if (selectedTime) {
                        handleTimeSlotSelection(selectedDate, selectedTime)
                      }
                    }}
                    onBack={handleSchedulingBack}
                    onClose={handleSchedulingClose}
                  />
                </motion.div>
              )}
              {activeDisplayMode === 'VERIFICATION_FORM' && (
                <motion.div 
                  key="verification-form"
                  className="relative w-full"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <VerificationForm onSubmit={handleVerificationSubmit} /> 
                </motion.div>
              )}
              {activeDisplayMode === 'OTP_FORM' && (
                <motion.div 
                  key="otp-form"
                  className="relative w-full"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <OTPInput onSubmit={handleOtpSubmit} onBack={handleOtpBack} />
                </motion.div>
              )}
              {activeDisplayMode === 'VERIFICATION_SUCCESS' && (
                <motion.div 
                  key="verification-success"
                  className="flex flex-col items-center justify-center w-full py-8"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <motion.div 
                    className="bg-green-500 rounded-full p-3 mb-4"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...FAST_SPRING, delay: 0.1 }}
                  >
                    <CheckCircle size={40} className="text-white" />
                  </motion.div>
                  <motion.h3 
                    className="text-xl font-semibold mb-2"
                    style={{ color: textColor }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...INSTANT_TRANSITION, delay: 0.2 }}
                  >
                    Verification Successful!
                  </motion.h3>
                  <motion.p 
                    className="text-center"
                    style={{ color: textColor }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ ...INSTANT_TRANSITION, delay: 0.3 }}
                  >
                    Your phone number has been successfully verified. You can now proceed.
                  </motion.p>
                </motion.div>
              )}
              {activeDisplayMode === 'IMAGE_GALLERY' && propertyGalleryData && (
                <motion.div 
                  key="image-gallery"
                  className="w-full"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <PropertyImageGallery
                    propertyName={propertyGalleryData.propertyName}
                    images={propertyGalleryData.images}
                    onClose={handleCloseGallery} 
                  />
                </motion.div>
              )}
              {activeDisplayMode === 'LOCATION_MAP' && locationMapData && (
                <motion.div 
                  key="location-map"
                  className="w-full"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <LocationMap
                    propertyName={locationMapData.propertyName}
                    location={locationMapData.location}
                    description={locationMapData.description}
                    onClose={handleCloseLocationMap} 
                  />
                </motion.div>
              )}
              {activeDisplayMode === 'BROCHURE_VIEWER' && brochureData && (
                <motion.div 
                  key="brochure-viewer"
                  className="w-full p-4"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <BrochureViewer
                    propertyName={brochureData.propertyName}
                    brochureUrl={brochureData.brochureUrl}
                    onClose={handleCloseBrochure} 
                  />
                </motion.div>
              )}
              {activeDisplayMode === 'CHAT' && (
                <motion.div 
                  key="chat-mode"
                  className="flex flex-col justify-center items-center h-full text-center px-4"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {lastAgentTextMessage && (
                    <motion.p 
                      className="text-xl font-medium italic mb-10"
                      style={{ color: textColor }}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={INSTANT_TRANSITION}
                    >
                      {lastAgentTextMessage}
                    </motion.p>
                  )}
                  
                  {/* OPTION 1: Animated Hint Bubbles */}
                  <AnimatePresence>
                    {showUserHints && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="absolute inset-x-0 bottom-32 flex flex-col items-center space-y-4 px-4"
                      >
                        {/* Speech hint */}
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.3 }}
                          className="flex items-center space-x-3 backdrop-blur-sm rounded-full px-4 py-3 border"
                          style={{
                            backgroundColor: `${textColor}10`,
                            borderColor: `${textColor}20`
                          }}
                        >
                          <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="p-2 rounded-full"
                            style={{ backgroundColor: `${textColor}20` }}
                          >
                            <Mic size={16} style={{ color: textColor }} />
                          </motion.div>
                          <span className="text-sm font-medium" style={{ color: textColor }}>
                            You can speak now
                          </span>
                        </motion.div>
                        
                        {/* OR divider */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.4 }}
                          className="text-xs font-medium"
                          style={{ color: `${textColor}60` }}
                        >
                          OR
                        </motion.div>
                        
                        {/* Chat button hint */}
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.6, duration: 0.3 }}
                          className="flex items-center space-x-3 backdrop-blur-sm rounded-full px-4 py-3 border"
                          style={{
                            backgroundColor: `${textColor}10`,
                            borderColor: `${textColor}20`
                          }}
                        >
                          <motion.div
                            animate={{ 
                              scale: [1, 1.1, 1],
                              x: [0, -2, 2, 0]
                            }}
                            transition={{ 
                              duration: 2, 
                              repeat: Infinity,
                              delay: 1
                            }}
                            className="p-2 rounded-full"
                            style={{ backgroundColor: `${textColor}20` }}
                          >
                            <MessageSquare size={16} style={{ color: textColor }} />
                          </motion.div>
                          <span className="text-sm font-medium" style={{ color: textColor }}>
                            Click the chat button to type
                          </span>
                          <motion.div
                            animate={{ 
                              x: [0, -8, 0],
                              opacity: [1, 0.7, 1]
                            }}
                            transition={{ 
                              duration: 1.5, 
                              repeat: Infinity,
                              delay: 2
                            }}
                            style={{ color: `${textColor}80` }}
                          >
                            ⬇
                          </motion.div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {!lastAgentTextMessage && transcriptItems.length === 0 && (
                    <motion.p 
                      className="text-xl font-medium italic"
                      style={{ color: textColor }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={INSTANT_TRANSITION}
                    >
                      How can I help you today?
                    </motion.p>
                  )}
                </motion.div>
              )}
              {activeDisplayMode === 'BOOKING_CONFIRMATION' && bookingDetails && (
                <motion.div 
                  key="booking-confirmation"
                  className="relative w-full flex items-center justify-center"
                  variants={uiTransitionVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <BookingDetailsCard
                    customerName={bookingDetails.customerName}
                    propertyName={bookingDetails.propertyName}
                    date={bookingDetails.date}
                    time={bookingDetails.time}
                    phoneNumber={bookingDetails.phoneNumber}
                    onClose={handleBookingConfirmationClose}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={transcriptEndRef} />
          </div>
          <AnimatePresence>
            {activeDisplayMode === 'CHAT' && transcriptItems
              .filter(item => item.type === 'MESSAGE' && item.role === 'user' && item.status !== 'DONE')
              .filter(item => !shouldHideFromUI(item.text || '', item.agentName))
              .slice(-1)
              .map(item => (
                <motion.div 
                  key={item.itemId} 
                  className="absolute bottom-20 right-4 max-w-[80%] p-3 rounded-xl text-sm rounded-br-none z-20 shadow-lg"
                  style={{
                    backgroundColor: `${textColor}40`,
                    color: textColor
                  }}
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={INSTANT_TRANSITION}
                >
                  {item.text || '[Transcribing...]'}
                </motion.div>
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {activeDisplayMode === 'PROPERTY_DETAILS' && selectedPropertyDetails && (
              <motion.div 
                key="property-details-modal"
                className="absolute inset-0 backdrop-blur-sm flex items-center justify-center z-10 p-4"
                style={{ backgroundColor: `${bgColor}80` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={INSTANT_TRANSITION}
              >
                <motion.div 
                  className="max-w-sm w-full"
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={FAST_TRANSITION}
                >
                  <PropertyDetails 
                    {...selectedPropertyDetails}
                    onClose={handleClosePropertyDetails}
                    onBack={handleBackFromPropertyDetails}
                    onScheduleVisit={handleScheduleVisitRequest}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-auto flex-shrink-0 z-20">
            <AnimatePresence>
              {inputVisible && (
                <motion.div
                  key="input-area"
                  variants={inputAnimationVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="rounded-xl w-[320px] -mb-1 ml-1 h-[48px] shadow-lg"
                  style={{ backgroundColor: `${textColor}30` }}
                >
                  <div className="flex items-center justify-between w-full px-4 py-2 rounded-lg">
                    <input
                      ref={inputRef} 
                      type="text" 
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)} 
                      onKeyDown={handleKeyDown}
                      placeholder={sessionStatus === 'CONNECTED' ? "Type your message..." : "Connect call to type"}
                      className="flex-1 mt-1 bg-transparent outline-none text-sm placeholder:opacity-70"
                      style={{ 
                        color: textColor
                      }}
                      disabled={sessionStatus !== 'CONNECTED'}
                    />
                    <motion.button 
                      onClick={handleSend} 
                      className="ml-2 mt-1 disabled:opacity-50 transition-all duration-100" 
                      style={{ color: textColor }}
                      disabled={sessionStatus !== 'CONNECTED' || !inputValue.trim()}
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.1 }}
                    > 
                      <Send size={18} /> 
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div 
              className="flex justify-between items-center p-3"
              style={{ backgroundColor: bgColor }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={INSTANT_TRANSITION}
            >
              <motion.button 
                onClick={debouncedToggleInput} 
                className={`p-3 rounded-full transition-all duration-100 active:scale-95 ${
                  showUserHints ? 'ring-4 ring-white/30' : ''
                }`}
                style={{ 
                  backgroundColor: `${textColor}30`,
                  color: textColor
                }}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
                animate={showUserHints ? {
                  boxShadow: [
                    "0 0 0 0px rgba(255, 255, 255, 0.3)",
                    "0 0 0 10px rgba(255, 255, 255, 0)",
                    "0 0 0 0px rgba(255, 255, 255, 0)"
                  ]
                } : {}}
                transition={showUserHints ? {
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeOut"
                } : {}}
              > 
                <MessageSquare size={20} /> 
              </motion.button>
              
              <div className="flex justify-center space-x-1"> 
                {Array(15).fill(0).map((_, i) => (
                  <div 
                    key={i} 
                    className="w-1 h-1 rounded-full opacity-50"
                    style={{ backgroundColor: textColor }}
                  ></div>
                ))} 
              </div>
              
              <motion.button 
                onClick={debouncedToggleMic} 
                className="p-3 rounded-full transition-all duration-100 active:scale-95"
                style={{
                  backgroundColor: micMuted ? '#6b7280' : `${textColor}30`,
                  color: textColor
                }}
                disabled={sessionStatus !== 'CONNECTED'}
                title={micMuted ? "Mic Off" : "Mic On"}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: sessionStatus === 'CONNECTED' ? 1.05 : 1 }}
              > 
                {micMuted ? <MicOff size={20} /> : <Mic size={20} />} 
              </motion.button>
              
              <motion.button 
                onClick={debouncedHandleCallButtonClick}
                className={`${sessionStatus === 'CONNECTED' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} p-3 rounded-full transition-all duration-100 disabled:opacity-70 active:scale-95 text-white`}
                disabled={sessionStatus === 'CONNECTING' || (!chatbotId && sessionStatus === 'DISCONNECTED')}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
              >
                {sessionStatus === 'CONNECTING' ? (
                  <Loader size={18} className="animate-spin"/>
                ) : sessionStatus === 'CONNECTED' ? (
                  <PhoneOff size={18} />
                ) : (
                  <Phone size={18} />
                )}
              </motion.button>
            </motion.div>
          </div>
        </>
      )}
      </React.Fragment>
      <audio ref={audioElementRef} playsInline />
    </div>
  );
} 