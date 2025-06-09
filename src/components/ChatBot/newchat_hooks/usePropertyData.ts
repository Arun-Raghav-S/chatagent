import { useState, useCallback, useRef, useEffect } from "react"
import {
  PropertyProps,
  PropertyImage,
  PropertyGalleryData,
  LocationMapData,
  BrochureData,
} from "../newchat_types"
import { generateSafeId } from "../newchat_utils"
import { AgentConfig, AgentMetadata, TranscriptItem } from "@/types/types"

export function usePropertyData(
  selectedAgentConfigSet: AgentConfig[] | null,
  agentMetadata: AgentMetadata | null,
  addTranscriptMessage: (
    itemId: string,
    role: "user" | "assistant" | "system",
    text: string,
    properties?: PropertyProps[]
  ) => void,
  setActiveDisplayMode: (mode: any) => void,
  sendTriggerMessage: (triggerText: string) => void,
  sessionStatus: string,
  transcriptItems: TranscriptItem[],
  initialSessionSetupDoneRef: React.MutableRefObject<boolean>
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

  const handleGetAllProperties = useCallback(async () => {
    console.log("[UI] Attempting to load all properties directly")
    if (propertyListData || isLoadingProperties) {
      console.log(
        "[UI] Properties already loaded or loading in progress, skipping request"
      )
      return
    }

    if (
      !selectedAgentConfigSet ||
      !agentMetadata?.project_ids ||
      agentMetadata.project_ids.length === 0
    ) {
      console.error(
        "[UI] Cannot load properties - missing agent config or project IDs"
      )
      addTranscriptMessage(
        generateSafeId(),
        "system",
        "Unable to load properties. Please try again later or ask for specific property information."
      )
      return
    }

    const realEstateAgent = selectedAgentConfigSet.find(
      a => a.name === "realEstate"
    )
    if (!realEstateAgent || !realEstateAgent.toolLogic?.getProjectDetails) {
      console.error(
        "[UI] Real estate agent or getProjectDetails function not found"
      )
      addTranscriptMessage(
        generateSafeId(),
        "system",
        "Property information unavailable. Please try again later."
      )
      return
    }

    try {
      setIsLoadingProperties(true)
      addTranscriptMessage(generateSafeId(), "system", "Loading properties...")
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
        const validatedProperties = result.properties.map((property: any) => {
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
              galleryImages = property.images.slice(1).map((img: any) => {
                return {
                  url: img.url,
                  alt: img.alt || `${property.name} image`,
                  description: img.description || "",
                }
              })
            }
          }

          const amenitiesArray = Array.isArray(property.amenities)
            ? property.amenities.map((amenity: any) => {
                if (typeof amenity === "string") {
                  return { name: amenity }
                }
                return amenity
              })
            : []

          const unitsArray = Array.isArray(property.units)
            ? property.units.map((unit: any) => {
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
        const messageText = `Here are ${validatedProperties.length} properties available.`
        addTranscriptMessage(
          generateSafeId(),
          "assistant",
          messageText,
          validatedProperties
        )
      } else {
        console.warn("[UI] No properties found or invalid response format")
        if (result.error) {
          console.error("[UI] Error loading properties:", result.error)
          addTranscriptMessage(
            generateSafeId(),
            "system",
            `Error loading properties: ${result.error}`
          )
        } else {
          addTranscriptMessage(
            generateSafeId(),
            "system",
            "No properties available at this time."
          )
        }
      }
    } catch (error) {
      console.error("[UI] Error in handleGetAllProperties:", error)
      addTranscriptMessage(
        generateSafeId(),
        "system",
        "An error occurred while loading properties. Please try again later."
      )
    } finally {
      setIsLoadingProperties(false)
    }
  }, [
    selectedAgentConfigSet,
    agentMetadata,
    addTranscriptMessage,
    propertyListData,
    isLoadingProperties,
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
    if (
      sessionStatus === "CONNECTED" &&
      !propertyListData &&
      !selectedPropertyDetails &&
      !isLoadingProperties &&
      initialSessionSetupDoneRef.current
    ) {
      if (transcriptItems.length === 0) return

      const lastUserMessage = [...transcriptItems]
        .filter(item => item.type === "MESSAGE" && item.role === "user")
        .pop()

      if (lastUserMessage?.text) {
        const text = lastUserMessage.text.toLowerCase()

        if (lastPropertyQueryRef.current === lastUserMessage.itemId) {
          console.log("[Effect] Skipping already processed message:", text)
          return
        }

        const veryLastItem = transcriptItems[transcriptItems.length - 1]
        const isLoadingMessage =
          veryLastItem?.role === "system" &&
          veryLastItem?.text === "Loading properties..."
        const isResultsMessage =
          veryLastItem?.role === "assistant" &&
          veryLastItem?.text?.includes("properties I found")
        const isErrorMessage =
          veryLastItem?.role === "system" &&
          veryLastItem?.text?.startsWith("Error loading properties")

        if (isLoadingMessage || isResultsMessage || isErrorMessage) {
          console.log(
            "[Effect Check] Skipping keyword check as last message seems related to property loading."
          )
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
        ]

        const containsPropertyKeyword = propertyRelatedKeywords.some(keyword =>
          text.includes(keyword.toLowerCase())
        )

        if (containsPropertyKeyword) {
          console.log(
            "[Effect] Detected property-related query in user message:",
            text
          )
          lastPropertyQueryRef.current = lastUserMessage.itemId
          handleGetAllProperties()
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
    initialSessionSetupDoneRef,
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
    handleGetAllProperties,
    handleCloseGallery,
    handleCloseLocationMap,
    handleCloseBrochure,
  }
} 