import { useState, useCallback, useRef, useEffect } from "react"
import {
  PropertyProps,
  PropertyImage,
  PropertyGalleryData,
  LocationMapData,
  BrochureData,
  ActiveDisplayMode,
} from "../newchat_types"
import { generateSafeId } from "../newchat_utils"
import { AgentConfig, AgentMetadata, TranscriptItem } from "@/types/types"

interface PropertyApiResponse {
  id?: string;
  name?: string;
  price?: string;
  area?: string;
  description?: string;
  images?: PropertyImage[];
  amenities?: Array<{ name: string } | string>;
  units?: Array<{ type: string } | string>;
  location?: {
    city?: string;
    mapUrl?: string;
    coords?: string;
  };
  websiteUrl?: string;
  brochure?: string;
}

interface ExtendedAgentMetadata extends AgentMetadata {
  flow_context?: string;
}

export function usePropertyData(
  selectedAgentConfigSet: AgentConfig[] | null,
  agentMetadata: AgentMetadata | null,
  addTranscriptMessage: (
    itemId: string,
    role: "user" | "assistant" | "system",
    text: string,
    properties?: PropertyProps[]
  ) => void,
  setActiveDisplayMode: (mode: ActiveDisplayMode) => void,
  sendTriggerMessage: (triggerText: string) => void,
  sessionStatus: string,
  transcriptItems: TranscriptItem[],
  initialSessionSetupDoneRef: React.MutableRefObject<boolean>,
  selectedAgentName?: string
) {
  const [propertyListData, setPropertyListData] = useState<
    PropertyProps[] | null
  >(null)
  const [selectedPropertyDetails, setSelectedPropertyDetails] =
    useState<PropertyProps | null>(null)
  const [isLoadingProperties, setIsLoadingProperties] = useState<boolean>(false)
  const [propertyGalleryData, setPropertyGalleryData] =
    useState<PropertyGalleryData | null>(null)
  const [locationMapData, setLocationMapData] = useState<LocationMapData | null>(
    null
  )
  const [brochureData, setBrochureData] = useState<BrochureData | null>(null)
  const lastPropertyQueryRef = useRef<string | null>(null)
  const isProcessingRef = useRef<boolean>(false)
  const hasTriggeredLoadRef = useRef<boolean>(false)

  const handlePropertySelect = (property: PropertyProps) => {
    console.log(`[UI] Property selected: ${property.name} (${property.id})`)
    setSelectedPropertyDetails(property)
    setActiveDisplayMode("PROPERTY_DETAILS")

    setTimeout(() => {
      sendTriggerMessage(
        `{Trigger msg: Explain details of this ${property.name} in brief and then ask if they want to schedule a visit to this property}`
      )
    }, 500)
  }

  const handleClosePropertyDetails = () => {
    console.log("[UI] Closing property details.")
    setSelectedPropertyDetails(null)
    setActiveDisplayMode("CHAT")
  }

  const handleBackFromPropertyDetails = () => {
    console.log("[UI] Going back from property details.")
    // Go back to property list if we have properties, otherwise go to chat
    if (propertyListData && propertyListData.length > 0) {
      setSelectedPropertyDetails(null)
      setActiveDisplayMode("PROPERTY_LIST")
    } else {
      setSelectedPropertyDetails(null)
      setActiveDisplayMode("CHAT")
    }
  }

  const handleGetAllProperties = useCallback(async () => {
    console.log("[UI] Attempting to load all properties directly")
    if (propertyListData || isLoadingProperties || isProcessingRef.current) {
      console.log(
        "[UI] Properties already loaded or loading in progress, skipping request"
      )
      return
    }

    isProcessingRef.current = true

    if (
      !selectedAgentConfigSet ||
      !agentMetadata?.project_ids ||
      agentMetadata.project_ids.length === 0
    ) {
      console.error(
        "[UI] Cannot load properties - missing agent config or project IDs"
      )
      // Don't add transcript message here to avoid infinite loop
      isProcessingRef.current = false
      return
    }

    const realEstateAgent = selectedAgentConfigSet.find(
      a => a.name === "realEstate"
    )
    if (!realEstateAgent || !realEstateAgent.toolLogic?.getProjectDetails) {
      console.error(
        "[UI] Real estate agent or getProjectDetails function not found"
      )
      // Don't add transcript message here to avoid infinite loop
      isProcessingRef.current = false
      return
    }

    try {
      setIsLoadingProperties(true)
      // Don't add loading message to avoid infinite loop
      console.log(
        `[UI] Calling getProjectDetails with all project_ids: ${agentMetadata.project_ids.join(
          ", "
        )}`
      )
      const result = await realEstateAgent.toolLogic.getProjectDetails({}, [])
      console.log("[UI] getProjectDetails result:", result)

      if (
        result.properties &&
        Array.isArray(result.properties) &&
        result.properties.length > 0
      ) {
        const validatedProperties = result.properties.map((property: PropertyApiResponse) => {
          let mainImage = "/placeholder.svg"
          let galleryImages: PropertyImage[] = []

          if (
            property.images &&
            Array.isArray(property.images) &&
            property.images.length > 0
          ) {
            if (property.images[0].url) {
              mainImage = property.images[0].url
            }
            if (property.images.length > 1) {
              galleryImages = property.images.slice(1).map((img: PropertyImage) => {
                return {
                  url: img.url,
                  alt: img.alt || `${property.name} image`,
                  description: img.description || "",
                }
              })
            }
          }

          const amenitiesArray = Array.isArray(property.amenities)
            ? property.amenities.map((amenity: { name: string } | string) => {
                if (typeof amenity === "string") {
                  return { name: amenity }
                }
                return amenity
              })
            : []

          const unitsArray = Array.isArray(property.units)
            ? property.units.map((unit: { type: string } | string) => {
                if (typeof unit === "string") {
                  return { type: unit }
                }
                return unit
              })
            : []

          return {
            id: property.id || generateSafeId(),
            name: property.name || "Property",
            price: property.price || "Price unavailable",
            area: property.area || "Area unavailable",
            mainImage: mainImage,
            location: {
              city: property.location?.city || "Location unavailable",
              mapUrl: property.location?.mapUrl || "",
              coords: property.location?.coords || "",
            },
            galleryImages: galleryImages,
            units: unitsArray,
            amenities: amenitiesArray,
            description: property.description || "No description available",
            websiteUrl: property.websiteUrl || "",
            brochure: property.brochure || "",
          }
        })

        console.log(
          `[UI] Setting propertyListData with ${validatedProperties.length} validated properties`
        )
        setPropertyListData(validatedProperties)
        // Don't add transcript message here to avoid infinite loop
        // Properties will be displayed via UI state change
      } else {
        console.warn("[UI] No properties found or invalid response format")
        if (result.error) {
          console.error("[UI] Error loading properties:", result.error)
          // Don't add transcript message here to avoid infinite loop
        } else {
          // Don't add transcript message here to avoid infinite loop
          console.log("[UI] No properties available at this time.")
        }
      }
    } catch (error) {
      console.error("[UI] Error in handleGetAllProperties:", error)
      // Don't add transcript message here to avoid infinite loop
    } finally {
      setIsLoadingProperties(false)
      isProcessingRef.current = false
      // Reset trigger flag after processing completes (success or failure)
      hasTriggeredLoadRef.current = false
    }
  }, [
    selectedAgentConfigSet,
    agentMetadata,
    addTranscriptMessage,
  ])

  const handleCloseGallery = () => {
    setPropertyGalleryData(null)
    setActiveDisplayMode("CHAT")
  }

  const handleCloseLocationMap = () => {
    setLocationMapData(null)
    setActiveDisplayMode("CHAT")
  }

  const handleCloseBrochure = () => {
    setBrochureData(null)
    setActiveDisplayMode("CHAT")
  }

  // Effect to monitor transcript for property-related queries
  useEffect(() => {
    // CRITICAL: Skip property loading during authentication to preserve verification UI
    const isInAuthenticationFlow = selectedAgentName === "authentication" || 
                                  (agentMetadata as ExtendedAgentMetadata)?.flow_context === "from_question_auth"
    
    if (isInAuthenticationFlow) {
      console.log("[Effect] 🔐 AUTHENTICATION MODE: Skipping property loading to preserve verification UI")
      return
    }

    // Skip if already processing, already have data, or already triggered load
    if (isProcessingRef.current || propertyListData || isLoadingProperties || hasTriggeredLoadRef.current) {
      return
    }

    // Only trigger on specific conditions to avoid infinite loops
    if (
      sessionStatus === "CONNECTED" &&
      !selectedPropertyDetails &&
      initialSessionSetupDoneRef.current &&
      transcriptItems.length > 0
    ) {
      const lastUserMessage = [...transcriptItems]
        .filter(item => item.type === "MESSAGE" && item.role === "user")
        .pop()

      if (lastUserMessage?.text) {
        const text = lastUserMessage.text.toLowerCase()

        // Check if this is a pending question (questions sent after authentication)
        // Pending questions should be processed even if they have the same itemId
        const isPendingQuestion = lastUserMessage.agentName === 'realEstate' && 
                                 (text.includes('show me') || text.includes('location') || 
                                  text.includes('what is') || text.includes('tell me') ||
                                  text.includes('price') || text.includes('details'));

        if (lastPropertyQueryRef.current === lastUserMessage.itemId && !isPendingQuestion) {
          console.log("[Effect] Skipping already processed message:", text)
          return
        }

        const propertyRelatedKeywords = [
          "property",
          "properties",
          "house",
          "home",
          "apartment",
          "flat",
          "real estate",
          "housing",
          "buy",
          "purchase",
          "rent",
          "view",
          "show me",
          "location",
          "where is",
          "address",
          "map",
          "directions",
          "base 101",
          "base101",
        ]

        const containsPropertyKeyword = propertyRelatedKeywords.some(keyword =>
          text.includes(keyword.toLowerCase())
        )

        if (containsPropertyKeyword) {
          console.log(
            "[Effect] Detected property-related query in user message:",
            text
          )
          console.log(
            "[Effect] isPendingQuestion:",
            isPendingQuestion,
            "agentName:",
            lastUserMessage.agentName
          )
          lastPropertyQueryRef.current = lastUserMessage.itemId
          hasTriggeredLoadRef.current = true
          handleGetAllProperties()
        } else {
          console.log(
            "[Effect] No property keywords found in message:",
            text,
            "Keywords checked:",
            propertyRelatedKeywords
          )
        }
      }
    }
  }, [
    transcriptItems,
    sessionStatus,
    selectedPropertyDetails,
    handleGetAllProperties,
    initialSessionSetupDoneRef,
    selectedAgentName,
    agentMetadata,
  ])

  return {
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
  }
} 