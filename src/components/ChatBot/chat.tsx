"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MessageSquare, X, Mic, MicOff, Phone, Send, PhoneOff, Loader, ArrowLeft, CheckCircle } from "lucide-react"
import { v4 as uuidv4 } from 'uuid';

// UI Components
import PropertyList from "../PropertyComponents/PropertyList"
import PropertyDetails from "../PropertyComponents/propertyDetails"
import { VoiceWaveform } from "./VoiceWaveForm"
import PropertyImageGallery from "../PropertyComponents/PropertyImageGallery"
import LocationMap from "../PropertyComponents/LocationMap"
import BrochureViewer from "../PropertyComponents/brochureViewer"

// --- Appointment UI Components ---
import TimePick from "../Appointment/timePick";
import Confirmations from "../Appointment/Confirmations"; 
import BookingConfirmation from "../Appointment/BookingConfirmation";
import VerificationForm from "../Appointment/VerificationForm"; // Corrected path
import OTPInput from "../Appointment/otp"; // Import OTP component
import BookingDetailsCard from "../Appointment/BookingDetailsCard";

// Agent Logic Imports
import { 
    SessionStatus, 
    TranscriptItem, 
    AgentConfig, 
    AgentMetadata, 
    ServerEvent 
} from "@/types/types";
import { allAgentSets, defaultAgentSetKey } from "@/agentConfigs";
import { createRealtimeConnection } from "@/libs/realtimeConnection";
import { useHandleServerEvent } from "@/hooks/useHandleServerEvent";

// Import debounce function
import { debounce } from 'lodash';

// Extended AgentMetadata interface to include new authentication flow properties
interface ExtendedAgentMetadata extends AgentMetadata {
  flow_context?: 'from_full_scheduling' | 'from_direct_auth' | 'from_scheduling_verification' | 'from_question_auth';
  pending_question?: string;
}

interface PropertyUnit {
  type: string
}

interface Amenity {
  name: string
}

interface PropertyLocation {
  city?: string
  mapUrl?: string
  coords?: string
}

interface PropertyImage {
  url?: string
  alt?: string
  description?: string
}

interface PropertyProps {
  id?: string
  name?: string
  price?: string
  area?: string
  location?: PropertyLocation
  mainImage?: string
  galleryImages?: PropertyImage[]
  units?: PropertyUnit[]
  amenities?: Amenity[]
  description?: string
  websiteUrl?: string
  brochure?: string
  onClose?: () => void
}

// --- Add Props Interface --- 
interface RealEstateAgentProps {
    chatbotId: string; // Receive chatbotId from parent page
}

// --- UI Display Modes ---
type ActiveDisplayMode = 
  | 'CHAT' 
  | 'PROPERTY_LIST' 
  | 'PROPERTY_DETAILS' 
  | 'IMAGE_GALLERY' 
  | 'SCHEDULING_FORM' // For TimePick
  | 'VERIFICATION_FORM' // For VerificationForm
  | 'OTP_FORM' // For OTPInput
  | 'VERIFICATION_SUCCESS' // For showing verification success before returning to CHAT
  | 'BOOKING_CONFIRMATION' // For showing booking details card
  | 'LOCATION_MAP' // For showing location map
  | 'BROCHURE_VIEWER'; // For showing brochure viewer

interface PropertyGalleryData {
  propertyName: string
  images: PropertyImage[]
}

// Add new interface for booking details
interface BookingDetails {
  customerName: string;
  propertyName: string;
  date: string;
  time: string;
  phoneNumber?: string;
}

// Add new interface for location map data
interface LocationMapData {
  propertyName: string
  location: PropertyLocation
  description?: string
}

// Add new interface for brochure data
interface BrochureData {
  propertyName: string
  brochureUrl: string
}

