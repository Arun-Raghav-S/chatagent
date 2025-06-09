"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
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
import { SessionStatus, AgentConfig, AgentMetadata, TranscriptItem } from "@/types/types"
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
    /yes, i'd like to schedule a visit for .+/i.test(text)
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

export default function RealEstateAgent({ chatbotId }: RealEstateAgentProps) {
  // --- State Declarations ---
  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED")
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<
    AgentConfig[] | null
  >(allAgentSets[defaultAgentSetKey] || null)
  const [selectedAgentName, setSelectedAgentName] = useState<string>(
    selectedAgentConfigSet?.[0]?.name || ""
  )
  const [agentMetadata, setAgentMetadata] = useState<AgentMetadata | null>(null)
  const [activeDisplayMode, setActiveDisplayMode] =
    useState<ActiveDisplayMode>("CHAT")
  const [appointment, setAppointment] = useState(false)
  const [selectedProperty, setSelectedProperty] =
    useState<PropertyProps | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>("Monday")
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false)
  const [showTimeSlots, setShowTimeSlots] = useState<boolean>(false)
  const [availableSlots, setAvailableSlots] = useState<Record<string, string[]>>(
    {}
  )
  const [showVerificationScreen, setShowVerificationScreen] =
    useState<boolean>(false)
  const [showOtpScreen, setShowOtpScreen] = useState<boolean>(false)
  const [verificationData, setVerificationData] = useState<{
    name: string
    phone: string
    date: string
    time: string
  }>({ name: "", phone: "", date: "", time: "" })
  const [verificationSuccessful, setVerificationSuccessful] =
    useState<boolean>(false)
  const [showVerificationSuccess, setShowVerificationSuccess] =
    useState<boolean>(false)
  const [isVerifying, setIsVerifying] = useState<boolean>(false)
  const [startTime, setStartTime] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [inputVisible, setInputVisible] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [selectedLanguage, setSelectedLanguage] = useState("English")
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)

  // --- Refs ---
  const inputRef = useRef<HTMLInputElement>(null)
  const prevAgentNameRef = useRef<string | null>(null)
  const initialSessionSetupDoneRef = useRef<boolean>(false)
  const handleServerEventRef = useRef<(event: any) => void>(() => {})
  const hasShownSuccessMessageRef = useRef<boolean>(false)
  const pendingQuestionProcessedRef = useRef<boolean>(false)
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
    pcRef,
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
    (eventObj: any, eventNameSuffix = "") => {
      if (dcRef.current && dcRef.current.readyState === "open") {
        dcRef.current.send(JSON.stringify(eventObj))
      } else {
        console.error(
          `[Send Event Error] Data channel not open. Attempted to send: ${eventObj.type} ${eventNameSuffix}`,
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
    initialSessionSetupDoneRef
  )

  const { handleServerEvent, canCreateResponse, bookingDetails } =
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
      prevAgentNameRef
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
    commitAudioBuffer,
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

  const toggleInput = () => {
    setInputVisible(!inputVisible)
    if (!inputVisible) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 300)
    }
  }

  const handleLanguageSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedLanguage(e.target.value)
  }

  const handleProceed = () => {
    setShowIntro(false)
    if (sessionStatus === "DISCONNECTED") {
      connectToRealtime()
    }
  }
  
  useEffect(() => {
    if (sessionStatus === "CONNECTED" && !showIntro) {
      updateSession(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage, sessionStatus, showIntro]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && initialSessionSetupDoneRef.current) {
      updateSessionMicState()
    }
  }, [micMuted, sessionStatus, updateSessionMicState])

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && !audioContext) {
      try {
        const newAudioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)()
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
        const metadata = agentMetadata as any
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

  useEffect(() => {
    if (!selectedPropertyDetails) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [
    transcriptItems,
    lastAgentTextMessage,
    propertyListData,
    selectedPropertyDetails,
    transcriptEndRef,
  ])

  const languageOptions = [
    "English", "Hindi", "Tamil", "Telugu", "Malayalam", "Spanish", "French",
    "German", "Chinese", "Japanese", "Arabic", "Russian"
  ]

  const handleReset = () => {
    setAppointment(false)
    setSelectedProperty(null)
    setSelectedTime(null)
    setIsConfirmed(false)
  }

  return (
    <div
      className="relative bg-blue-900 rounded-3xl overflow-hidden text-white flex flex-col"
      style={{ width: "329px", height: "611px" }}
    >
      <div className="flex items-center p-4 border-b border-blue-800 flex-shrink-0">
        <div className="flex items-center">
          <div className="bg-white rounded-full p-1 mr-2">
            <div className="text-blue-800 w-8 h-8 flex items-center justify-center">
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
          <span className="font-medium">Real Estate AI Agent</span>
        </div>
        <button className="ml-auto p-2 hover:bg-blue-800 rounded-full">
          <X size={20} />
        </button>
      </div>
      {showIntro ? (
        <div className="flex flex-col h-full items-center justify-center p-6 text-center">
          <h2 className="text-2xl font-medium mb-6">
            Hey there, Please select a language
          </h2>
          <div className="relative w-full mb-8">
            <select
              value={selectedLanguage}
              onChange={handleLanguageSelect}
              className="appearance-none bg-transparent py-2 pr-10 border-b-2 border-white w-full text-center text-xl font-medium focus:outline-none"
            >
              {languageOptions.map(lang => (
                <option key={lang} value={lang} className="bg-blue-800 text-white">
                  {lang}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
              <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
          <p className="text-xl mb-8">to continue.</p>
          <button 
            onClick={handleProceed}
            className="bg-white text-blue-900 px-6 py-2 rounded-md font-medium hover:bg-blue-100 transition-colors"
          >
            Let's go
          </button>
        </div>
      ) : (
        <>
          {sessionStatus === 'CONNECTED' && (activeDisplayMode === 'CHAT' || activeDisplayMode === 'IMAGE_GALLERY') && (
             <div className="border-1 h-10 rounded-3xl w-72 p-4 justify-evenly ml-5 my-2 flex-shrink-0">
               <VoiceWaveform
                 mediaStream={audioElementRef.current?.srcObject as MediaStream}
                 active={sessionStatus === 'CONNECTED' && !!audioElementRef.current?.srcObject}
               />
             </div>
          )}
          {activeDisplayMode === 'IMAGE_GALLERY' && (
            <button
              onClick={handleCloseGallery}
              className="mb-2 ml-4 self-start bg-blue-700 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center shadow"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </button>
          )}
          {activeDisplayMode === 'LOCATION_MAP' && (
            <button
              onClick={handleCloseLocationMap}
              className="mb-2 ml-4 self-start bg-blue-700 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center shadow"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </button>
          )}
          {activeDisplayMode === 'BROCHURE_VIEWER' && (
            <button
              onClick={handleCloseBrochure}
              className="mb-2 ml-4 self-start bg-blue-700 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center shadow"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </button>
          )}
          <div className={`flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-blue-700 scrollbar-track-blue-800 space-y-4`}>
            {activeDisplayMode === 'PROPERTY_LIST' && propertyListData && (
              <PropertyList 
                properties={propertyListData}
                onScheduleVisit={() => {}} 
                onPropertySelect={handlePropertySelect}
              />
            )}
            {activeDisplayMode === 'SCHEDULING_FORM' && selectedProperty && !isVerifying && (
              <div className="relative w-full">
                <TimePick
                  schedule={Object.keys(availableSlots).length > 0 ? availableSlots : {}}
                  property={selectedProperty}
                  onTimeSelect={handleTimeSlotSelection}
                />
              </div>
            )}
            {activeDisplayMode === 'VERIFICATION_FORM' && (
              <div className="relative w-full">
                 <VerificationForm onSubmit={handleVerificationSubmit} /> 
              </div>
            )}
            {activeDisplayMode === 'OTP_FORM' && (
              <div className="relative w-full">
                <OTPInput 
                  onSubmit={handleOtpSubmit}
                />
              </div>
            )}
            {activeDisplayMode === 'VERIFICATION_SUCCESS' && (
              <div className="flex flex-col items-center justify-center w-full py-8">
                <div className="bg-green-500 rounded-full p-3 mb-4">
                  <CheckCircle size={40} className="text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Verification Successful!</h3>
                <p className="text-center">
                  Your phone number has been successfully verified. You can now proceed.
                </p>
              </div>
            )}
            {activeDisplayMode === 'IMAGE_GALLERY' && propertyGalleryData && (
              <div className="w-full">
                <PropertyImageGallery
                  propertyName={propertyGalleryData.propertyName}
                  images={propertyGalleryData.images}
                  onClose={handleCloseGallery} 
                />
              </div>
            )}
            {activeDisplayMode === 'LOCATION_MAP' && locationMapData && (
              <div className="w-full">
                <LocationMap
                  propertyName={locationMapData.propertyName}
                  location={locationMapData.location}
                  description={locationMapData.description}
                  onClose={handleCloseLocationMap} 
                />
              </div>
            )}
            {activeDisplayMode === 'BROCHURE_VIEWER' && brochureData && (
              <div className="w-full p-4">
                <BrochureViewer
                  propertyName={brochureData.propertyName}
                  brochureUrl={brochureData.brochureUrl}
                  onClose={handleCloseBrochure} 
                />
              </div>
            )}
            {activeDisplayMode === 'CHAT' && (
              <div className="flex flex-col justify-center items-center h-full text-center px-4">
                 {lastAgentTextMessage && (
                    <p className="text-white text-xl font-medium italic mb-10">
                      {lastAgentTextMessage}
                    </p>
                  )}
                  {!lastAgentTextMessage && transcriptItems.length === 0 && (
                     <p className="text-white text-xl font-medium italic">How can I help you today?</p>
                  )}
              </div>
            )}
            <div ref={transcriptEndRef} />
            {activeDisplayMode === 'BOOKING_CONFIRMATION' && bookingDetails && (
              <div className="relative w-full flex items-center justify-center">
                <BookingDetailsCard
                  customerName={bookingDetails.customerName}
                  propertyName={bookingDetails.propertyName}
                  date={bookingDetails.date}
                  time={bookingDetails.time}
                  phoneNumber={bookingDetails.phoneNumber}
                />
              </div>
            )}
          </div>
          {activeDisplayMode === 'CHAT' && transcriptItems
            .filter(item => item.type === 'MESSAGE' && item.role === 'user' && item.status !== 'DONE')
            .filter(item => !shouldHideFromUI(item.text || '', item.agentName))
            .slice(-1)
            .map(item => (
              <div key={item.itemId} className="absolute bottom-20 right-4 max-w-[80%] bg-blue-600 p-3 rounded-xl text-sm text-white rounded-br-none z-20 shadow-lg">
                {item.text || '[Transcribing...]'}
              </div>
        ))}
          {activeDisplayMode === 'PROPERTY_DETAILS' && selectedPropertyDetails && (
              <div className="absolute inset-0 bg-blue-900 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-10 p-4">
                 <div className="max-w-sm w-full">
                     <PropertyDetails 
                         {...selectedPropertyDetails}
                         onClose={handleClosePropertyDetails}
                         onScheduleVisit={handleScheduleVisitRequest}
                     />
                  </div>
              </div>
          )}
          <div className="mt-auto flex-shrink-0 z-20">
            <AnimatePresence>
              {inputVisible && (
                <motion.div
                  initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="rounded-xl w-[320px] -mb-1 ml-1 h-[48px] shadow-lg bg-[#47679D]"
                >
                  <div className="flex items-center justify-between w-full px-4 py-2 rounded-lg">
                    <input
                      ref={inputRef} type="text" value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder={sessionStatus === 'CONNECTED' ? "Type your message..." : "Connect call to type"}
                      className="flex-1 mt-1 bg-transparent outline-none text-white placeholder:text-white placeholder:opacity-50 text-sm"
                      disabled={sessionStatus !== 'CONNECTED'}
                    />
                    <button onClick={handleSend} className="ml-2 mt-1 text-white disabled:opacity-50" disabled={sessionStatus !== 'CONNECTED' || !inputValue.trim()}> <Send size={18} /> </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex justify-between items-center p-3 bg-blue-900">
              <button onClick={toggleInput} className="bg-[#47679D] p-3 rounded-full hover:bg-blue-600 transition-colors"> <MessageSquare size={20} /> </button>
              <div className="flex justify-center space-x-1"> {Array(15).fill(0).map((_, i) => (<div key={i} className="w-1 h-1 bg-white rounded-full opacity-50"></div>))} </div>
              <button 
                onClick={toggleMic} 
                className={`p-3 rounded-full transition-colors ${micMuted ? 'bg-gray-600' : 'bg-[#47679D] hover:bg-blue-600'}`}
                disabled={sessionStatus !== 'CONNECTED'}
                title={micMuted ? "Mic Off" : "Mic On"}
              > {micMuted ? <MicOff size={20} /> : <Mic size={20} />} </button>
              <button 
                onClick={handleCallButtonClick}
                className={`${sessionStatus === 'CONNECTED' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} p-3 rounded-full transition-colors disabled:opacity-70`}
                disabled={sessionStatus === 'CONNECTING' || (!chatbotId && sessionStatus === 'DISCONNECTED')}
              >
                {sessionStatus === 'CONNECTING' ? <Loader size={18} className="animate-spin"/> : sessionStatus === 'CONNECTED' ? <PhoneOff size={18} /> : <Phone size={18} />}
              </button>
            </div>
          </div>
        </>
      )}
      <audio ref={audioElementRef} playsInline />
    </div>
  );
} 