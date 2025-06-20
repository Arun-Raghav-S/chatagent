import { useCallback, useEffect, useRef, useState, Dispatch, SetStateAction } from "react"
import { useHandleServerEvent as useVapiHandleServerEvent } from "@/hooks/useHandleServerEvent"
import {
  ActiveDisplayMode,
  BookingDetails,
  BrochureData,
  LocationMapData,
  PropertyGalleryData,
  PropertyProps,
} from "../newchat_types"
import {
  ServerEvent,
  SessionStatus,
  AgentConfig,
  AgentMetadata,
  TranscriptItem,
} from "@/types/types"
import { generateSafeId } from "../newchat_utils"

export function useServerEvents(
  setSessionStatus: Dispatch<SetStateAction<SessionStatus>>,
  selectedAgentName: string,
  setSelectedAgentName: Dispatch<SetStateAction<string>>,
  selectedAgentConfigSet: AgentConfig[] | null,
  sendClientEvent: (eventObj: any, eventNameSuffix?: string) => void,
  agentMetadata: AgentMetadata | null,
  setAgentMetadata: (
    value: React.SetStateAction<AgentMetadata | null>
  ) => void,
  transcriptItems: TranscriptItem[],
  addTranscriptMessage: (
    itemId: string,
    role: "user" | "assistant" | "system",
    text: string,
    properties?: PropertyProps[],
    agentName?: string
  ) => void,
  updateTranscriptMessage: (
    itemId: string,
    textDelta: string,
    isDelta: boolean
  ) => void,
  updateTranscriptItemStatus: (
    itemId: string,
    status: "IN_PROGRESS" | "DONE" | "ERROR"
  ) => void,
  setActiveDisplayMode: (mode: ActiveDisplayMode) => void,
  setPropertyListData: (data: PropertyProps[] | null) => void,
  setSelectedPropertyDetails: (property: PropertyProps | null) => void,
  setPropertyGalleryData: (data: PropertyGalleryData | null) => void,
  setLocationMapData: (data: LocationMapData | null) => void,
  setBrochureData: (data: BrochureData | null) => void,
  isLoadingProperties: boolean,
  setIsLoadingProperties: (loading: boolean) => void,
  setLastAgentTextMessage: (text: string | null) => void,
  propertyListData: PropertyProps[] | null,
  activeDisplayMode: ActiveDisplayMode,
  selectedProperty: PropertyProps | null,
  setSelectedProperty: (property: PropertyProps | null) => void,
  showTimeSlots: boolean,
  setShowTimeSlots: (show: boolean) => void,
  setAvailableSlots: (slots: Record<string, string[]>) => void,
  setShowVerificationScreen: (show: boolean) => void,
  selectedTime: string | null,
  selectedDay: string,
  prevAgentNameRef: React.MutableRefObject<string | null>,
  setMicMuted: Dispatch<SetStateAction<boolean>>
) {
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(
    null
  )

  const {
    handleServerEvent: handleServerEventRefFromHook,
    canCreateResponse,
  } = useVapiHandleServerEvent({
    setSessionStatus,
    selectedAgentName,
    selectedAgentConfigSet,
    sendClientEvent,
    setSelectedAgentName,
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
    setBookingDetails,
    setBrochureData,
    setMicMuted,
  })

  const handleServerEvent = useCallback(
    (serverEvent: ServerEvent) => {
      let assistantMessageHandledLocally = false
      let propertiesHandledLocally = false

      // CRITICAL: Skip all property operations when in authentication mode
      if (selectedAgentName === "authentication" && (
          serverEvent.type === "conversation.item.created" && 
          serverEvent.item?.type === "function_call_output" &&
          (serverEvent.item as any)?.name === "getProjectDetails"
        )) {
        console.log("[handleServerEvent] 🔐 AUTHENTICATION MODE: Skipping property operations to preserve verification UI")
        return
      }

      if (isLoadingProperties && selectedAgentName !== "authentication") {
        console.log(
          "[handleServerEvent] Properties are already being loaded, skipping duplicate loading"
        )
      }

      if (serverEvent.type === "response.done") {
        console.log(
          `✅ [AGENT FINISHED] ${selectedAgentName.toUpperCase()} completed full response`
        )
        const responseDetails = (serverEvent.response as any) || {}
        if (responseDetails.usage) {
          console.log(
            `📊 [USAGE STATS] Agent: ${selectedAgentName} | Tokens: ${JSON.stringify(
              responseDetails.usage
            )} | Outputs: ${responseDetails.output?.length || 0}`
          )
        }
        if (serverEvent.response?.output) {
          const hasTransferCall = serverEvent.response.output.some(
            (output: any) =>
              output.type === "function_call" &&
              (output.name === "transferAgents" ||
                output.name === "initiateScheduling")
          )
          if (hasTransferCall) {
            console.log(
              `🔄 [TRANSFER DETECTED] ${selectedAgentName.toUpperCase()} response included transfer function call`
            )
          }
        }
      }

      if (
        serverEvent.type === "session.updated" &&
        selectedAgentName === "scheduleMeeting"
      ) {
        console.log(
          "[handleServerEvent] Detected session update for scheduleMeeting agent - ensuring UI is properly set"
        )
        if (activeDisplayMode !== "SCHEDULING_FORM") {
          console.log(
            "[handleServerEvent] CRITICAL FIX: Setting UI mode to SCHEDULING_FORM for scheduleMeeting agent"
          )
          if (selectedProperty) {
            console.log(
              `[handleServerEvent] Using selected property for scheduling: ${selectedProperty.name}`
            )
            setShowTimeSlots(true)
            setActiveDisplayMode("SCHEDULING_FORM")
          } else {
            const metadata = agentMetadata as any
            if (metadata?.property_id_to_schedule) {
              console.log(
                `[handleServerEvent] Creating default property from metadata: ${metadata.property_id_to_schedule}`
              )
              setSelectedProperty({
                id: metadata.property_id_to_schedule,
                name: metadata.property_name || "Selected Property",
                price: "Contact for pricing",
                area: "Available on request",
                description:
                  "Schedule a visit to see this property in person.",
                mainImage: "/placeholder.svg",
              })
              setShowTimeSlots(true)
              setActiveDisplayMode("SCHEDULING_FORM")
            }
          }
        }
      }

      if (
        serverEvent.type === "conversation.item.created" &&
        serverEvent.item?.role === "user" &&
        serverEvent.item?.content?.[0]?.text &&
        typeof serverEvent.item.content[0].text === "string" &&
        (serverEvent.item.content[0].text.startsWith("{Trigger msg:") ||
          serverEvent.item.content[0].text ===
            "Show the booking confirmation page" ||
          serverEvent.item.content[0].text === "TRIGGER_BOOKING_CONFIRMATION")
      ) {
        console.log(
          "[handleServerEvent] Filtering out trigger/system message from transcript:",
          serverEvent.item.content[0].text
        )
        const messageText = serverEvent.item.content[0].text
        if (messageText.startsWith("{Trigger msg: Say ")) {
          console.log(
            "[handleServerEvent] SPEAK trigger detected - allowing agent processing but hiding from transcript"
          )
        } else if (messageText === "TRIGGER_BOOKING_CONFIRMATION") {
          console.log(
            "[handleServerEvent] TRIGGER_BOOKING_CONFIRMATION detected - allowing agent processing but hiding from transcript"
          )
        } else {
          return
        }
      }

      if (
        serverEvent.type === "conversation.item.created" &&
        serverEvent.item?.type === "function_call_output"
      ) {
        const functionOutputItem = serverEvent.item as any
        
        // Debug the actual structure of the function_call_output
        console.log("🔍 [DEBUG] function_call_output item structure:", {
          type: functionOutputItem.type,
          name: functionOutputItem.name,
          call_id: functionOutputItem.call_id,
          output: functionOutputItem.output ? "Present" : "Missing",
          allKeys: Object.keys(functionOutputItem),
          fullItem: functionOutputItem
        });
        
        // The function name might be in a different field, let's check all possibilities
        let functionName = functionOutputItem.name;
        
        // If name is undefined, try to extract from call_id or other fields
        if (!functionName) {
          // Sometimes the function name might be in function_name field
          functionName = functionOutputItem.function_name;
        }
        
        // If still not found, try to infer from output content
        if (!functionName && functionOutputItem.output) {
          try {
            const outputData = JSON.parse(functionOutputItem.output);
            console.log("🔍 [DEBUG] Parsed output data keys:", Object.keys(outputData));
            
            // Check if this looks like getAvailableSlots output
            if (outputData.slots && outputData.timeSlots && outputData.property_id) {
              console.log("🔍 [DEBUG] Inferring this is getAvailableSlots based on output structure");
              functionName = "getAvailableSlots";
            }
            // Check if this looks like scheduleVisit output
            else if (outputData.booking_confirmed !== undefined) {
              console.log("🔍 [DEBUG] Inferring this is scheduleVisit based on output structure");
              functionName = "scheduleVisit";
            }
            // Add more patterns as needed
          } catch (e) {
            console.log("🔍 [DEBUG] Could not parse output data for function inference");
          }
        }
        
        console.log("🔍 [DEBUG] Resolved function name:", functionName);

        console.log(
          `🔧 [TOOL EXECUTED] ${selectedAgentName.toUpperCase()} executed: ${functionName}`
        )

        if (functionName === "initiateScheduling") {
          console.log(
            `🔄 [SCHEDULING] ${selectedAgentName.toUpperCase()}: Detected initiateScheduling, clearing last agent message`
          )
          setLastAgentTextMessage(null)
        }

        if (functionName === "getProjectDetails") {
          console.log(
            "[handleServerEvent] Detected function_call_output item for getProjectDetails."
          )
          if (!propertyListData && !isLoadingProperties) {
            const outputString = functionOutputItem?.output
            const itemId = functionOutputItem?.id
            if (outputString) {
              try {
                const outputData = JSON.parse(outputString)
                if (
                  outputData.properties &&
                  Array.isArray(outputData.properties)
                ) {
                  setIsLoadingProperties(true)
                  const formattedProperties = outputData.properties.map(
                    (property: any) => {
                      let mainImage = "/placeholder.svg"
                      let galleryImages: any[] = []
                      if (
                        property.images &&
                        Array.isArray(property.images) &&
                        property.images.length > 0
                      ) {
                        if (property.images[0].url)
                          mainImage = property.images[0].url
                        if (property.images.length > 1)
                          galleryImages = property.images
                            .slice(1)
                            .map((img: any) => ({
                              url: img.url,
                              alt: img.alt || `${property.name} image`,
                              description: img.description || "",
                            }))
                      }
                      const amenitiesArray = Array.isArray(property.amenities)
                        ? property.amenities.map((amenity: any) =>
                            typeof amenity === "string"
                              ? { name: amenity }
                              : amenity
                          )
                        : []
                      const unitsArray = Array.isArray(property.units)
                        ? property.units.map((unit: any) =>
                            typeof unit === "string" ? { type: unit } : unit
                          )
                        : []
                      return {
                        id: property.id || generateSafeId(),
                        name: property.name || "Property",
                        price: property.price || "Price unavailable",
                        area: property.area || "Area unavailable",
                        mainImage: mainImage,
                        location: {
                          city:
                            property.location?.city || "Location unavailable",
                          mapUrl: property.location?.mapUrl || "",
                          coords: property.location?.coords || "",
                        },
                        galleryImages: galleryImages,
                        units: unitsArray,
                        amenities: amenitiesArray,
                        description:
                          property.description || "No description available",
                        websiteUrl: property.websiteUrl || "",
                        brochure: property.brochure || "",
                      }
                    }
                  )
                  console.log(
                    "[handleServerEvent] Formatted properties:",
                    formattedProperties
                  )
                  setPropertyListData(formattedProperties)
                  const propertyCount = formattedProperties.length
                  const messageText =
                    propertyCount > 0
                      ? `Here ${
                          propertyCount === 1 ? "is" : "are"
                        } ${propertyCount} propert${
                          propertyCount === 1 ? "y" : "ies"
                        } I found.`
                      : "I couldn't find any properties matching your request."
                  const newItemId = itemId || generateSafeId()
                  addTranscriptMessage(
                    newItemId,
                    "assistant",
                    messageText,
                    formattedProperties
                  )
                  updateTranscriptItemStatus(newItemId, "DONE")
                  propertiesHandledLocally = true
                  setIsLoadingProperties(false)
                } else {
                  console.log(
                    "[handleServerEvent] Parsed function output, but 'properties' array not found or not an array."
                  )
                }
              } catch (e) {
                console.warn(
                  "[handleServerEvent] Error parsing getProjectDetails output:",
                  e,
                  outputString
                )
                setIsLoadingProperties(false)
              }
            } else {
              console.log(
                "[handleServerEvent] getProjectDetails function_call_output item has no output string."
              )
            }
          } else {
            console.log(
              "[handleServerEvent] propertyListData already exists or properties are being loaded, skipping processing for getProjectDetails output."
            )
            propertiesHandledLocally = true
          }
        } else if (functionName === "getAvailableSlots") {
          console.log(
            "[handleServerEvent] Detected function_call_output for getAvailableSlots."
          )
          setLastAgentTextMessage(null)
          const outputString = functionOutputItem.output
          if (outputString) {
            try {
              const outputData = JSON.parse(outputString)
              if (outputData.slots) {
                console.log("[UI] Received slots:", outputData.slots)
                setAvailableSlots(outputData.slots)
                const isVerified =
                  outputData.user_verification_status === "verified"
                console.log(
                  `[UI] User verification status: ${
                    isVerified ? "verified" : "unverified"
                  }`
                )
                if (!selectedProperty && outputData.property_id) {
                  const propertyName =
                    outputData.property_name || "Selected Property"
                  console.log(
                    `[UI] Creating property with ID: ${outputData.property_id}, name: ${propertyName}`
                  )
                  setSelectedProperty({
                    id: outputData.property_id,
                    name: propertyName,
                    price: "Contact for pricing",
                    area: "Available on request",
                    description: `Schedule a visit to see ${propertyName} in person.`,
                    mainImage: "/placeholder.svg",
                  })
                }
                console.log("[UI] Setting showTimeSlots to TRUE")
                setShowTimeSlots(true)
                console.log(
                  "[UI] CRITICAL: Setting activeDisplayMode to SCHEDULING_FORM"
                )
                setActiveDisplayMode("SCHEDULING_FORM")
                console.log(
                  "[UI] Current state check - activeDisplayMode:",
                  "SCHEDULING_FORM",
                  "showTimeSlots:",
                  true,
                  "selectedProperty:",
                  selectedProperty || outputData.property_id
                )
                setShowVerificationScreen(!isVerified)
                if (outputData.message) {
                  console.log(
                    `[UI] Slots message from agent: ${outputData.message}`
                  )
                  addTranscriptMessage(
                    generateSafeId(),
                    "assistant",
                    `[Scheduler] ${outputData.message}`
                  )
                }
                if (
                  activeDisplayMode !== "SCHEDULING_FORM" ||
                  !showTimeSlots ||
                  !selectedProperty
                ) {
                  console.log(
                    "[UI] ⚠️ WARNING: TimePick component might not be displayed. Forcing display."
                  )
                  if (!selectedProperty && outputData.property_id) {
                    const propertyName =
                      outputData.property_name || "Selected Property"
                    setSelectedProperty({
                      id: outputData.property_id,
                      name: propertyName,
                      price: "Contact for pricing",
                      area: "Available on request",
                      description: `Schedule a visit to see ${propertyName} in person.`,
                      mainImage: "/placeholder.svg",
                    })
                  } else if (!selectedProperty) {
                    const metadata = agentMetadata as any
                    const propertyName =
                      metadata?.property_name ||
                      outputData.property_name ||
                      "Selected Property"
                    const propertyId =
                      metadata?.property_id_to_schedule ||
                      outputData.property_id ||
                      "default-property"
                    setSelectedProperty({
                      id: propertyId,
                      name: propertyName,
                      price: "Contact for pricing",
                      area: "Available on request",
                      description: `Schedule a visit to see ${propertyName} in person.`,
                      mainImage: "/placeholder.svg",
                    })
                  }
                  setShowTimeSlots(true)
                  setActiveDisplayMode("SCHEDULING_FORM")
                }
                propertiesHandledLocally = true
              } else {
                console.error(
                  "[handleServerEvent] getAvailableSlots response has no slots data!"
                )
                if (outputData.property_id || outputData.property_name) {
                  console.log("[UI] Creating fallback slots with default times")
                  const defaultSlots: Record<string, string[]> = {}
                  const today = new Date()
                  const tomorrow = new Date(today)
                  tomorrow.setDate(tomorrow.getDate() + 1)
                  const dateOptions: Intl.DateTimeFormatOptions = {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  }
                  const todayStr = today.toLocaleDateString(
                    "en-US",
                    dateOptions
                  )
                  const tomorrowStr = tomorrow.toLocaleDateString(
                    "en-US",
                    dateOptions
                  )
                  defaultSlots[todayStr] = ["11:00 AM", "4:00 PM"]
                  defaultSlots[tomorrowStr] = ["11:00 AM", "4:00 PM"]
                  setAvailableSlots(defaultSlots)
                  if (!selectedProperty) {
                    const propertyName =
                      outputData.property_name || "Selected Property"
                    setSelectedProperty({
                      id: outputData.property_id || "default-property",
                      name: propertyName,
                      price: "Contact for pricing",
                      area: "Available on request",
                      description: `Schedule a visit to see ${propertyName} in person.`,
                      mainImage: "/placeholder.svg",
                    })
                  }
                  setShowTimeSlots(true)
                  setActiveDisplayMode("SCHEDULING_FORM")
                  propertiesHandledLocally = true
                }
              }
            } catch (e) {
              console.error(
                "[handleServerEvent] Error parsing getAvailableSlots output:",
                e
              )
              if (selectedAgentName === "scheduleMeeting") {
                console.log(
                  "[UI] Creating emergency fallback slots after parse error"
                )
                const defaultSlots: Record<string, string[]> = {}
                const today = new Date()
                const tomorrow = new Date(today)
                tomorrow.setDate(tomorrow.getDate() + 1)
                const dateOptions: Intl.DateTimeFormatOptions = {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                }
                const todayStr = today.toLocaleDateString("en-US", dateOptions)
                const tomorrowStr = tomorrow.toLocaleDateString(
                  "en-US",
                  dateOptions
                )
                defaultSlots[todayStr] = ["11:00 AM", "4:00 PM"]
                defaultSlots[tomorrowStr] = ["11:00 AM", "4:00 PM"]
                setAvailableSlots(defaultSlots)
                if (!selectedProperty) {
                  const metadata = agentMetadata as any
                  const propertyName =
                    metadata?.property_name || "Selected Property"
                  const propertyId =
                    metadata?.property_id_to_schedule || "default-property"
                  setSelectedProperty({
                    id: propertyId,
                    name: propertyName,
                    price: "Contact for pricing",
                    area: "Available on request",
                    description: `Schedule a visit to see ${propertyName} in person.`,
                    mainImage: "/placeholder.svg",
                  })
                }
                setShowTimeSlots(true)
                setActiveDisplayMode("SCHEDULING_FORM")
                propertiesHandledLocally = true
              }
            }
          }
        } else if (functionName === "scheduleVisit") {
          console.log(
            "[handleServerEvent] Detected function_call_output for scheduleVisit."
          )
          const outputString = functionOutputItem.output
          if (outputString) {
            try {
              const outputData = JSON.parse(outputString)
              if (
                outputData.success === true ||
                outputData.booking_confirmed === true
              ) {
                console.log("[UI] Booking successful reported by agent.")
                setShowTimeSlots(false)
                if (outputData.message) {
                  addTranscriptMessage(
                    generateSafeId(),
                    "assistant",
                    `[Scheduler] ${outputData.message}`
                  )
                } else {
                  addTranscriptMessage(
                    generateSafeId(),
                    "assistant",
                    `[Scheduler] Your visit has been scheduled!`
                  )
                }
                propertiesHandledLocally = true
              } else if (outputData.error) {
                console.error(
                  "[UI] Agent reported scheduling error:",
                  outputData.error
                )
                setShowTimeSlots(false)
                addTranscriptMessage(
                  generateSafeId(),
                  "system",
                  `Scheduling Error: ${outputData.error}`
                )
                propertiesHandledLocally = true
              }
            } catch (e) {
              console.warn(
                "[handleServerEvent] Error parsing scheduleVisit output:",
                e
              )
            }
          }
        }

        if (functionName === "completeScheduling") {
          console.log(
            "[handleServerEvent] Detected function_call_output for completeScheduling."
          )
          const outputString = functionOutputItem.output
          if (outputString) {
            try {
              const outputData = JSON.parse(outputString)
              if (outputData.booking_details) {
                console.log(
                  "[handleServerEvent] Setting booking details:",
                  outputData.booking_details
                )
                setBookingDetails(outputData.booking_details)
                if (outputData.ui_display_hint === "BOOKING_CONFIRMATION") {
                  console.log(
                    "[handleServerEvent] Setting display mode to BOOKING_CONFIRMATION"
                  )
                  setActiveDisplayMode("BOOKING_CONFIRMATION")
                  if (outputData.message) {
                    addTranscriptMessage(
                      generateSafeId(),
                      "assistant",
                      outputData.message
                    )
                  }
                }
                propertiesHandledLocally = true
              }
            } catch (e) {
              console.error(
                "[handleServerEvent] Error parsing completeScheduling output:",
                e
              )
            }
          }
        }
      }

      if (
        !propertiesHandledLocally &&
        serverEvent.type === "conversation.item.created" &&
        serverEvent.item?.role === "assistant"
      ) {
        let text =
          serverEvent.item?.content?.[0]?.text ??
          serverEvent.item?.content?.[0]?.transcript ??
          ""
        const itemId = serverEvent.item?.id
        if (itemId && text) {
          const itemStatus = serverEvent.item?.status
          const isComplete =
            itemStatus === "done" ||
            itemStatus === "completed" ||
            (serverEvent.item as any)?.done === true

          if (isComplete) {
            console.log(
              `🎤 [${selectedAgentName.toUpperCase()} SPOKE COMPLETE]: "${text}"`
            )
            console.log(
              `🗣️ [AGENT FINAL] ${selectedAgentName.toUpperCase()}: Full message logged above`
            )
            console.log(
              `📝 [AGENT SUMMARY] Agent: ${selectedAgentName} | Status: ${itemStatus} | Length: ${
                text.length
              } chars | ItemID: ${itemId.substring(0, 8)}...`
            )
          } else {
            console.log(
              `🎤 [${selectedAgentName.toUpperCase()} SPEAKING]: "${text.substring(
                0,
                100
              )}${text.length > 100 ? "..." : ""}"`
            )
            console.log(
              `📝 [AGENT PROGRESS] Agent: ${selectedAgentName} | Status: ${itemStatus} | Current length: ${text.length} chars`
            )
          }

          const agentPrefix =
            activeDisplayMode === "SCHEDULING_FORM"
              ? "[Scheduler] "
              : selectedAgentName === "authentication"
              ? "[Auth] "
              : ""

          if (selectedAgentName === "scheduleMeeting") {
            if (
              !selectedTime &&
              text.toLowerCase().includes("confirm") &&
              (text.toLowerCase().includes("visit") ||
                text.toLowerCase().includes("schedule"))
            ) {
              console.log(
                `🚫 [AGENT FILTER] ${selectedAgentName.toUpperCase()}: Filtering premature scheduling confirmation message`
              )
              assistantMessageHandledLocally = true
              return
            }
            if (
              selectedDay &&
              text.toLowerCase().includes("select a date") &&
              text.toLowerCase().includes("calendar")
            ) {
              console.log(
                `🚫 [AGENT FILTER] ${selectedAgentName.toUpperCase()}: Filtering repeat date selection prompt (date already selected)`
              )
              assistantMessageHandledLocally = true
              return
            }
          }

          if (
            prevAgentNameRef.current &&
            prevAgentNameRef.current !== selectedAgentName
          ) {
            const isFirstMessageFromAgent = !transcriptItems.some(
              item =>
                item.type === "MESSAGE" &&
                item.role === "assistant" &&
                item.agentName === selectedAgentName
            )
            if (isFirstMessageFromAgent) {
              console.log(
                `🔄 [AGENT SWITCH] First message from new agent: ${selectedAgentName.toUpperCase()}`
              )
              addTranscriptMessage(
                generateSafeId(),
                "system",
                `--- ${
                  selectedAgentName === "scheduleMeeting"
                    ? "Scheduling Assistant"
                    : selectedAgentName === "authentication"
                    ? "Authentication"
                    : "Property Assistant"
                } ---`
              )
            }
          }

          addTranscriptMessage(
            itemId,
            "assistant",
            agentPrefix + text,
            undefined,
            selectedAgentName
          )
          assistantMessageHandledLocally = true
        }
      }

      const isGetProjectDetailsOutput =
        serverEvent.type === "conversation.item.created" &&
        serverEvent.item?.type === "function_call_output" &&
        (serverEvent.item as any).name === "getProjectDetails"
      if (!isGetProjectDetailsOutput && !propertiesHandledLocally) {
        handleServerEventRefFromHook.current(serverEvent)
      }
    },
    [
      addTranscriptMessage,
      updateTranscriptItemStatus,
      handleServerEventRefFromHook,
      propertyListData,
      isLoadingProperties,
      setIsLoadingProperties,
      selectedAgentName,
      selectedProperty,
      setSelectedProperty,
      selectedTime,
      selectedDay,
      prevAgentNameRef,
      transcriptItems,
      setBookingDetails,
      activeDisplayMode,
      setLastAgentTextMessage,
      setAvailableSlots,
      setActiveDisplayMode,
      setShowTimeSlots,
      setShowVerificationScreen,
      agentMetadata,
      setPropertyListData,
      showTimeSlots,
    ]
  )

  const localHandleServerEventRef = useRef(handleServerEvent)
  useEffect(() => {
    localHandleServerEventRef.current = handleServerEvent
  }, [handleServerEvent])

  return {
    handleServerEvent: localHandleServerEventRef.current,
    canCreateResponse,
    bookingDetails,
    setBookingDetails,
  }
} 