// --- Agent Component ---
export default function RealEstateAgent({ chatbotId }: RealEstateAgentProps) { // Accept chatbotId prop
  // --- Existing UI State --- 
  const [inputVisible, setInputVisible] = useState(false)
  const [micMuted, setMicMuted] = useState(false) // Start unmuted (mic initially open)
  const [inputValue, setInputValue] = useState("")
  const [showProperties, setShowProperties] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [appointment, setAppointment] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<PropertyProps | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>("Monday")
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false)
  
  // --- Scheduling Flow State ---
  const [showTimeSlots, setShowTimeSlots] = useState<boolean>(false);
  const [availableSlots, setAvailableSlots] = useState<Record<string, string[]>>({});

  // --- New Intro Screen State ---
  const [showIntro, setShowIntro] = useState(true)
  const [selectedLanguage, setSelectedLanguage] = useState("English")
  const languageOptions = [
    "English", "Hindi", "Tamil", "Telugu", "Malayalam", "Spanish", "French", 
    "German", "Chinese", "Japanese", "Arabic", "Russian"
  ]

  // --- Agent & Connection State --- 
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("DISCONNECTED");
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<AgentConfig[] | null>(
    allAgentSets[defaultAgentSetKey] || null
  );
  const [selectedAgentName, setSelectedAgentName] = useState<string>(
     selectedAgentConfigSet?.[0]?.name || ""
  );
  // Store agent metadata directly in state, initialize with chatbotId
  const [agentMetadata, setAgentMetadata] = useState<AgentMetadata | null>(null); // Initialize as null initially

  // --- NEW STATE FOR PROPERTY CARDS --- 
  const [propertyListData, setPropertyListData] = useState<PropertyProps[] | null>(null);
  const [selectedPropertyDetails, setSelectedPropertyDetails] = useState<PropertyProps | null>(null);
  const [lastAgentTextMessage, setLastAgentTextMessage] = useState<string | null>(null);
  const [propertyGalleryData, setPropertyGalleryData] = useState<PropertyGalleryData | null>(null); // For gallery
  const [locationMapData, setLocationMapData] = useState<LocationMapData | null>(null); // For location map
  const [brochureData, setBrochureData] = useState<BrochureData | null>(null); // For brochure viewer

  // Add new state for audio context
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  // --- Refs for WebRTC --- 
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null); // Ref to scroll transcript
  const initialSessionSetupDoneRef = useRef<boolean>(false); // Ref to track initial setup

  // Add state for verification UI
  const [showVerificationScreen, setShowVerificationScreen] = useState<boolean>(false);
  const [showOtpScreen, setShowOtpScreen] = useState<boolean>(false);
  const [verificationData, setVerificationData] = useState<{name: string, phone: string, date: string, time: string}>({
    name: '',
    phone: '',
    date: '',
    time: ''
  });
  
  // Add state to track verification success
  const [verificationSuccessful, setVerificationSuccessful] = useState<boolean>(false);
  const [showVerificationSuccess, setShowVerificationSuccess] = useState<boolean>(false);

  // Add state to specifically track if verification is *currently* needed (distinct from showVerificationScreen)
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // --- New Centralized UI State ---
  const [activeDisplayMode, setActiveDisplayMode] = useState<ActiveDisplayMode>('CHAT');

  // Add state to track when properties are being loaded
  const [isLoadingProperties, setIsLoadingProperties] = useState<boolean>(false);

  // Track the previous agent name for transition detection
  const prevAgentNameRef = useRef<string | null>(null);
  // Add a ref to track if we've already shown the verification success message
  const hasShownSuccessMessageRef = useRef<boolean>(false);
  // Add a ref to track the last property query message to avoid repeated processing
  const lastPropertyQueryRef = useRef<string | null>(null);
  // Add a ref to track if we've already processed a pending question to avoid duplicates
  const pendingQuestionProcessedRef = useRef<boolean>(false);

  // Initialize start time when the connection is established
  const [startTime, setStartTime] = useState<string | null>(null);

  // Add state for booking details
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);

  // Helper to generate safe IDs (32 chars max)
  const generateSafeId = () => uuidv4().replace(/-/g, '').slice(0, 32);

  // Update transcript management functions to use safe IDs
  const addTranscriptMessage = useCallback((itemId: string, role: "user" | "assistant" | "system", text: string, properties?: PropertyProps[], agentName?: string) => {
      // *** LOGGING POINT 4 ***
      // console.log(`[addTranscriptMessage] Called with role: ${role}, itemId: ${itemId}, hasProperties: ${!!properties}`);
      
      if (itemId === 'new' || itemId.length > 32) {
          itemId = generateSafeId();
      }
      
      if (role === 'assistant') {
          setLastAgentTextMessage(text);
          if (properties && properties.length > 0) {
              // console.log('[addTranscriptMessage] Properties detected, skipping setPropertyListData here (handled in handleServerEvent).', properties);
          }
          // Never clear propertyListData for text messages, we want to keep them displayed
      }
      
      setTranscriptItems((prev) => {
           // Avoid adding duplicates if item already exists (e.g., from optimistic update)
           if (prev.some(item => item.itemId === itemId)) {
              //  console.log(`[addTranscriptMessage] Item ${itemId} already exists, skipping add.`);
               return prev; 
           }
            // console.log(`[addTranscriptMessage] Adding item ${itemId} to transcriptItems state.`);
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
                      setLastAgentTextMessage(newText); // Update latest agent text state
                      
                      // Log agent transcript updates - show the complete message so far
                      console.log(`📝 [${selectedAgentName.toUpperCase()} STREAMING]: "${newText}"`);
                      console.log(`📊 [STREAMING DETAILS] Agent: ${selectedAgentName} | ItemID: ${itemId.substring(0, 8)}... | Length: ${newText.length} chars | isDelta: ${isDelta}`);
                  }
                  return {
                      ...item,
                      text: newText,
                      status: 'IN_PROGRESS', // Keep in progress while updating
                  };
              }
              return item;
          })
      );
  }, [selectedAgentName]);

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

  // --- Send Client Events --- 
  const sendClientEvent = useCallback((eventObj: any, eventNameSuffix = "") => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      // console.log(`[Send Event] ${eventObj.type} ${eventNameSuffix}`, eventObj);
      dcRef.current.send(JSON.stringify(eventObj));
    } else {
      console.error(
        `[Send Event Error] Data channel not open. Attempted to send: ${eventObj.type} ${eventNameSuffix}`,
        eventObj
      );
       addTranscriptMessage(generateSafeId(), 'system', `Error: Could not send message. Connection lost.`);
       setSessionStatus("DISCONNECTED");
    }
  }, [addTranscriptMessage]); // Updated dependency

  // --- Initialize Event Handler Hook (Modified to handle properties) --- 
  const { 
    handleServerEvent: handleServerEventRefFromHook, // Rename the ref from the hook
    canCreateResponse 
  } = useHandleServerEvent({
      setSessionStatus,
      selectedAgentName,
      selectedAgentConfigSet,
      sendClientEvent,
      setSelectedAgentName,
      setAgentMetadata, // Add the missing parameter
      transcriptItems,
      addTranscriptMessage, // Use the modified addTranscriptMessage
      updateTranscriptMessage,
      updateTranscriptItemStatus,
      // Pass setters for new UI control
      setActiveDisplayMode, 
      setPropertyListData,
      setSelectedPropertyDetails,
      setPropertyGalleryData,
      setLocationMapData, // Add location map setter
      setBookingDetails, // Add this new setter
      setBrochureData, // Add brochure data setter
  });

  // --- NEW PROPERTY HANDLERS --- 
  const handlePropertySelect = (property: PropertyProps) => {
    console.log(`[UI] Property selected: ${property.name} (${property.id})`);
    setSelectedPropertyDetails(property);
    setActiveDisplayMode('PROPERTY_DETAILS');
    // setPropertyListData(null); // Keep list data if we want to go "back"
    
    // Send a trigger message for the agent to explain this property
    setTimeout(() => {
      sendTriggerMessage(`{Trigger msg: Explain details of this ${property.name} in brief and then ask if they want to schedule a visit to this property}`);
      
    }, 500); // Small delay to ensure UI has updated first
  };

  const handleClosePropertyDetails = () => {
    console.log("[UI] Closing property details.");
    setSelectedPropertyDetails(null);
    setActiveDisplayMode('CHAT'); // Or 'PROPERTY_LIST' if applicable
  };

  // Direct method to load all properties using the agent's getProjectDetails function
  const handleGetAllProperties = useCallback(async () => {
    console.log("[UI] Attempting to load all properties directly");
    
    // Prevent multiple simultaneous calls
    if (propertyListData || isLoadingProperties) {
      console.log("[UI] Properties already loaded or loading in progress, skipping request");
      return;
    }
    
    if (!selectedAgentConfigSet || !agentMetadata?.project_ids || agentMetadata.project_ids.length === 0) {
      console.error("[UI] Cannot load properties - missing agent config or project IDs");
      addTranscriptMessage(
        generateSafeId(), 
        'system', 
        'Unable to load properties. Please try again later or ask for specific property information.'
      );
      return;
    }
    
    const realEstateAgent = selectedAgentConfigSet.find(a => a.name === 'realEstate');
    if (!realEstateAgent || !realEstateAgent.toolLogic?.getProjectDetails) {
      console.error("[UI] Real estate agent or getProjectDetails function not found");
      addTranscriptMessage(
        generateSafeId(), 
        'system', 
        'Property information unavailable. Please try again later.'
      );
      return;
    }
    
    try {
      // Set loading flag to prevent duplicate calls
      setIsLoadingProperties(true);

      // Show loading message
      addTranscriptMessage(generateSafeId(), 'system', 'Loading properties...');
      
      console.log(`[UI] Calling getProjectDetails with all project_ids: ${agentMetadata.project_ids.join(', ')}`);
      const result = await realEstateAgent.toolLogic.getProjectDetails({}, []);
      console.log("[UI] getProjectDetails result:", result);
      
      if (result.properties && Array.isArray(result.properties) && result.properties.length > 0) {
        // Process and validate property data before setting state
        const validatedProperties = result.properties.map((property: any) => {
          // Edge function returns data in a different format than our components expect
          // Process the images array into mainImage and galleryImages format
          let mainImage = "/placeholder.svg";
          let galleryImages: PropertyImage[] = [];
          
          if (property.images && Array.isArray(property.images) && property.images.length > 0) {
            // Use the first image as main image if available
            if (property.images[0].url) {
              mainImage = property.images[0].url;
            }
            // Use the rest as gallery images
            if (property.images.length > 1) {
              galleryImages = property.images.slice(1).map((img: any) => {
                return { url: img.url, alt: img.alt || `${property.name} image`, description: img.description || "" };
              });
            }
          }
          
          // Handle amenities format conversion
          const amenitiesArray = Array.isArray(property.amenities) 
            ? property.amenities.map((amenity: any) => {
                if (typeof amenity === 'string') {
                  return { name: amenity };
                }
                return amenity;
              })
            : [];
            
          // Handle units format conversion  
          const unitsArray = Array.isArray(property.units)
            ? property.units.map((unit: any) => {
                if (typeof unit === 'string') {
                  return { type: unit };
                }
                return unit;
              })
            : [];
          
          // Ensure we have valid data for each property
          return {
            id: property.id || generateSafeId(),
            name: property.name || "Property",
            price: property.price || "Price unavailable",
            area: property.area || "Area unavailable",
            mainImage: mainImage,
            location: {
              city: property.location?.city || "Location unavailable",
              mapUrl: property.location?.mapUrl || "",
              coords: property.location?.coords || ""
            },
            galleryImages: galleryImages,
            units: unitsArray,
            amenities: amenitiesArray,
            description: property.description || "No description available",
            websiteUrl: property.websiteUrl || "",
            brochure: property.brochure || ""
          };
        });
        
        console.log(`[UI] Setting propertyListData with ${validatedProperties.length} validated properties`);
        setPropertyListData(validatedProperties);
        
        // Also add a message
        const messageText = `Here are ${validatedProperties.length} properties available.`;
        addTranscriptMessage(generateSafeId(), 'assistant', messageText, validatedProperties);
      } else {
        console.warn("[UI] No properties found or invalid response format");
        if (result.error) {
          console.error("[UI] Error loading properties:", result.error);
          addTranscriptMessage(generateSafeId(), 'system', `Error loading properties: ${result.error}`);
        } else {
          addTranscriptMessage(generateSafeId(), 'system', 'No properties available at this time.');
        }
      }
    } catch (error) {
      console.error("[UI] Error in handleGetAllProperties:", error);
      addTranscriptMessage(
        generateSafeId(), 
        'system', 
        'An error occurred while loading properties. Please try again later.'
      );
    } finally {
      // Always clear the loading flag, even on error
      setIsLoadingProperties(false);
    }
  }, [selectedAgentConfigSet, agentMetadata, addTranscriptMessage, generateSafeId, propertyListData, isLoadingProperties]);

  // Fix the stopCurrentResponse function to check if a response is active first
  const stopCurrentResponse = useCallback((sendClientEvent: (eventObj: any, eventNameSuffix?: string) => void) => {
    // canCreateResponse returns false if a response is active
    const responseIsActive = !canCreateResponse();
    if (responseIsActive) {
      console.log("[Audio] Stopping current response (active response detected)");
      sendClientEvent({ type: "response.cancel" }, "(canceling current response)");
      sendClientEvent({ type: "output_audio_buffer.clear" }, "(clearing audio buffer)");
    } else {
      console.log("[Audio] No active response to stop, just clearing audio buffer");
      sendClientEvent({ type: "output_audio_buffer.clear" }, "(clearing audio buffer only)");
    }
  }, [canCreateResponse]);

  // Updated Send Handler
  const handleSend = useCallback(() => {
    const textToSend = inputValue.trim();
    if (!textToSend || sessionStatus !== 'CONNECTED' || !dcRef.current) return;

    // Stop any current response/audio first
    stopCurrentResponse(sendClientEvent);

    console.log(`[Send Text] Sending: "${textToSend}"`);
    const userMessageId = generateSafeId();

    // Add user message optimistically to transcript
    addTranscriptMessage(userMessageId, 'user', textToSend);

    // Send message event to server
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
    );
    setInputValue("");

    // Trigger agent response
    sendClientEvent({ type: "response.create" }, "(trigger response)");

  }, [inputValue, sessionStatus, sendClientEvent, addTranscriptMessage]);

  // Updated Send Handler
  const handleScheduleVisitRequest = (property: PropertyProps) => {
    console.log(`[UI] Schedule visit requested for: ${property.name} (${property.id})`);
    setSelectedProperty(property); // Set the target property first
    
    // Stop any current response/audio first
    stopCurrentResponse(sendClientEvent);

    // Updated message with more scheduling-specific wording
    const scheduleMessage = `Yes, I'd like to schedule a visit for ${property.name}. Please help me book an appointment.`;
    const userMessageId = generateSafeId();
    
    // Send events FIRST while the component state related to the modal is stable
    sendClientEvent(
      { type: "conversation.item.create", item: { id: userMessageId, type: "message", role: "user", content: [{ type: "input_text", text: scheduleMessage }] } },
      "(schedule request from UI)"
    );
    sendClientEvent({ type: "response.create" }, "(trigger response after schedule request)");
    
    // Add message to local transcript AFTER sending
    addTranscriptMessage(userMessageId, 'user', scheduleMessage);
    
    // Now, close the details modal, which will trigger re-renders
    setSelectedPropertyDetails(null); 
  };

  // --- Handle Server Events (Wrap the hook's handler) --- 
  const handleServerEvent = useCallback((serverEvent: ServerEvent) => {
    // console.log("[handleServerEvent] Processing event:", serverEvent.type, JSON.stringify(serverEvent, null, 2)); 

    let assistantMessageHandledLocally = false; 
    let propertiesHandledLocally = false;
    
    // Access the loading state to avoid duplicate property loading
    if (isLoadingProperties) {
      console.log("[handleServerEvent] Properties are already being loaded, skipping duplicate loading");
    }

    // 🚨 COMPREHENSIVE RESPONSE.DONE LOGGING FROM CHAT.TSX
    if (serverEvent.type === "response.done") {
      console.log(`✅ [AGENT FINISHED] ${selectedAgentName.toUpperCase()} completed full response`);
      
      // Log additional context if available
      const responseDetails = serverEvent.response as any || {};
      if (responseDetails.usage) {
        console.log(`📊 [USAGE STATS] Agent: ${selectedAgentName} | Tokens: ${JSON.stringify(responseDetails.usage)} | Outputs: ${responseDetails.output?.length || 0}`);
      }
      
      // Log if this was a transfer scenario
      if (serverEvent.response?.output) {
        const hasTransferCall = serverEvent.response.output.some((output: any) => 
          output.type === 'function_call' && (output.name === 'transferAgents' || output.name === 'initiateScheduling')
        );
        if (hasTransferCall) {
          console.log(`🔄 [TRANSFER DETECTED] ${selectedAgentName.toUpperCase()} response included transfer function call`);
        }
      }
    }
    
    // Add special handling for agent transfer to scheduleMeeting
    if (serverEvent.type === "session.updated" && selectedAgentName === "scheduleMeeting") {
      console.log("[handleServerEvent] Detected session update for scheduleMeeting agent - ensuring UI is properly set");
      // Ensure UI state is correctly set for scheduling, as the agent should call getAvailableSlots next
      if (activeDisplayMode !== 'SCHEDULING_FORM') {
        console.log("[handleServerEvent] CRITICAL FIX: Setting UI mode to SCHEDULING_FORM for scheduleMeeting agent");
        
        // If we have a selected property from the previous agent, use it
        if (selectedProperty) {
          console.log(`[handleServerEvent] Using selected property for scheduling: ${selectedProperty.name}`);
          setShowTimeSlots(true);
          setActiveDisplayMode('SCHEDULING_FORM');
        } else {
          // Check if we need to initialize with a default property
          const metadata = agentMetadata as any;
          if (metadata?.property_id_to_schedule) {
            console.log(`[handleServerEvent] Creating default property from metadata: ${metadata.property_id_to_schedule}`);
            // Create a minimal property object
            setSelectedProperty({
              id: metadata.property_id_to_schedule,
              name: metadata.property_name || "Selected Property",
              price: "Contact for pricing",
              area: "Available on request",
              description: "Schedule a visit to see this property in person.",
              mainImage: "/placeholder.svg"
            });
            setShowTimeSlots(true);
            setActiveDisplayMode('SCHEDULING_FORM');
          }
        }
      }
    }

    // Filter out trigger messages from being displayed in the transcript
    if (serverEvent.type === "conversation.item.created" && 
        serverEvent.item?.role === 'user' && 
        serverEvent.item?.content?.[0]?.text && 
        typeof serverEvent.item.content[0].text === 'string' &&
        (
            serverEvent.item.content[0].text.startsWith('{Trigger msg:') ||
            serverEvent.item.content[0].text === "Show the booking confirmation page" ||
            serverEvent.item.content[0].text === "TRIGGER_BOOKING_CONFIRMATION"
        )
    ) {
      
      console.log("[handleServerEvent] Filtering out trigger/system message from transcript:", serverEvent.item.content[0].text);
      
      // Special handling for SPEAK triggers - let them pass through to the agent but don't show in transcript
      const messageText = serverEvent.item.content[0].text;
      if (messageText.startsWith('{Trigger msg: Say ')) {
        console.log("[handleServerEvent] SPEAK trigger detected - allowing agent processing but hiding from transcript");
        // Don't return here - let the message continue to be processed by the agent
        // The agent will receive this message and speak it, but it won't appear in the visible transcript
        // We'll just skip adding it to the transcript by not calling addTranscriptMessage
      } else if (messageText === "TRIGGER_BOOKING_CONFIRMATION") {
        console.log("[handleServerEvent] TRIGGER_BOOKING_CONFIRMATION detected - allowing agent processing but hiding from transcript");
        // Don't return here - let the message continue to be processed by the agent
        // The agent will receive this message and call completeScheduling, but it won't appear in the visible transcript
      } else {
        // For other trigger messages, completely filter them out
        return; // Don't process this event further
      }
    }

    // --- Handle Function Call Output --- 
    if (
      serverEvent.type === "conversation.item.created" &&
      serverEvent.item?.type === "function_call_output"
    ) {
        const functionOutputItem = serverEvent.item as any;
        const functionName = functionOutputItem.name;

        console.log(`🔧 [TOOL EXECUTED] ${selectedAgentName.toUpperCase()} executed: ${functionName}`);
        
        // Special case: when initiating scheduling, clear previous agent messages
        if (functionName === "initiateScheduling") {
          console.log(`🔄 [SCHEDULING] ${selectedAgentName.toUpperCase()}: Detected initiateScheduling, clearing last agent message`);
          setLastAgentTextMessage(null);
        }

        // Handle getProjectDetails
        if (functionName === "getProjectDetails") {
            console.log("[handleServerEvent] Detected function_call_output item for getProjectDetails.");
            // Only process if propertyListData is currently null AND we're not already loading properties
            if (!propertyListData && !isLoadingProperties) {
                const outputString = functionOutputItem?.output;
                const itemId = functionOutputItem?.id;
                if (outputString) {
                    try {
                        const outputData = JSON.parse(outputString);
                        if (outputData.properties && Array.isArray(outputData.properties)) {
                            // First set loading flag to prevent duplicate calls  
                            setIsLoadingProperties(true);
                            
                            // Process properties (map to PropertyProps) - Copy existing mapping logic here
                            const formattedProperties = outputData.properties.map((property: any) => {
                                // Edge function returns data in a different format than our components expect
                                // Process the images array into mainImage and galleryImages format
                                let mainImage = "/placeholder.svg";
                                let galleryImages: PropertyImage[] = [];
                                
                                if (property.images && Array.isArray(property.images) && property.images.length > 0) {
                                    if (property.images[0].url) mainImage = property.images[0].url;
                                    if (property.images.length > 1) galleryImages = property.images.slice(1).map((img: any) => ({ url: img.url, alt: img.alt || `${property.name} image`, description: img.description || "" }));
                                }
                                const amenitiesArray = Array.isArray(property.amenities) ? property.amenities.map((amenity: any) => (typeof amenity === 'string' ? { name: amenity } : amenity)) : [];
                                const unitsArray = Array.isArray(property.units) ? property.units.map((unit: any) => (typeof unit === 'string' ? { type: unit } : unit)) : [];

                                return {
                                    id: property.id || generateSafeId(),
                                    name: property.name || "Property",
                                    price: property.price || "Price unavailable",
                                    area: property.area || "Area unavailable",
                                    mainImage: mainImage,
                                    location: { city: property.location?.city || "Location unavailable", mapUrl: property.location?.mapUrl || "", coords: property.location?.coords || "" },
                                    galleryImages: galleryImages,
                                    units: unitsArray,
                                    amenities: amenitiesArray,
                                    description: property.description || "No description available",
                                    websiteUrl: property.websiteUrl || "",
                                    brochure: property.brochure || ""
                                };
                            });
                            console.log("[handleServerEvent] Formatted properties:", formattedProperties);
                            setPropertyListData(formattedProperties);
                            const propertyCount = formattedProperties.length;
                            const messageText = propertyCount > 0 ? `Here ${propertyCount === 1 ? 'is' : 'are'} ${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'} I found.` : "I couldn't find any properties matching your request.";
                            const newItemId = itemId || generateSafeId();
                            addTranscriptMessage(newItemId, 'assistant', messageText, formattedProperties); // Add message AFTER setting state
                            updateTranscriptItemStatus(newItemId, 'DONE');
                            propertiesHandledLocally = true;
                            
                            // Clear loading flag after processing
                            setIsLoadingProperties(false);
                        } else {
                            console.log("[handleServerEvent] Parsed function output, but 'properties' array not found or not an array.");
                        }
                    } catch (e) {
                        console.warn("[handleServerEvent] Error parsing getProjectDetails output:", e, outputString);
                        // Clear loading flag in case of error
                        setIsLoadingProperties(false);
                    }
                } else {
                    console.log("[handleServerEvent] getProjectDetails function_call_output item has no output string.");
                }
            } else {
                console.log("[handleServerEvent] propertyListData already exists or properties are being loaded, skipping processing for getProjectDetails output.");
                propertiesHandledLocally = true; // Mark as handled to prevent hook processing
            }
        } else if (functionName === "getAvailableSlots") {
            console.log("[handleServerEvent] Detected function_call_output for getAvailableSlots.");
            // Clear any previous messages from other agents when showing scheduling form
            setLastAgentTextMessage(null);
            
            const outputString = functionOutputItem.output;
            if (outputString) {
                try {
                    const outputData = JSON.parse(outputString);
                    if (outputData.slots) {
                        console.log("[UI] Received slots:", outputData.slots);
                        setAvailableSlots(outputData.slots); // Set the received slots
                        
                        // Get verification status
                        const isVerified = outputData.user_verification_status === "verified";
                        console.log(`[UI] User verification status: ${isVerified ? 'verified' : 'unverified'}`);
                        
                        // If we don't have a selectedProperty yet, create a better one
                        if (!selectedProperty && outputData.property_id) {
                            // Use property name from response if available, otherwise use a generic name
                            const propertyName = outputData.property_name || "Selected Property";
                            console.log(`[UI] Creating property with ID: ${outputData.property_id}, name: ${propertyName}`);
                            
                            setSelectedProperty({
                                id: outputData.property_id,
                                name: propertyName,
                                // Add more data to make it look complete
                                price: "Contact for pricing",
                                area: "Available on request",
                                description: `Schedule a visit to see ${propertyName} in person.`,
                                mainImage: "/placeholder.svg" // Use a default image
                            });
                        }
                        
                        // Always show time slots when we get them
                        console.log("[UI] Setting showTimeSlots to TRUE");
                        setShowTimeSlots(true);
                        
                        // CRITICAL FIX: Set the display mode to SCHEDULING_FORM to ensure the UI shows the form
                        console.log("[UI] CRITICAL: Setting activeDisplayMode to SCHEDULING_FORM");
                        setActiveDisplayMode('SCHEDULING_FORM');
                        
                        // Log UI state for debugging
                        console.log("[UI] Current state check - activeDisplayMode:", 'SCHEDULING_FORM', 
                            "showTimeSlots:", true, 
                            "selectedProperty:", selectedProperty || outputData.property_id);
                        
                        // Set verification screen state based on verification status
                        // We'll show this later when the user selects a time
                        setShowVerificationScreen(!isVerified);
                        
                        // Play the message from the agent that came with the slots
                        if (outputData.message) {
                            console.log(`[UI] Slots message from agent: ${outputData.message}`);
                            // Add an explicit scheduling agent message
                            addTranscriptMessage(generateSafeId(), 'assistant', `[Scheduler] ${outputData.message}`);
                            // The LLM response will include this message, so we don't need to add it to transcript here
                        }
                        
                        // CRITICAL ADDITIONAL CHECK: Make sure the TimePick component will actually be displayed
                        if (activeDisplayMode !== 'SCHEDULING_FORM' || !showTimeSlots || !selectedProperty) {
                            console.log("[UI] ⚠️ WARNING: TimePick component might not be displayed. Forcing display.");
                            
                            // Force these settings to ensure the component is displayed
                            if (!selectedProperty && outputData.property_id) {
                                const propertyName = outputData.property_name || "Selected Property";
                                setSelectedProperty({
                                    id: outputData.property_id,
                                    name: propertyName,
                                    price: "Contact for pricing",
                                    area: "Available on request",
                                    description: `Schedule a visit to see ${propertyName} in person.`,
                                    mainImage: "/placeholder.svg"
                                });
                            } else if (!selectedProperty) {
                                // Create a minimal default property if none exists and none in outputData
                                const metadata = agentMetadata as any;
                                const propertyName = metadata?.property_name || outputData.property_name || "Selected Property";
                                const propertyId = metadata?.property_id_to_schedule || outputData.property_id || "default-property";
                                
                                setSelectedProperty({
                                    id: propertyId,
                                    name: propertyName,
                                    price: "Contact for pricing",
                                    area: "Available on request",
                                    description: `Schedule a visit to see ${propertyName} in person.`,
                                    mainImage: "/placeholder.svg"
                                });
                            }
                            
                            // Force these settings again
                            setShowTimeSlots(true);
                            setActiveDisplayMode('SCHEDULING_FORM');
                            
                            // Force a re-render by triggering a state update on a dummy state if necessary
                            // This is a last resort and should be used carefully
                            // setInputVisible(iv => !iv); // Toggle and immediately toggle back
                            // setTimeout(() => setInputVisible(iv => !iv), 10);
                        }
                        
                        propertiesHandledLocally = true; // Mark as handled
                    } else {
                        console.error("[handleServerEvent] getAvailableSlots response has no slots data!");
                        
                        // Try to recover even without slots data
                        if (outputData.property_id || outputData.property_name) {
                            console.log("[UI] Creating fallback slots with default times");
                            // Create some default slots
                            const defaultSlots: Record<string, string[]> = {};
                            const today = new Date();
                            const tomorrow = new Date(today);
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            
                            // Format dates as strings
                            const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
                            const todayStr = today.toLocaleDateString('en-US', dateOptions);
                            const tomorrowStr = tomorrow.toLocaleDateString('en-US', dateOptions);
                            
                            defaultSlots[todayStr] = ["11:00 AM", "4:00 PM"];
                            defaultSlots[tomorrowStr] = ["11:00 AM", "4:00 PM"];
                            
                            setAvailableSlots(defaultSlots);
                            
                            // Create a property if needed
                            if (!selectedProperty) {
                                const propertyName = outputData.property_name || "Selected Property";
                                setSelectedProperty({
                                    id: outputData.property_id || "default-property",
                                    name: propertyName,
                                    price: "Contact for pricing",
                                    area: "Available on request",
                                    description: `Schedule a visit to see ${propertyName} in person.`,
                                    mainImage: "/placeholder.svg"
                                });
                            }
                            
                            // Force UI mode
                            setShowTimeSlots(true);
                            setActiveDisplayMode('SCHEDULING_FORM');
                            
                            propertiesHandledLocally = true;
                        }
                    }
                } catch (e) {
                    console.error("[handleServerEvent] Error parsing getAvailableSlots output:", e);
                    
                    // Try to recover from parsing error
                    if (selectedAgentName === "scheduleMeeting") {
                        console.log("[UI] Creating emergency fallback slots after parse error");
                        
                        // Create some default slots
                        const defaultSlots: Record<string, string[]> = {};
                        const today = new Date();
                        const tomorrow = new Date(today);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        
                        // Format dates as strings
                        const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
                        const todayStr = today.toLocaleDateString('en-US', dateOptions);
                        const tomorrowStr = tomorrow.toLocaleDateString('en-US', dateOptions);
                        
                        defaultSlots[todayStr] = ["11:00 AM", "4:00 PM"];
                        defaultSlots[tomorrowStr] = ["11:00 AM", "4:00 PM"];
                        
                        setAvailableSlots(defaultSlots);
                        
                        // Create a property if needed
                        if (!selectedProperty) {
                            const metadata = agentMetadata as any;
                            const propertyName = metadata?.property_name || "Selected Property";
                            const propertyId = metadata?.property_id_to_schedule || "default-property";
                            
                            setSelectedProperty({
                                id: propertyId,
                                name: propertyName,
                                price: "Contact for pricing",
                                area: "Available on request",
                                description: `Schedule a visit to see ${propertyName} in person.`,
                                mainImage: "/placeholder.svg"
                            });
                        }
                        
                        // Force UI mode
                        setShowTimeSlots(true);
                        setActiveDisplayMode('SCHEDULING_FORM');
                        
                        propertiesHandledLocally = true;
                    }
                }
            }
        } else if (functionName === "scheduleVisit") {
            console.log("[handleServerEvent] Detected function_call_output for scheduleVisit.");
            const outputString = functionOutputItem.output;
            if (outputString) {
                try {
                    const outputData = JSON.parse(outputString);
                    // The UI flow is handled within TimePick/BookingConfirmation/AppointmentConfirmed
                    // We just need to know if it was successful to potentially hide the picker if it's still open
                    if (outputData.success === true || outputData.booking_confirmed === true) {
                        console.log("[UI] Booking successful reported by agent.");
                        setShowTimeSlots(false); // Hide slots if booking is done
                        
                        // Add explicit scheduling confirmation message
                        if (outputData.message) {
                            addTranscriptMessage(generateSafeId(), 'assistant', `[Scheduler] ${outputData.message}`);
                        } else {
                            addTranscriptMessage(generateSafeId(), 'assistant', `[Scheduler] Your visit has been scheduled!`);
                        }
                        
                        propertiesHandledLocally = true;
                    } else if (outputData.error) {
                        // Maybe show an error message?
                        console.error("[UI] Agent reported scheduling error:", outputData.error);
                        setShowTimeSlots(false); // Hide slots on error too
                        // Optionally add error message to transcript
                        addTranscriptMessage(generateSafeId(), 'system', `Scheduling Error: ${outputData.error}`);
                        propertiesHandledLocally = true;
                    }
                } catch (e) {
                    console.warn("[handleServerEvent] Error parsing scheduleVisit output:", e);
                }
            }
        }

        // Add handling for completeScheduling function
        if (functionName === "completeScheduling") {
            console.log("[handleServerEvent] Detected function_call_output for completeScheduling.");
            const outputString = functionOutputItem.output;
            if (outputString) {
                try {
                    const outputData = JSON.parse(outputString);
                    if (outputData.booking_details) {
                        console.log("[handleServerEvent] Setting booking details:", outputData.booking_details);
                        setBookingDetails(outputData.booking_details);
                        
                        if (outputData.ui_display_hint === 'BOOKING_CONFIRMATION') {
                            console.log("[handleServerEvent] Setting display mode to BOOKING_CONFIRMATION");
                            setActiveDisplayMode('BOOKING_CONFIRMATION');
                            
                            // Add an explicit confirmation message
                            if (outputData.message) {
                                addTranscriptMessage(generateSafeId(), 'assistant', outputData.message);
                            }
                        }
                        propertiesHandledLocally = true; // Mark as handled
                    }
                } catch (e) {
                    console.error("[handleServerEvent] Error parsing completeScheduling output:", e);
                }
            }
        }
    }
    
    // We've removed the problematic response.done handler
    // Now handling property data directly from conversation.item.created events
    
    // --- Handle Regular Assistant Message ---
    if (!propertiesHandledLocally && serverEvent.type === "conversation.item.created" && serverEvent.item?.role === 'assistant') {
         let text = serverEvent.item?.content?.[0]?.text ?? serverEvent.item?.content?.[0]?.transcript ?? "";
         const itemId = serverEvent.item?.id;
         if (itemId && text) {
            // 🚨 COMPREHENSIVE AGENT RESPONSE LOGGING - CHAT.TSX SIDE
            const itemStatus = serverEvent.item?.status;
            const isComplete = itemStatus === "done" || itemStatus === "completed" || (serverEvent.item as any)?.done === true;
            
            if (isComplete) {
              console.log(`🎤 [${selectedAgentName.toUpperCase()} SPOKE COMPLETE]: "${text}"`);
              console.log(`🗣️ [AGENT FINAL] ${selectedAgentName.toUpperCase()}: Full message logged above`);
              console.log(`📝 [AGENT SUMMARY] Agent: ${selectedAgentName} | Status: ${itemStatus} | Length: ${text.length} chars | ItemID: ${itemId.substring(0, 8)}...`);
            } else {
              console.log(`🎤 [${selectedAgentName.toUpperCase()} SPEAKING]: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
              console.log(`📝 [AGENT PROGRESS] Agent: ${selectedAgentName} | Status: ${itemStatus} | Current length: ${text.length} chars`);
            }
            
            // Use a prefix to identify which agent sent the message
            const agentPrefix = activeDisplayMode === 'SCHEDULING_FORM' ? '[Scheduler] ' : 
                               selectedAgentName === 'authentication' ? '[Auth] ' : '';
            
            // Special case handling for scheduling agent messages
            if (selectedAgentName === 'scheduleMeeting') {
              // Filter out premature scheduling confirmations before time selection is complete
              if (!selectedTime && text.toLowerCase().includes('confirm') && 
                  (text.toLowerCase().includes('visit') || text.toLowerCase().includes('schedule'))) {
                console.log(`🚫 [AGENT FILTER] ${selectedAgentName.toUpperCase()}: Filtering premature scheduling confirmation message`);
                assistantMessageHandledLocally = true; // Skip adding this message
                return;
              }
              
              // Filter out repeat date selection prompts if we already have date selected
              if (selectedDay && text.toLowerCase().includes('select a date') && 
                  text.toLowerCase().includes('calendar')) {
                console.log(`🚫 [AGENT FILTER] ${selectedAgentName.toUpperCase()}: Filtering repeat date selection prompt (date already selected)`);
                assistantMessageHandledLocally = true; // Skip adding this message
                return;
              }
            }
            
            // If we're transitioning between agents, make it clear in the conversation
            if (prevAgentNameRef.current && prevAgentNameRef.current !== selectedAgentName) {
              // Only for the first message from a new agent
              const isFirstMessageFromAgent = !(transcriptItems.some(item => 
                item.type === 'MESSAGE' && item.role === 'assistant' && 
                item.agentName === selectedAgentName));
                
              if (isFirstMessageFromAgent) {
                console.log(`🔄 [AGENT SWITCH] First message from new agent: ${selectedAgentName.toUpperCase()}`);
                addTranscriptMessage(
                  generateSafeId(),
                  'system',
                  `--- ${selectedAgentName === 'scheduleMeeting' ? 'Scheduling Assistant' : 
                     selectedAgentName === 'authentication' ? 'Authentication' : 
                     'Property Assistant'} ---`
                );
              }
            }
            
            // Add message to transcript with agent prefix
            addTranscriptMessage(itemId, 'assistant', agentPrefix + text, undefined, selectedAgentName);
            assistantMessageHandledLocally = true; // Mark that an assistant message was added
         } else {
            //  console.log("[handleServerEvent] Skipping assistant conversation.item.created event (no itemId or text).");
         }
     }

    // Forward other events, but skip getProjectDetails function_call_output to avoid overriding UI-loaded data
    const isGetProjectDetailsOutput =
      serverEvent.type === 'conversation.item.created' &&
      serverEvent.item?.type === 'function_call_output' &&
      (serverEvent.item as any).name === 'getProjectDetails';
    if (!isGetProjectDetailsOutput && !propertiesHandledLocally) {
      // console.log(`[handleServerEvent] Passing event ${serverEvent.type} to original hook handler.`);
      handleServerEventRefFromHook.current(serverEvent);
    }

  }, [
      addTranscriptMessage, 
      updateTranscriptItemStatus, 
      handleServerEventRefFromHook,
      generateSafeId,
      propertyListData,
      isLoadingProperties,
      setIsLoadingProperties,
      selectedAgentName, // Add the current agent name to dependencies
      selectedProperty, // Add selectedProperty to dependencies
      setSelectedProperty, // Add property setter to dependencies
      selectedTime, // Add selectedTime to dependencies
      selectedDay, // Add selectedDay to dependencies
      prevAgentNameRef,
      transcriptItems,
      setBookingDetails, // Add this new dependency
    ]);

  // Ref part remains the same
  const localHandleServerEventRef = useRef(handleServerEvent);
  useEffect(() => {
     localHandleServerEventRef.current = handleServerEvent;
  }, [handleServerEvent]);

  // --- Fetch Org Metadata (Modified) --- 
  const fetchOrgMetadata = useCallback(async () => {
      // Use the chatbotId passed via props
      if (!selectedAgentConfigSet || !chatbotId) {
           console.warn("[Metadata] Agent config set or chatbotId missing.");
           if (!chatbotId) addTranscriptMessage(generateSafeId(), 'system', 'Configuration Error: Chatbot ID missing.');
           return;
      }
      console.log("[Metadata] Attempting to fetch org metadata...");
      
      const agentWithFetch = selectedAgentConfigSet.find(a => a.toolLogic?.fetchOrgMetadata);
      const fetchTool = agentWithFetch?.toolLogic?.fetchOrgMetadata;

      if (fetchTool) {
          try {
              // Use the existing session ID from metadata state
              const sessionId = agentMetadata?.session_id || generateSafeId(); // Fallback if metadata not set yet
              
              console.log(`[Metadata] Calling fetch tool with session: ${sessionId}, chatbot: ${chatbotId}`);
              const result = await fetchTool({ session_id: sessionId, chatbot_id: chatbotId }, transcriptItems);
              console.log("[Metadata] fetchOrgMetadata result:", result);
              
              if (result && !result.error) {
                  // Update agent metadata state, ensuring session_id and chatbot_id are preserved/set
                  setAgentMetadata(prev => ({ ...(prev || {}), ...result, session_id: sessionId, chatbot_id: chatbotId })); 
                  addTranscriptMessage(generateSafeId(), 'system', 'Agent context updated.');
              } else {
                   addTranscriptMessage(generateSafeId(), 'system', `Error fetching agent context: ${result?.error || 'Unknown error'}`);
                   // Ensure metadata has session/chatbot ID even if fetch fails
                   setAgentMetadata(prev => ({ ...(prev || {}), session_id: sessionId, chatbot_id: chatbotId }));
              }
          } catch (error: any) {
              console.error("[Metadata] Error executing fetchOrgMetadata:", error);
               addTranscriptMessage(generateSafeId(), 'system', `Error fetching agent context: ${error.message}`);
               // Ensure metadata has session/chatbot ID on exception
                const sessionId = agentMetadata?.session_id || generateSafeId();
                setAgentMetadata(prev => ({ ...(prev || {}), session_id: sessionId, chatbot_id: chatbotId }));
          }
      } else {
          console.warn("[Metadata] No agent found with fetchOrgMetadata tool.");
           addTranscriptMessage(generateSafeId(), 'system', 'Agent configuration error: Metadata fetch tool missing.');
      }
  }, [selectedAgentConfigSet, chatbotId, agentMetadata?.session_id, addTranscriptMessage, transcriptItems]); // Add transcriptItems dependency

  // --- Session Update Logic --- 
   const updateSession = useCallback(async (shouldTriggerResponse: boolean = false) => {
       if (sessionStatus !== 'CONNECTED' || !selectedAgentConfigSet || !dcRef.current) {
          //  console.log("[Update Session] Cannot update, not connected or config missing.");
           return;
       }
       
       const currentAgent = selectedAgentConfigSet.find(a => a.name === selectedAgentName);
       if (!currentAgent) {
           console.error(`[Update Session] Agent config not found for: ${selectedAgentName}`);
           return;
       }
       
       // Ensure agent metadata state is merged into the agent config before sending
       if (agentMetadata) {
            currentAgent.metadata = { ...(currentAgent.metadata || {}), ...agentMetadata };
            // CRITICAL: Add selected language to metadata
            currentAgent.metadata.language = selectedLanguage;
       } else {
            // If agentMetadata is still null, ensure chatbotId is present
             currentAgent.metadata = { 
                 ...(currentAgent.metadata || {}), 
                 chatbot_id: chatbotId, 
                 session_id: generateSafeId(),
                 language: selectedLanguage
             };
             console.warn("[Update Session] agentMetadata state was null, initializing from props/new session.")
       }

       // CRITICAL: Update agent metadata state to include language for future transfers
       setAgentMetadata(prev => ({
           ...(prev || {}),
           ...currentAgent.metadata,
           language: selectedLanguage
       }));

       console.log(`[Update Session] Updating server session for agent: ${selectedAgentName}, language: ${selectedLanguage}`);

       // Prepare instructions, dynamically updating them with current language
       let instructions = currentAgent.instructions;
       
               // Dynamic instruction generation for all agents
        if (currentAgent.name === 'realEstate') {
             // For realEstate agent, call its exported getInstructions function
             try {
                 const { getInstructions } = await import('@/agentConfigs/realEstate/realEstateAgent');
                 instructions = getInstructions(currentAgent.metadata);
                 console.log("[Update Session] Dynamic instructions applied for realEstate agent with language:", selectedLanguage);
             } catch (e) {
                 console.error("[Update Session] Error loading realEstate agent for dynamic instructions:", e);
                 // Fallback: manually update language in instructions
                 instructions = instructions.replace(/Respond ONLY in \$\{.*?\}\./, `Respond ONLY in ${selectedLanguage}.`);
             }
        } else if (currentAgent.name === 'authentication') {
             // For authentication agent, update instructions with current language
             try {
                 const { getAuthInstructions } = await import('@/agentConfigs/realEstate/authentication');
                 
                 // CRITICAL: Preserve flow_context and related metadata from the current agent
                 // This ensures the authentication agent gets the correct welcome message
                 const extendedMetadata = currentAgent.metadata as ExtendedAgentMetadata;
                 const metadataForInstructions = {
                     ...currentAgent.metadata,
                     // Make sure these critical fields are preserved
                     flow_context: extendedMetadata?.flow_context,
                     pending_question: extendedMetadata?.pending_question,
                     came_from: (currentAgent.metadata as any)?.came_from,
                 };
                 
                 console.log("🚨🚨🚨 [Update Session] Auth agent metadata for instructions:", {
                     flow_context: metadataForInstructions.flow_context,
                     pending_question: metadataForInstructions.pending_question,
                     came_from: metadataForInstructions.came_from,
                     customer_name: metadataForInstructions.customer_name
                 });
                 
                 instructions = getAuthInstructions(metadataForInstructions);
                 console.log("[Update Session] Dynamic instructions applied for authentication agent with language:", selectedLanguage);
             } catch (e) {
                 console.error("[Update Session] Error loading auth agent for dynamic instructions:", e);
                 // Fallback: manually update language in instructions
                 instructions = instructions.replace(/Respond ONLY in \$\{.*?\}\./, `Respond ONLY in ${selectedLanguage}.`);
             }
        } else if (currentAgent.name === 'scheduleMeeting') {
             // For scheduling agent, update instructions with current language
             try {
                 const { getScheduleMeetingInstructions } = await import('@/agentConfigs/realEstate/scheduleMeetingAgent');
                 instructions = getScheduleMeetingInstructions(currentAgent.metadata);
                 console.log("[Update Session] Dynamic instructions applied for scheduling agent with language:", selectedLanguage);
             } catch (e) {
                 console.error("[Update Session] Error loading schedule agent for dynamic instructions:", e);
                 // Fallback: manually update language in instructions
                 instructions = instructions.replace(/Respond ONLY in \$\{.*?\}\./, `Respond ONLY in ${selectedLanguage}.`);
             }
        } else {
             // Generic fallback for any other agents
             instructions = instructions.replace(/Respond ONLY in \$\{.*?\}\./, `Respond ONLY in ${selectedLanguage}.`);
             instructions = instructions.replace(/LANGUAGE: Respond ONLY in \$\{.*?\}\./, `LANGUAGE: Respond ONLY in ${selectedLanguage}.`);
        }

       // Map language names to ISO codes
       const languageMapping: Record<string, string> = {
           "English": "en",
           "Hindi": "hi",
           "Tamil": "ta",
           "Spanish": "es",
           "French": "fr",
           "German": "de",
           "Chinese": "zh",
           "Japanese": "ja",
           "Arabic": "ar",
           "Russian": "ru"
       };
       
       // Get the ISO language code for the selected language
       const languageCode = languageMapping[selectedLanguage] || "en";
       console.log(`[Update Session] Using language code: ${languageCode} for ${selectedLanguage}`);

       // Configure turn detection - Critical for automatic speech detection
       // This is what enables the microphone to automatically detect when user starts/stops speaking
       const turnDetection = !micMuted ? {
           type: "server_vad",
           threshold: 0.9, // Increased from 0.8 to 0.9 (higher = less sensitive to background noise)
           prefix_padding_ms: 250,
           silence_duration_ms: 800, // Increased from 400ms to 800ms (requires longer silence before ending turn)
           create_response: true,
       } : null;

       // Clear any existing audio buffer before updating
       sendClientEvent({ type: "input_audio_buffer.clear" }, "clear audio buffer on session update");

       // Prepare the session update payload - Mirroring oldCode/App.tsx structure
       const sessionUpdatePayload = {
            type: "session.update",
            session: {
                // Add fields from old code
                modalities: ["text", "audio"], // Enable audio
                instructions: instructions, // Use potentially updated instructions
                voice: "coral", // Default voice (adjust if needed)
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                input_audio_transcription: {
                    model: "whisper-1", // Default model (adjust if needed)
                    language: languageCode,
                },
                turn_detection: turnDetection, // Enable automatic voice detection
                tools: currentAgent.tools || [], // Include agent tools

                // DO NOT explicitly send metadata object here
                // Server should use session ID context
            },
        };

       sendClientEvent(sessionUpdatePayload, `(agent: ${selectedAgentName})`);

       // If shouldTriggerResponse is true, follow old code approach of sending simulated message
       if (shouldTriggerResponse) {
           console.log("[Update Session] Triggering initial response with simulated 'hi' message");
           
           // For authentication agent, set the VERIFICATION_FORM display mode first
           if (selectedAgentName === 'authentication') {
               // Set UI mode before sending the message, so it won't be overridden
               setActiveDisplayMode('VERIFICATION_FORM');
               console.log("[Update Session] Setting VERIFICATION_FORM display mode for authentication agent");
           }
           
           // Now send the simulated message to trigger the agent response
           sendSimulatedUserMessage("hi");
       }
   }, [sessionStatus, selectedAgentName, selectedAgentConfigSet, agentMetadata, chatbotId, sendClientEvent, selectedLanguage, setActiveDisplayMode]); // Removed micMuted from dependencies

  // Separate function to update session with current mic state (prevents recursion)
  const updateSessionMicState = useCallback(async () => {
    if (sessionStatus !== 'CONNECTED' || !selectedAgentConfigSet || !dcRef.current) {
      return;
    }
    
    const currentAgent = selectedAgentConfigSet.find(a => a.name === selectedAgentName);
    if (!currentAgent) {
      console.error(`[Update Mic Session] Agent config not found for: ${selectedAgentName}`);
      return;
    }

    // Configure turn detection based on current mic state
    const turnDetection = !micMuted ? {
      type: "server_vad",
      threshold: 0.9, // Increased from 0.8 to 0.9 (higher = less sensitive to background noise)
      prefix_padding_ms: 250,
      silence_duration_ms: 800, // Increased from 400ms to 800ms (requires longer silence before ending turn)
      create_response: true,
    } : null;

    console.log(`[Update Mic Session] Updating turn detection: ${turnDetection ? 'enabled' : 'disabled'}`);

    // Send only the turn detection update
    const sessionUpdatePayload = {
      type: "session.update",
      session: {
        turn_detection: turnDetection,
      },
    };

    sendClientEvent(sessionUpdatePayload, `(mic state update: ${micMuted ? 'muted' : 'unmuted'})`);
  }, [sessionStatus, selectedAgentConfigSet, selectedAgentName, dcRef, micMuted, sendClientEvent]);

  // Add the sendSimulatedUserMessage function to match old code
  const sendSimulatedUserMessage = useCallback((text: string) => {
      // Generate a truncated ID (32 chars max as required by API)
      const id = generateSafeId();
      
      // DO NOT add simulated message to transcript (it shouldn't be visible)
      // addTranscriptMessage(id, "user", text);

      // Send the message event
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
      );

      // After sending message, trigger response
      sendClientEvent(
          { type: "response.create" },
          "(trigger response after simulated user message)"
      );
  }, [sendClientEvent]);

  // --- Add Mic handling functions ---
  // Function to manually commit audio buffer (for use with mic button)
  const commitAudioBuffer = useCallback(() => {
      if (sessionStatus !== 'CONNECTED' || !dcRef.current) return;
      console.log("[Audio] Manually committing audio buffer");
      sendClientEvent({ type: "input_audio_buffer.commit" }, "manual commit");
      sendClientEvent({ type: "response.create" }, "trigger response after commit");
  }, [sessionStatus, sendClientEvent]);
  
  // Improved toggleMic function that properly controls the microphone
  const toggleMic = useCallback(() => {
    const turningOn = micMuted; // If currently muted, we are turning it on
    
    if (sessionStatus !== 'CONNECTED' || !dcRef.current) {
        console.log("[Audio] Cannot toggle microphone, not connected");
        return;
    }
    
    console.log(`[Audio] ${turningOn ? 'Enabling' : 'Disabling'} microphone`);
    setMicMuted(!micMuted);
    
    // Clear audio buffer when toggling
    if (turningOn && audioContext) {
      // If this is the first time enabling, perform additional setup
      setTimeout(() => {
        sendClientEvent({ type: "input_audio_buffer.clear" }, "clear buffer on mic enable");
      }, 200);
    }
  }, [micMuted, sessionStatus, dcRef, audioContext, sendClientEvent]);

  // Use useEffect to update session when micMuted changes to avoid closure issues
  useEffect(() => {
    if (sessionStatus === 'CONNECTED' && initialSessionSetupDoneRef.current) {
      console.log(`[Audio] Mic state changed to ${micMuted ? 'muted' : 'unmuted'}, updating session`);
      updateSessionMicState(); // Use the new function that doesn't cause recursion
    }
  }, [micMuted, sessionStatus, updateSessionMicState]);

  // Add effect to initialize audio context once connected
  useEffect(() => {
    if (sessionStatus === 'CONNECTED' && !audioContext) {
      try {
        // Create audio context when needed
        const newAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(newAudioContext);
        console.log("[Audio] Audio context initialized");
      } catch (e) {
        console.error("[Audio] Error initializing audio context:", e);
      }
    }
  }, [sessionStatus, audioContext]);

  // --- Connection Management --- 
  const connectToRealtime = useCallback(async () => {
    if (sessionStatus !== "DISCONNECTED") return;
    setSessionStatus("CONNECTING");
    setTranscriptItems([]); // Clear transcript on new connection
    addTranscriptMessage(generateSafeId(), 'system', 'Connecting...');

    try {
      console.log("Fetching ephemeral key from /api/session...");
      const tokenResponse = await fetch("/api/session", { method: "POST" });
      const data = await tokenResponse.json();

      // Check for the nested .value property
      if (!tokenResponse.ok || !data.client_secret?.value) { 
        console.error("Failed to get session token:", data);
         const errorMsg = data?.error || 'Could not get session token (missing client_secret.value)';
         addTranscriptMessage(generateSafeId(), 'system', `Connection failed: ${errorMsg}`);
        setSessionStatus("DISCONNECTED");
        return;
      }

      // Extract the actual key string from .value
      const EPHEMERAL_KEY = data.client_secret.value;
      console.log("Ephemeral key value received."); // Updated log message

      // Create audio element if it doesn't exist
      if (!audioElementRef.current) {
        audioElementRef.current = document.createElement("audio");
        // IMPORTANT: Set these properties for audio to work properly
        audioElementRef.current.autoplay = true;
        // Use correct TypeScript attribute name
        (audioElementRef.current as any).playsInline = true; // Type assertion to bypass TypeScript error
        // For debugging purposes, we can add it to the DOM with controls
        document.body.appendChild(audioElementRef.current);
        audioElementRef.current.style.display = 'none'; // Hide it but keep in DOM
        // audioElementRef.current.controls = true; // Enable for debugging
      }

      console.log("Creating Realtime Connection...");
      const { pc, dc } = await createRealtimeConnection(
        EPHEMERAL_KEY,
        audioElementRef
      );
      pcRef.current = pc;
      dcRef.current = dc;

      // --- Setup Data Channel Listeners ---
      dc.addEventListener("open", () => {
        console.log("Data Channel Opened");
        // Do NOT add a "Connection established" message here
        // Let the server event handler do it to avoid duplication
      });

      dc.addEventListener("close", () => {
        console.log("Data Channel Closed");
         addTranscriptMessage(generateSafeId(), 'system', 'Connection closed.');
        setSessionStatus("DISCONNECTED");
        // Clean up refs
        pcRef.current = null;
        dcRef.current = null;
      });

      dc.addEventListener("error", (err: any) => {
        console.error("Data Channel Error:", err);
         addTranscriptMessage(generateSafeId(), 'system', `Connection error: ${err?.message || 'Unknown DC error'}`);
        setSessionStatus("DISCONNECTED");
      });

      dc.addEventListener("message", (e: MessageEvent) => {
          try {
              const serverEvent: ServerEvent = JSON.parse(e.data);
              localHandleServerEventRef.current(serverEvent); // Use the local ref for the wrapped handler
          } catch (error) {
               console.error("Error parsing server event:", error, e.data);
          }
      });

    // Note: setSessionStatus("CONNECTED") is handled by the session.created event via the hook

    } catch (err: any) {
      console.error("Error connecting to realtime:", err);
       addTranscriptMessage(generateSafeId(), 'system', `Connection failed: ${err.message}`);
      setSessionStatus("DISCONNECTED");
    }
  }, [sessionStatus, addTranscriptMessage, localHandleServerEventRef]); // Update dependency here

  const disconnectFromRealtime = useCallback(() => {
    if (!pcRef.current) return;
    console.log("[Disconnect] Cleaning up WebRTC connection");
    addTranscriptMessage(generateSafeId(), 'system', 'Disconnecting...');

    // Reset the setup flag on disconnect
    initialSessionSetupDoneRef.current = false; 

    try {
      // Properly cleanup audio element
      if (audioElementRef.current) {
        audioElementRef.current.srcObject = null;
        audioElementRef.current.pause();
        // Remove from DOM if it was added
        if (audioElementRef.current.parentNode) {
          audioElementRef.current.parentNode.removeChild(audioElementRef.current);
        }
        audioElementRef.current = null;
      }

      // Cleanup WebRTC
      pcRef.current.getSenders().forEach((sender) => {
        sender.track?.stop();
      });
      pcRef.current.close();
    } catch (error) {
      console.error("[Disconnect] Error closing peer connection:", error);
    }

    // dcRef listener for 'close' should handle setting status and clearing refs
     if (dcRef.current && dcRef.current.readyState === 'open') {
         dcRef.current.close();
     } else {
        // If DC wasn't open or already closed, manually update state
         setSessionStatus("DISCONNECTED");
         pcRef.current = null;
         dcRef.current = null;
     }
     setAgentMetadata(null); // Clear metadata on disconnect
     // Don't clear transcript immediately, let user see history

  }, [addTranscriptMessage]); // Dependencies

  // --- Effects --- 

  // Effect to initialize agentMetadata when chatbotId is first available
  useEffect(() => {
      if (chatbotId && !agentMetadata) { // Only run if chatbotId is present and metadata is not yet set
          console.log(`[Effect] Initializing agentMetadata with chatbotId: ${chatbotId}`);
          setAgentMetadata({ 
              chatbot_id: chatbotId, 
              session_id: generateSafeId() // Generate a new session ID
          });
      }
  }, [chatbotId]); // Rerun only if chatbotId changes (should be stable after load)

  // Effect to fetch metadata and update session when connected or agent changes
  useEffect(() => {
      // Goal: Run fetchOrgMetadata and updateSession(true) *once* per connection/agent setup.

      // Condition: Connected, have config, have basic metadata (chatbotId/session_id)
      if (sessionStatus === 'CONNECTED' && selectedAgentConfigSet && agentMetadata) { 
          // Check if setup has already been done for this specific agent and connection instance
          if (!initialSessionSetupDoneRef.current) {
              console.log("[Effect] Connected & Setup Needed: Fetching metadata and updating session.");
              
              // Mark setup as *starting* immediately to prevent race conditions within this effect run
              // We'll set it back to false if fetch/update fails.
              initialSessionSetupDoneRef.current = true; 
              
              fetchOrgMetadata().then(() => {
                  // Check if still connected *after* async fetch completes
                  if (sessionStatus === 'CONNECTED') { 
                       // Determine if an initial response should be triggered by a simulated message
                       // Agents like 'scheduleMeeting' and 'authentication' trigger their own first actions
                       // (e.g., getAvailableSlots or a verification prompt) without needing a user message.
                       const agentAutoTriggersFirstAction = 
                           selectedAgentName === 'scheduleMeeting' || 
                           selectedAgentName === 'authentication';

                       // Check for different flow contexts
                       const isReturningToRealEstateAfterVerification = 
                           selectedAgentName === 'realEstate' &&
                           (agentMetadata as ExtendedAgentMetadata)?.flow_context === 'from_scheduling_verification';
                           
                       const isReturningToRealEstateAfterQuestionAuth = 
                           selectedAgentName === 'realEstate' &&
                           (agentMetadata as ExtendedAgentMetadata)?.flow_context === 'from_question_auth';

                       // Only send "hi" on true initial load (no flow context)
                       const isInitialAgentLoad = !(agentMetadata as ExtendedAgentMetadata)?.flow_context;

                       console.log(`🔍 [Effect] Flow context debug:`, {
                           agentName: selectedAgentName,
                           flow_context: (agentMetadata as ExtendedAgentMetadata)?.flow_context,
                           pending_question: (agentMetadata as ExtendedAgentMetadata)?.pending_question,
                           isReturningToRealEstateAfterQuestionAuth,
                           isInitialAgentLoad
                       });

                       const shouldSendSimulatedHi = !agentAutoTriggersFirstAction && 
                                                    !isReturningToRealEstateAfterVerification && 
                                                    !isReturningToRealEstateAfterQuestionAuth &&
                                                    isInitialAgentLoad;
                       
                       const shouldSendPendingQuestion = false; // DISABLED: Now handled automatically in useHandleServerEvent
                       // OLD: const shouldSendPendingQuestion = isReturningToRealEstateAfterQuestionAuth;

                       console.log(`[Effect] Updating session. Agent: ${selectedAgentName}, Auto-triggers: ${agentAutoTriggersFirstAction}, ReturningPostVerification: ${isReturningToRealEstateAfterVerification}, ReturningPostQuestionAuth: ${isReturningToRealEstateAfterQuestionAuth}, IsInitialLoad: ${isInitialAgentLoad}, Sending simulated 'hi': ${shouldSendSimulatedHi}, Sending pending question: ${shouldSendPendingQuestion}`);
                       
                       if (shouldSendPendingQuestion) {
                           const pendingQuestion = (agentMetadata as ExtendedAgentMetadata).pending_question;
                           console.log(`[Effect] Sending pending question after auth: "${pendingQuestion}"`);
                           updateSession(false); // Don't send "hi"
                           
                           // Send the pending question after a small delay to ensure session is updated
                           setTimeout(() => {
                               if (pendingQuestion) {
                                   sendSimulatedUserMessage(pendingQuestion);
                               }
                               
                               // Clear the pending question from metadata
                               setAgentMetadata(prev => ({
                                   ...prev,
                                   flow_context: undefined,
                                   pending_question: undefined
                               } as ExtendedAgentMetadata));
                           }, 500);
                       } else {
                           // CRITICAL: Don't send simulated "hi" if pending question will be sent by useHandleServerEvent
                                                  const willReceivePendingQuestion = isReturningToRealEstateAfterQuestionAuth;
                       const finalShouldSendHi = shouldSendSimulatedHi && !willReceivePendingQuestion;
                       
                       console.log(`[Effect] Final decision - sending simulated 'hi': ${finalShouldSendHi} (original: ${shouldSendSimulatedHi}, willReceivePending: ${willReceivePendingQuestion})`);
                       
                       // CRITICAL: Don't send simulated "hi" if we're showing verification success with a pending question
                       const isShowingVerificationSuccess = activeDisplayMode === 'VERIFICATION_SUCCESS' && willReceivePendingQuestion;
                       const finalFinalShouldSendHi = finalShouldSendHi && !isShowingVerificationSuccess;
                       
                       console.log(`[Effect] Final-final decision - sending simulated 'hi': ${finalFinalShouldSendHi} (verification success check: ${isShowingVerificationSuccess})`);
                       updateSession(finalFinalShouldSendHi);
                       }
                       
                       // Initialize mic state after session is updated (since mic starts unmuted)
                       setTimeout(() => {
                         updateSessionMicState();
                         console.log("[Effect] Mic state initialized for new session");
                       }, 500); // Small delay to ensure session update completes first
                       
                       // Mark setup truly complete *after* successful updateSession
                       // initialSessionSetupDoneRef.current = true; // Already set above
                       console.log("[Effect] Initial session setup complete.");
                  } else {
                       console.log("[Effect] Session disconnected after metadata fetch, aborting initial session update.");
                       initialSessionSetupDoneRef.current = false; // Reset flag if disconnected during fetch
                  }
              }).catch(error => {
                   console.error("[Effect] Error during initial fetchOrgMetadata or updateSession in effect:", error);
                   addTranscriptMessage(generateSafeId(), 'system', 'Error during initial setup.');
                   initialSessionSetupDoneRef.current = false; // Reset flag on error to allow retry if appropriate
              });
          } else {
               // This log confirms the ref is preventing re-runs for the *same* agent/connection.
              //  console.log("[Effect] Connected, but initial session setup already marked as done/in-progress.");
          }
      } else {
          // Log why the effect isn't running the setup
          if (sessionStatus !== 'CONNECTED') console.log("[Effect] Waiting for connection...");
          // else if (!selectedAgentConfigSet) console.log("[Effect] Waiting for agent config set...");
          // else if (!agentMetadata) console.log("[Effect] Waiting for initial agent metadata (chatbotId/session_id)...");
      }
      // Dependencies: 
      // - sessionStatus: Trigger when connected/disconnected.
      // - selectedAgentName: Trigger when agent changes (flag reset handled in separate effect).
      // - agentMetadata: Trigger *only* when the essential initial metadata (chatbotId/session_id) is first available.
      // - selectedAgentConfigSet: Ensure config is loaded.
      // Dependencies fetchOrgMetadata and updateSession are stable useCallback refs.
  }, [sessionStatus, selectedAgentName, agentMetadata?.chatbot_id, agentMetadata?.session_id, selectedAgentConfigSet, fetchOrgMetadata, updateSession, updateSessionMicState, addTranscriptMessage, activeDisplayMode]);

  // Separate effect to reset the setup flag when the agent name changes
  const previousAgentNameRef = useRef<string | null>(null);
  useEffect(() => {
      if (selectedAgentName !== previousAgentNameRef.current && previousAgentNameRef.current !== null) {
          const hasFlowContext = !!(agentMetadata as ExtendedAgentMetadata)?.flow_context;
          const isReturningFromAuth = previousAgentNameRef.current === 'authentication' && selectedAgentName === 'realEstate';
          const isFromQuestionAuth = (agentMetadata as ExtendedAgentMetadata)?.flow_context === 'from_question_auth';
          
          // Don't reset setup flag when returning from authentication with a pending question
          if (isReturningFromAuth && isFromQuestionAuth) {
              console.log(`[Effect] Agent changed from ${previousAgentNameRef.current} to ${selectedAgentName}. NOT resetting setup flag due to pending question flow.`);
          } else {
              console.log(`[Effect] Agent changed from ${previousAgentNameRef.current} to ${selectedAgentName}. Resetting setup flag.`);
              initialSessionSetupDoneRef.current = false;
              // The main effect above will then run the setup for the new agent.
          }
      }
      previousAgentNameRef.current = selectedAgentName;
  }, [selectedAgentName, agentMetadata]);

  // Effect to initialize properties when connected and metadata is available
  useEffect(() => {
    // Check if session is connected, metadata is loaded, and properties aren't already loaded
    // Add a new flag to prevent auto-loading on startup
    const shouldAutoLoadProperties = false; // Change to false to prevent immediate loading
    
    if (
      sessionStatus === 'CONNECTED' && 
      agentMetadata?.project_ids && 
      agentMetadata.project_ids.length > 0 && 
      !propertyListData && 
      !selectedPropertyDetails &&
      initialSessionSetupDoneRef.current && // Only after initial setup is complete
      shouldAutoLoadProperties // Only load if we explicitly want auto-loading
    ) {
      console.log("[Effect] Session connected with metadata, loading properties automatically");
      
      // Add a small delay to ensure everything is properly initialized
      const timer = setTimeout(() => {
        handleGetAllProperties();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [
    sessionStatus, 
    agentMetadata?.project_ids, 
    propertyListData, 
    selectedPropertyDetails, 
    handleGetAllProperties
  ]);

  // Effect for cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("[Cleanup] Component unmounting, disconnecting...");
      disconnectFromRealtime();
      // Clean up audio element if needed
       if (audioElementRef.current) {
           audioElementRef.current.srcObject = null;
           // Optional: remove from DOM if appended
           // audioElementRef.current.remove(); 
       }
    };
  }, [disconnectFromRealtime]);

   // Effect to scroll transcript to bottom
   useEffect(() => {
       // Scroll only if not showing details
       if (!selectedPropertyDetails) {
          transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
       }
   }, [transcriptItems, lastAgentTextMessage, propertyListData, selectedPropertyDetails]); // Scroll when relevant content changes

  // --- UI Handlers --- 
  const toggleInput = () => {
    setInputVisible(!inputVisible)
    if (!inputVisible) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 300)
    }
  }

  // Add useEffect to monitor agent changes and display the scheduling UI
  useEffect(() => {
    // Skip effect if there's no real change
    if (prevAgentNameRef.current === selectedAgentName) {
      return;
    }
    
    // Log the newly loaded agent and its current metadata from chat.tsx state
    console.log(`🎯 [AGENT ACTIVE] "${selectedAgentName.toUpperCase()}" is now the active agent`);
    console.log(`📋 [AGENT METADATA] Current agentMetadata:`, agentMetadata);
    
    const wasFromAuthentication = prevAgentNameRef.current === "authentication";
    
    // Clear last agent message when switching agents to avoid confusion
    setLastAgentTextMessage(null);

    if (selectedAgentName === "authentication") {
      console.log(`🔐 [AGENT SWITCH] Switched TO authentication agent from: ${prevAgentNameRef.current || 'initial'}`);
      setIsVerifying(true); // Show verification UI elements
      setShowTimeSlots(false); // Hide scheduling UI
      // Explicitly set VERIFICATION_FORM display mode when switching to authentication
      setActiveDisplayMode('VERIFICATION_FORM');
      console.log(`🖥️ [UI MODE] Setting VERIFICATION_FORM display mode for authentication agent`);
      
      // Do not reset OTP screen here as we want it to show after verification
      
      // Reset success message flag when entering authentication again
      hasShownSuccessMessageRef.current = false;
    } else if (selectedAgentName === "scheduleMeeting") {
      console.log(`📅 [AGENT SWITCH] Switched TO scheduleMeeting agent from: ${prevAgentNameRef.current || 'initial'}`);
      setIsVerifying(false); // Hide verification UI if switching *to* scheduling
      setShowOtpScreen(false); // Hide OTP screen when switching away from authentication
      
      // CRITICAL FIX: Ensure the UI is set up immediately when switching to scheduling agent
      console.log("[Agent Change] Setting SCHEDULING_FORM display mode for scheduleMeeting agent");
      setActiveDisplayMode('SCHEDULING_FORM');
      
      // Check if we need to set up a property for scheduling
      if (!selectedProperty) {
        const metadata = agentMetadata as any;
        // Use property_id_to_schedule if available
        if (metadata?.property_id_to_schedule) {
          const propertyName = metadata.property_name || "Selected Property";
          console.log(`[Agent Change] Creating property with ID: ${metadata.property_id_to_schedule}, name: ${propertyName}`);
          
          setSelectedProperty({
            id: metadata.property_id_to_schedule,
            name: propertyName,
            // Add more data to make it look complete
            price: "Contact for pricing",
            area: "Available on request",
            description: `Schedule a visit to see ${propertyName} in person.`,
            mainImage: "/placeholder.svg" // Use a default image
          });
        }
      }
      
      // Always enable time slots when switching to scheduling agent
      setShowTimeSlots(true);
    } else if (selectedAgentName === "realEstate") {
      console.log(`🏠 [AGENT SWITCH] Switched TO realEstate agent from: ${prevAgentNameRef.current || 'initial'}`);
      
      // Check if this is a transition from authentication agent AND we haven't shown the success message yet
      if (wasFromAuthentication && !hasShownSuccessMessageRef.current) {
        console.log(`✅ [AUTH SUCCESS] Transition from authentication to realEstate - showing verification success UI`);
        
        // Mark that we've shown the success message to prevent infinite loops
        hasShownSuccessMessageRef.current = true;
        
        // Set success flag and UI state for verification success display
        // The actual spoken confirmation will come from the realEstateAgent via the trigger from useHandleServerEvent
        setVerificationSuccessful(true);
        setShowVerificationSuccess(true); // This can be used if there's a separate UI element for it
        
        // Hide the success message UI after a few seconds (this is for the separate UI element if any)
        setTimeout(() => {
          setShowVerificationSuccess(false);
        }, 5000); 
        
        // REMOVED THE BLOCK THAT SENDS "Welcome back!" MESSAGE AND response.create
      }
      
      setIsVerifying(false); // Hide verification UI
      setShowOtpScreen(false); // Hide OTP screen
      setShowTimeSlots(false); // Hide scheduling UI
      setAvailableSlots({}); 
    }
    
    // Update previous agent ref for next transition
    prevAgentNameRef.current = selectedAgentName;
    
  }, [selectedAgentName, selectedProperty, agentMetadata, canCreateResponse, generateSafeId, addTranscriptMessage, sendClientEvent, setActiveDisplayMode, setLastAgentTextMessage, setIsVerifying, setShowTimeSlots, setShowOtpScreen, setSelectedProperty, setAvailableSlots, setVerificationSuccessful, setShowVerificationSuccess]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSend()
    }
  }

  // Call Button Handler
  const handleCallButtonClick = () => {
      if (sessionStatus === 'DISCONNECTED') {
          // Ensure chatbotId is available before connecting
           if (chatbotId) {
               connectToRealtime();
           } else {
               addTranscriptMessage(generateSafeId(), 'system', 'Cannot connect: Chatbot ID is missing.');
               console.error("Attempted to connect without a chatbotId.");
           }
      } else {
          disconnectFromRealtime();
      }
  };

  // Existing UI handlers (keep as is)
  const handleScheduleVisit = (property: PropertyProps) => {
    setShowProperties(false)
    setSelectedProperty(property)
    setAppointment(true)
    setSelectedTime(null) // Reset time selection
    setIsConfirmed(false) // Reset confirmation
    // TODO: Potentially trigger agent interaction here if needed
  }
  const handleTimeClick = (time: string) => {
    setSelectedTime(time)
  }
  const handleCloseConfirmation = () => {
    setSelectedTime(null)
    // Maybe reset appointment state?
    // setAppointment(false);
    // setSelectedProperty(null);
  }
  const handleConfirmBooking = () => {
    setIsConfirmed(true)
    // TODO: Potentially trigger agent interaction here to confirm
     // Example: addTranscriptMessage(uuidv4(), 'user', `Confirm booking for ${selectedProperty?.name} on ${selectedDay} at ${selectedTime}.`); sendClientEvent({type: "response.create"});
  }
  const handleReset = () => {
    setAppointment(false)
    setSelectedProperty(null)
    setSelectedTime(null)
    setIsConfirmed(false)
  }

  // --- Handle language selection and proceed to chat ---
  const handleLanguageSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedLanguage(e.target.value);
  };

  // Effect to update session when language changes (for live language switching)
  useEffect(() => {
    if (sessionStatus === 'CONNECTED' && !showIntro) {
      console.log(`[Language Change] Language changed to: ${selectedLanguage}, updating session`);
      // Update the session with new language setting
      updateSession(false);
    }
    // ESLint disable: updateSession is intentionally omitted to prevent infinite loop
    // since updateSession depends on selectedLanguage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage, sessionStatus, showIntro]);

  const handleProceed = () => {
    setShowIntro(false);
    
    // Connect to realtime service if not already connected
    if (sessionStatus === "DISCONNECTED") {
      connectToRealtime();
    }
  };

  // --- Render --- 
  // *** LOGGING POINT 5 ***
  // console.log("[Render] State before return:", { 
  //     sessionStatus, 
  //     showIntro, 
  //     lastAgentTextMessage: lastAgentTextMessage?.substring(0, 50) + '...', // Log snippet
  //     propertyListDataLength: propertyListData?.length, 
  //     selectedPropertyDetails: !!selectedPropertyDetails, 
  //     inputVisible, 
  //     micMuted 
  // });

  // console.log("[Render] TimePick and UI state:", {
  //   activeDisplayMode,
  //   showTimeSlots,
  //   hasSelectedProperty: !!selectedProperty,
  //   isVerifying,
  //   propertyId: selectedProperty?.id
  // });

  // Add handleTimeSlotSelection function to handle slot selection
  const handleTimeSlotSelection = useCallback((date: string, time: string) => {
    console.log(`[UI] User selected time slot: date=${date}, time=${time || 'none'}`);
    
    // Store the selected date in state (always), and time only if provided
    setSelectedDay(date);
    if (time) {
      setSelectedTime(time);
    }
    
    // First, find the current agent (should be scheduleMeeting)
    const schedulingAgent = selectedAgentConfigSet?.find(a => a.name === "scheduleMeeting");
    if (schedulingAgent && schedulingAgent.metadata) {
      // Save the selected date and time in agent metadata
      (schedulingAgent.metadata as any).selectedDate = date;
      
      // Only set selectedTime in metadata if actually provided
      if (time) {
        (schedulingAgent.metadata as any).selectedTime = time;
        console.log(`[UI] Saved date ${date} and time ${time} to agent metadata`);
      } else {
        console.log(`[UI] Saved only date ${date} to agent metadata (no time yet)`);
      }
    }

    // Add a delay to ensure we don't have race conditions with response processing
    setTimeout(() => {
      // Create different messages based on whether this is a date-only selection or date+time
      const userMessageId = generateSafeId();
      let selectionMessage;
      
      if (time) {
        selectionMessage = `Selected ${date} at ${time}.`; // Full date and time selection
        
        // The scheduling agent will automatically call scheduleVisit when it receives the time selection
        // No need for additional confirmation messages that could cause race conditions
      } else {
        selectionMessage = `Selected ${date}.`; // Date-only selection
      }
      
      // Stop any current response to avoid cancellation errors
      if (!canCreateResponse()) {
        console.log("[UI] Stopping any active response before sending selection");
        sendClientEvent({ type: "response.cancel" }, "(canceling before selection)");
        sendClientEvent({ type: "output_audio_buffer.clear" }, "(clearing audio buffer)");
        
        // Give the server time to process the cancellation
        setTimeout(() => {
          // Now safe to add message and create a new response
          addTranscriptMessage(userMessageId, 'user', selectionMessage);
          
          sendClientEvent(
            {
              type: "conversation.item.create",
              item: {
                id: userMessageId, type: "message", role: "user", 
                content: [{ type: "input_text", text: selectionMessage }]
              }
            },
            time ? "(time slot selection)" : "(date selection only)"
          );
          
          // Small delay before creating a response
          setTimeout(() => {
            sendClientEvent({ type: "response.create" }, "(trigger response after selection)");
          }, 150);
        }, 250);
      } else {
        // No active response, can proceed immediately
        addTranscriptMessage(userMessageId, 'user', selectionMessage);
        
        sendClientEvent(
          {
            type: "conversation.item.create",
            item: {
              id: userMessageId, type: "message", role: "user", 
              content: [{ type: "input_text", text: selectionMessage }]
            }
          },
          time ? "(time slot selection)" : "(date selection only)"
        );
        
        // Small delay before creating a response
        setTimeout(() => {
          sendClientEvent({ type: "response.create" }, "(trigger response after selection)");
        }, 100);
      }
    }, 100);

  }, [sendClientEvent, addTranscriptMessage, generateSafeId, selectedAgentConfigSet, canCreateResponse]);

  // Add verification submission handler
  const handleVerificationSubmit = useCallback((name: string, phone: string) => {
    console.log(`[UI] User submitted verification data: name=${name}, phone=${phone}`);
    
    // Store the verification data
    setVerificationData(prev => ({
      ...prev,
      name,
      phone
    }));
    
    // Simulate user sending contact details
    const userMessageId = generateSafeId();
    const detailsMessage = `My name is ${name} and my phone number is ${phone}.`;
    addTranscriptMessage(userMessageId, 'user', detailsMessage);
    
    sendClientEvent(
      {
        type: "conversation.item.create", 
        item: { id: userMessageId, type: "message", role: "user", content: [{ type: "input_text", text: detailsMessage }] }
      },
      "(user verification details)"
    );
    sendClientEvent({ type: "response.create" }, "(trigger response after details)");

    // Hide the verification form and show the OTP screen
    setIsVerifying(false);
    setShowOtpScreen(true);

  }, [sendClientEvent, addTranscriptMessage, generateSafeId]);

  // Add OTP submission handler
  const handleOtpSubmit = useCallback((otp: string) => {
    console.log(`[UI] User submitted OTP: ${otp}`);
    
    // Simulate user sending OTP
    const userMessageId = generateSafeId();
    const otpMessage = `My verification code is ${otp}.`;
    addTranscriptMessage(userMessageId, 'user', otpMessage);
    
    sendClientEvent(
      {
        type: "conversation.item.create", 
        item: { id: userMessageId, type: "message", role: "user", content: [{ type: "input_text", text: otpMessage }] }
      },
      "(user OTP submission)"
    );
    sendClientEvent({ type: "response.create" }, "(trigger response after OTP)");

    // Hide the OTP screen and show a temporary processing state
    setShowOtpScreen(false);
    addTranscriptMessage(generateSafeId(), 'system', 'Verifying your code...');
    
  }, [sendClientEvent, addTranscriptMessage, generateSafeId]);

  // Add handler for closing gallery - now sets display mode
  const handleCloseGallery = () => {
    setPropertyGalleryData(null);
    setActiveDisplayMode('CHAT'); // Or a more context-aware previous state
  }

  // Effect to monitor transcript for property-related queries
  useEffect(() => {
    // Only run if connected and there are transcript items but no properties loaded yet
    if (
      sessionStatus === 'CONNECTED' &&
      !propertyListData &&
      !selectedPropertyDetails &&
      !isLoadingProperties &&  // Add check for loading state to prevent duplicate calls
      initialSessionSetupDoneRef.current // Only after initial setup is complete
    ) {
      // Get the last user message - still need transcriptItems here!
      // Re-thinking: Removing transcriptItems dependency was wrong if we check the last message.
      // The core issue is re-triggering handleGetAllProperties which adds a message.
      // Let's keep transcriptItems dependency BUT prevent the loop inside.
      if (transcriptItems.length === 0) return; // Don't run if no transcript yet

      // Get the last user message
      const lastUserMessage = [...transcriptItems]
        .filter(item => item.type === 'MESSAGE' && item.role === 'user')
        .pop();
      
      if (lastUserMessage?.text) {
        const text = lastUserMessage.text.toLowerCase();
        
        // Skip if we've already processed this exact message
        if (lastPropertyQueryRef.current === lastUserMessage.itemId) {
          console.log("[Effect] Skipping already processed message:", text);
          return;
        }
        
        // Add a check to see if the last message was already processed by this effect
        // This requires storing the ID of the last processed message.
        // For now, a simpler check: Is the *very last* item in the transcript
        // one of the messages added BY handleGetAllProperties?
        const veryLastItem = transcriptItems[transcriptItems.length - 1];
        const isLoadingMessage = veryLastItem?.role === 'system' && veryLastItem?.text === 'Loading properties...';
        const isResultsMessage = veryLastItem?.role === 'assistant' && veryLastItem?.text?.includes('properties I found');
        const isErrorMessage = veryLastItem?.role === 'system' && veryLastItem?.text?.startsWith('Error loading properties');

        if (isLoadingMessage || isResultsMessage || isErrorMessage) {
           console.log("[Effect Check] Skipping keyword check as last message seems related to property loading.");
           return; // Don't re-run if the last message is from the loading process
        }
        
        // Check if it contains property-related keywords
        const propertyRelatedKeywords = [
          'property', 'properties', 'house', 'home', 'apartment', 'flat', 
          'real estate', 'housing', 'buy', 'purchase', 'rent', 'view', 'show me'
        ];
        
        const containsPropertyKeyword = propertyRelatedKeywords.some(keyword => 
          text.includes(keyword.toLowerCase())
        );
        
        if (containsPropertyKeyword) {
          console.log("[Effect] Detected property-related query in user message:", text);
          // Store this message's ID to avoid reprocessing
          lastPropertyQueryRef.current = lastUserMessage.itemId;
          // Load properties automatically when user asks about them
          handleGetAllProperties();
        }
      }
    }
  }, [
    transcriptItems, 
    sessionStatus, 
    propertyListData, 
    selectedPropertyDetails,
    isLoadingProperties, 
    handleGetAllProperties,
    initialSessionSetupDoneRef
  ]);

  // Add a helper function to send trigger messages
  const sendTriggerMessage = useCallback((triggerText: string) => {
    if (sessionStatus !== 'CONNECTED' || !dcRef.current) {
      console.log("[UI] Cannot send trigger message - not connected");
      return;
    }
    
    // Stop any current response first
    stopCurrentResponse(sendClientEvent);
    
    const triggerMessageId = generateSafeId();
    console.log(`[UI] Sending trigger message: "${triggerText}"`);
    
    // Send the trigger message (not added to visible transcript)
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
    );
    
    // Trigger agent response
    sendClientEvent({ type: "response.create" }, "(trigger response for UI trigger)");
  }, [sessionStatus, dcRef, sendClientEvent, stopCurrentResponse, generateSafeId]);

  // Track the last sent message batch
  const [lastSentMessageBatch, setLastSentMessageBatch] = useState<Record<string, boolean>>({});

  // Create a debounced function to update chat history
  const debouncedUpdateChatHistory = useCallback(
    debounce((chatHistory: TranscriptItem[]) => {
      if (!agentMetadata?.org_id || !agentMetadata?.session_id || !agentMetadata?.chatbot_id || !startTime) {
        console.log('[Chat History] Missing required metadata, skipping update');
        return;
      }

      // Find messages that haven't been sent yet
      const newMessages = chatHistory.filter(item => {
        // Skip system messages, empty messages, and transcribing messages
        if (item.role === 'system' || !item.text || item.text === '[Transcribing...]') {
          return false;
        }
        // Skip messages that have already been sent
        return !lastSentMessageBatch[item.itemId];
      });

      // If there are no new messages, skip the update
      if (newMessages.length === 0) {
        return;
      }

      console.log(`[Chat History] Sending ${newMessages.length} new messages to server`);

      // Update the last sent message batch
      const newBatch = { ...lastSentMessageBatch };
      newMessages.forEach(item => {
        newBatch[item.itemId] = true;
      });
      setLastSentMessageBatch(newBatch);

      // Make the API call
      const url = 'https://dashboard.propzing.in/functions/v1/update_agent_history';
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      };

      const body = JSON.stringify({
        org_id: agentMetadata?.org_id || '',
        chatbot_id: agentMetadata?.chatbot_id || '',
        session_id: agentMetadata?.session_id || '',
        phone_number: verificationData.phone || '',
        chat_history: newMessages.map(item => ({
          role: item.role,
          content: item.text,
          timestamp: new Date(item.createdAtMs).toISOString()
        })),
        start_time: startTime,
        end_time: new Date().toISOString()
      });

      fetch(url, {
        method: 'POST',
        headers,
        body
      })
        .then(response => response.json())
        .then(result => {
          console.log('[Chat History] Update result:', result);
        })
        .catch(error => {
          console.error('[Chat History] Error updating chat history:', error);
        });
    }, 1000), // Debounce for 1 second
    [agentMetadata, startTime, verificationData.phone, lastSentMessageBatch]
  );

  // Replace the updateChatHistory function and its useEffect with this one
  useEffect(() => {
    // Skip the update if there are no transcript items
    if (transcriptItems.length === 0) {
      return;
    }
    
    // Call the debounced function
    debouncedUpdateChatHistory(transcriptItems);
  }, [transcriptItems, debouncedUpdateChatHistory]);

  // Add an effect to clear the sent message batch when disconnecting
  useEffect(() => {
    if (sessionStatus === 'DISCONNECTED') {
      setLastSentMessageBatch({});
    }
  }, [sessionStatus]);

  // Add the useEffect to set start time on connection
  useEffect(() => {
    if (sessionStatus === 'CONNECTED' && !startTime) {
      setStartTime(new Date().toISOString());
    }
  }, [sessionStatus, startTime]);

  // NOTE: Pending question handling moved to useHandleServerEvent.ts for immediate processing

  // Effect to handle the display duration of BOOKING_CONFIRMATION
  // useEffect(() => {
  //   let timer: NodeJS.Timeout;
  //   if (activeDisplayMode === 'BOOKING_CONFIRMATION') {
  //     console.log("[UI Effect] BOOKING_CONFIRMATION active. Setting 5s timer to switch to CHAT.");
  //     timer = setTimeout(() => {
  //       console.log("[UI Effect] Timer expired for BOOKING_CONFIRMATION. Switching to CHAT mode.");
  //       setActiveDisplayMode('CHAT');
  //       // Optionally, send a trigger message to the agent here if a specific follow-up is desired
  //       // For example: sendTriggerMessage("{Trigger msg: Post-confirmation follow-up}");
  //     }, 5000); // 5 seconds
  //   }
  //   return () => {
  //     clearTimeout(timer); // Cleanup timer if component unmounts or mode changes
  //   };
  // }, [activeDisplayMode, setActiveDisplayMode /*, sendTriggerMessage */]); // Add sendTriggerMessage if used

  // Add a helper function to send a trigger message for scheduling confirmation
  const sendSchedulingConfirmationTrigger = useCallback(() => {
    if (sessionStatus !== 'CONNECTED' || !dcRef.current) {
      console.log("[UI] Cannot send scheduling confirmation trigger - not connected");
      return;
    }
    
    // Stop any current response first
    stopCurrentResponse(sendClientEvent);
    
    const triggerMessageId = generateSafeId();
    const confirmationTriggerText = "TRIGGER_BOOKING_CONFIRMATION";
    console.log(`[UI] Sending trigger message to realEstate agent: '${confirmationTriggerText}'`);
    
    // Send the trigger message (not added to visible transcript)
    sendClientEvent(
      {
        type: "conversation.item.create",
        item: {
          id: triggerMessageId,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: confirmationTriggerText }],
        },
      },
      "(UI trigger message for scheduling confirmation)"
    );
    
    // Trigger agent response
    sendClientEvent({ type: "response.create" }, "(trigger response for scheduling confirmation)");
  }, [sessionStatus, dcRef, sendClientEvent, stopCurrentResponse, generateSafeId]);

  // Call this function after successful verification to prompt the agent to confirm scheduling
  // REMOVED EFFECT START
  // useEffect(() => {
  //   if (verificationSuccessful) {
  //     sendSchedulingConfirmationTrigger();
  //   }
  // }, [verificationSuccessful, sendSchedulingConfirmationTrigger]);
  // REMOVED EFFECT END

  const handleCloseLocationMap = () => {
    setLocationMapData(null);
    setActiveDisplayMode('CHAT'); // Or a more context-aware previous state
  }

  const handleCloseBrochure = () => {
    setBrochureData(null);
    setActiveDisplayMode('CHAT'); // Or a more context-aware previous state
  }

  return (
    <div
      className="relative bg-blue-900 rounded-3xl overflow-hidden text-white flex flex-col"
      style={{ width: "329px", height: "611px" }}
    >
      {/* Header - Keep as is */}
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
                <defs>
                  <filter id="filter0_i_3978_26224" x="15.9833" y="12.687" width="0.766663" height="17.8005" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                    <feOffset dy="0.359141" />
                    <feGaussianBlur stdDeviation="0.17957" />
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                    <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                  </filter>
                  <filter id="filter1_i_3978_26224" x="16.2156" y="12.0161" width="10.3578" height="8.40162" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                    <feOffset dy="0.359141" />
                    <feGaussianBlur stdDeviation="0.17957" />
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                    <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                  </filter>
                  <filter id="filter2_i_3978_26224" x="25.7582" y="19.6826" width="0.766663" height="5.82154" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                    <feOffset dy="0.359141" />
                    <feGaussianBlur stdDeviation="0.17957" />
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                    <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                  </filter>
                  <filter id="filter3_i_3978_26224" x="20.9665" y="24.3789" width="5.55823" height="1.12574" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                    <feOffset dy="0.359141" />
                    <feGaussianBlur stdDeviation="0.17957" />
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                    <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                  </filter>
                  <filter id="filter4_i_3978_26224" x="20.9665" y="24.3779" width="0.766663" height="6.10914" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                    <feOffset dy="0.359141" />
                    <feGaussianBlur stdDeviation="0.17957" />
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                    <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                  </filter>
                </defs>
              </svg>
            </div>
          </div>
          <span className="font-medium">Real Estate AI Agent</span>
        </div>
        <button className="ml-auto p-2 hover:bg-blue-800 rounded-full">
          <X size={20} />
        </button>
      </div>
      
      {/* Intro Screen */}
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
          
          {/* Bottom buttons (decorative in intro) */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between items-center p-4 bg-blue-900">
            <button className="bg-[#47679D] p-3 rounded-full hover:bg-blue-600 transition-colors">
              <MessageSquare size={20} />
            </button>
            
            <div className="text-center">
              {/* Dots for decoration */}
              <div className="flex justify-center space-x-1">
                {Array(10).fill(0).map((_, i) => (
                  <div key={i} className="w-1 h-1 bg-white rounded-full opacity-50"></div>
                ))}
              </div>
            </div>
            
            <button className="bg-[#47679D] p-3 rounded-full hover:bg-blue-600 transition-colors">
              <Mic size={20} />
            </button>
            
            <button className="bg-red-500 p-3 rounded-full hover:bg-red-600 transition-colors">
              <Phone size={18} />
            </button>
          </div>
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

          {/* Back button for IMAGE_GALLERY */}
          {activeDisplayMode === 'IMAGE_GALLERY' && (
            <button
              onClick={handleCloseGallery}
              className="mb-2 ml-4 self-start bg-blue-700 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center shadow"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </button>
          )}

          {/* Back button for LOCATION_MAP */}
          {activeDisplayMode === 'LOCATION_MAP' && (
            <button
              onClick={handleCloseLocationMap}
              className="mb-2 ml-4 self-start bg-blue-700 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center shadow"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </button>
          )}

          {/* Back button for BROCHURE_VIEWER */}
          {activeDisplayMode === 'BROCHURE_VIEWER' && (
            <button
              onClick={handleCloseBrochure}
              className="mb-2 ml-4 self-start bg-blue-700 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center shadow"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </button>
          )}

          {/* --- Main Content Area --- */}
          <div className={`flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-blue-700 scrollbar-track-blue-800 ${activeDisplayMode === 'CHAT' && transcriptItems.length === 0 && !lastAgentTextMessage ? 'flex items-center justify-center' : 'space-y-4'}`}>
            
            {activeDisplayMode === 'PROPERTY_LIST' && propertyListData && (
              <PropertyList 
                properties={propertyListData}
                onScheduleVisit={handleScheduleVisit} 
                onPropertySelect={handlePropertySelect}
              />
            )}

            {activeDisplayMode === 'SCHEDULING_FORM' && selectedProperty && !isVerifying && (
              <div className="relative w-full">
                {/* Show TimePick even if availableSlots is empty - it will show default options */}
                <TimePick
                  schedule={Object.keys(availableSlots).length > 0 ? availableSlots : {
                    'Monday': ['11:00 AM', '4:00 PM'],
                    'Tuesday': ['11:00 AM', '4:00 PM'],
                    'Wednesday': ['11:00 AM', '4:00 PM']
                  }}
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
              <div className="w-full"> {/* Wrapper for consistent layout */}
                <PropertyImageGallery
                  propertyName={propertyGalleryData.propertyName}
                  images={propertyGalleryData.images}
                  onClose={handleCloseGallery} 
                />
              </div>
            )}

            {activeDisplayMode === 'LOCATION_MAP' && locationMapData && (
              <div className="w-full"> {/* Wrapper for consistent layout */}
                <LocationMap
                  propertyName={locationMapData.propertyName}
                  location={locationMapData.location}
                  description={locationMapData.description}
                  onClose={handleCloseLocationMap} 
                />
              </div>
            )}

            {activeDisplayMode === 'BROCHURE_VIEWER' && brochureData && (
              <div className="w-full p-4"> {/* Added padding for better spacing */}
                <BrochureViewer
                  propertyName={brochureData.propertyName}
                  brochureUrl={brochureData.brochureUrl}
                  onClose={handleCloseBrochure} 
                />
              </div>
            )}
            
            {activeDisplayMode === 'CHAT' && (
              <div className="flex flex-col justify-center items-center h-full text-center px-4">
                 {/* Display last agent message prominently */} 
                 {lastAgentTextMessage && (
                    <p className="text-white text-xl font-medium italic mb-10">
                      {lastAgentTextMessage}
                    </p>
                  )}
                  {/* Placeholder or initial message if nothing else to show */} 
                  {!lastAgentTextMessage && transcriptItems.length === 0 && (
                     <p className="text-white text-xl font-medium italic">How can I help you today?</p>
                  )}
                  {/* Removed the .map() rendering chat bubbles */}
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

          {/* User Transcription Overlay (Only in CHAT mode) */}
          {activeDisplayMode === 'CHAT' && transcriptItems
            .filter(item => item.type === 'MESSAGE' && item.role === 'user' && item.status !== 'DONE') // Show in-progress or last user message
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
          
          {/* --- Bottom Controls Area */}
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

            {/* Button Bar */}
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