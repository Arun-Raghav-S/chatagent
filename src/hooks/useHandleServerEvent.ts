"use client";

import { ServerEvent, SessionStatus, AgentConfig, TranscriptItem, AgentMetadata } from "@/types/types"; // Adjusted import path, added TranscriptItem and AgentMetadata
import { useRef, useEffect, useState, Dispatch, SetStateAction, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";

// Helper function to create safe IDs (must be 32 chars or less)
const generateSafeId = () => {
    // Remove hyphens and truncate to 32 chars
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
};

// Add delay utility function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


interface PropertyImage { url?: string; alt?: string; description?: string; }

// Redefine ActiveDisplayMode if not imported or defined globally
type ActiveDisplayMode = 
  | 'CHAT' 
  | 'PROPERTY_LIST' 
  | 'PROPERTY_DETAILS' 
  | 'IMAGE_GALLERY' 
  | 'LOCATION_MAP'
  | 'SCHEDULING_FORM'
  | 'VERIFICATION_FORM'
  | 'OTP_FORM'
  | 'VERIFICATION_SUCCESS'
  | 'BOOKING_CONFIRMATION'
  | 'BROCHURE_VIEWER';


export interface UseHandleServerEventParams {
  // Required state setters and config
  setSessionStatus: Dispatch<SetStateAction<SessionStatus>>;
  selectedAgentName: string;
  selectedAgentConfigSet: AgentConfig[] | null;
  sendClientEvent: (eventObj: any, eventNameSuffix?: string) => void;
  setSelectedAgentName: Dispatch<SetStateAction<string>>;
  setAgentMetadata: Dispatch<SetStateAction<AgentMetadata | null>>;

  // Transcript state and functions passed from component
  transcriptItems: TranscriptItem[];
  addTranscriptMessage: (itemId: string, role: "user" | "assistant" | "system", text: string, properties?: any[], agentName?: string) => void;
  updateTranscriptMessage: (itemId: string, textDelta: string, isDelta: boolean) => void;
  updateTranscriptItemStatus: (itemId: string, status: "IN_PROGRESS" | "DONE" | "ERROR") => void;

  // Optional configuration
  shouldForceResponse?: boolean;

  // --- New setters for UI control ---
  setActiveDisplayMode: Dispatch<SetStateAction<any>>;
  setPropertyListData: Dispatch<SetStateAction<any | null>>;
  setSelectedPropertyDetails: Dispatch<SetStateAction<any | null>>;
  setPropertyGalleryData: Dispatch<SetStateAction<any | null>>;
  setLocationMapData: Dispatch<SetStateAction<any | null>>;
  setBookingDetails: Dispatch<SetStateAction<any | null>>;
  setBrochureData: Dispatch<SetStateAction<any | null>>;
  
  // --- Mic control for authentication flow ---
  setMicMuted: Dispatch<SetStateAction<boolean>>;
  
  // --- Scheduling UI control ---
  setAvailableSlots?: Dispatch<SetStateAction<Record<string, string[]>>>;
  setSelectedProperty?: Dispatch<SetStateAction<any | null>>;
  setShowTimeSlots?: Dispatch<SetStateAction<boolean>>;
}

// AUTOMATIC QUESTION COUNTING LOGIC - NO AGENT DEPENDENCY
const isRealUserQuestion = (message: string, selectedAgentName: string): boolean => {
  console.log(`🔍 [Question Filter] Checking message: "${message}", Agent: ${selectedAgentName}`);
  
  if (!message || typeof message !== 'string') {
    console.log(`🔍 [Question Filter] REJECTED: Invalid message type`);
    return false;
  }
  
  const normalizedMessage = message.toLowerCase().trim();
  console.log(`🔍 [Question Filter] Normalized: "${normalizedMessage}"`);
  
  // Filter out system/internal messages
  if (normalizedMessage.startsWith('{trigger msg:') ||
      normalizedMessage === 'trigger_booking_confirmation' ||
      normalizedMessage === 'i need to verify my details' ||
      normalizedMessage === 'hello, i need help with booking a visit. please show me available dates.' ||
      normalizedMessage === 'i am interested in something else' ||
      normalizedMessage.startsWith('my verification code')) {
    console.log(`🔍 [Question Filter] REJECTED: System/internal message`);
    return false;
  }
  
  // Filter out simulated greeting
  if (normalizedMessage === 'hi' && selectedAgentName === 'realEstate') {
    console.log('🔍 [Question Filter] REJECTED: Simulated "hi" greeting');
    return false;
  }
  
  // Filter out phantom audio (same logic as before but simplified)
  if (normalizedMessage.length <= 2 && !['hi', 'no', 'ok'].includes(normalizedMessage) ||
      normalizedMessage === 'thank you' ||
      normalizedMessage === 'thanks' ||
      normalizedMessage === 'mm-hmm' ||
      normalizedMessage === 'uh-huh' ||
      normalizedMessage === 'mm' ||
      normalizedMessage === 'hmm') {
    console.log(`🔍 [Question Filter] REJECTED: Phantom audio detected`);
    return false;
  }
  
  console.log(`✅ [Question Filter] ACCEPTED: Valid user question detected`);
  return true;
};

export function useHandleServerEvent({
  setSessionStatus,
  selectedAgentName,
  selectedAgentConfigSet,
  sendClientEvent,
  setSelectedAgentName,
  setAgentMetadata,
  // Destructure transcript functions from params
  transcriptItems,
  addTranscriptMessage,
  updateTranscriptMessage,
  updateTranscriptItemStatus,
  shouldForceResponse,
  // Destructure new setters
  setActiveDisplayMode,
  setPropertyListData,
  setSelectedPropertyDetails,
  setPropertyGalleryData,
  setLocationMapData,
  setBookingDetails,
  setBrochureData,
  // Mic control
  setMicMuted,
  // Scheduling UI control
  setAvailableSlots,
  setSelectedProperty,
  setShowTimeSlots,
}: UseHandleServerEventParams) {
  // Removed context hook calls
  // const { logServerEvent } = useEvent(); // Placeholder call - Logging can be added back if needed

  // Add state to track active responses
  const hasActiveResponseRef = useRef(false);
  
  // Track the ID of the simulated message to filter it out
  const simulatedMessageIdRef = useRef<string | null>(null);
  
  // Add a new ref to track if we're currently transferring agents
  const isTransferringAgentRef = useRef(false);
  const agentBeingTransferredToRef = useRef<string | null>(null); // Added ref
  
  // Track authentication state - simple approach  
  const authenticationTriggeredRef = useRef(false);

  // Track scheduling context across function calls
  const lastDetectionResultRef = useRef<{isScheduleRequest?: boolean, detectedProperty?: string} | null>(null);

  const handleFunctionCall = async (functionCallParams: {
    name: string;
    call_id?: string;
    arguments: string;
  }) => {
    const { name: functionName, call_id, arguments: argsString } = functionCallParams;
    
    // 🚨 COMPREHENSIVE FUNCTION CALL LOGGING
    console.log(`🔧 [FUNCTION EXECUTING] ${selectedAgentName.toUpperCase()}.${functionName}()`);
    console.log(`📋 [FUNCTION DETAILS] Agent: ${selectedAgentName} | Function: ${functionName} | CallID: ${call_id}`);
    
    try {
      console.log(
        `[handleFunctionCall] Raw arguments for ${functionCallParams.name}:`,
        functionCallParams.arguments
      );

      const args = JSON.parse(functionCallParams.arguments);
      console.log(
        `[handleFunctionCall] Parsed arguments for ${functionCallParams.name}:`,
        args
      );
      
      // 🚨 LOG FUNCTION ARGUMENTS IN DETAIL
      console.log(`📋 [FUNCTION ARGS] ${functionName} called with:`, Object.keys(args).map(key => `${key}: ${typeof args[key]}`).join(', '));

      if (functionCallParams.name === "submitPhoneNumber") {
        console.log(
          `[handleFunctionCall] Phone number in submitPhoneNumber:`,
          args.phone_number
        );
        if (args.phone_number && !args.phone_number.startsWith("+")) {
          if (
            typeof args.phone_number === "string" &&
            args.phone_number.trim()
          ) {
            args.phone_number =
              "+" + args.phone_number.trim().replace(/^\+/, "");
            console.log(
              `[handleFunctionCall] Fixed phone number:`,
              args.phone_number
            );
          }
        }
      }

      const currentAgent = selectedAgentConfigSet?.find(
        (a) => a.name === selectedAgentName
      );

      if (!currentAgent) {
        console.error(`[handleFunctionCall] Agent configuration not found for name: ${selectedAgentName}`);
        const errorResult = { error: `Agent ${selectedAgentName} configuration not found.` };
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: functionCallParams.call_id,
            output: JSON.stringify(errorResult),
          },
        });
        sendClientEvent({ type: "response.create" });
        return; // Stop processing if agent config is missing
      }

      if (currentAgent.metadata) {
        const phoneNumberFromArgs = args.phone_number;
        const metadata = { ...currentAgent.metadata }; // Copy metadata

        // Apply metadata to args, preserving args values if they exist
        for (const key in metadata) {
             if (!(key in args) || args[key] === undefined || args[key] === null || args[key] === '') {
                args[key] = metadata[key as keyof typeof metadata];
             }
        }

        // Restore phone number from args if it was provided and different from metadata
        if (phoneNumberFromArgs && phoneNumberFromArgs.trim() !== "" && phoneNumberFromArgs !== metadata.phone_number) {
          args.phone_number = phoneNumberFromArgs;
          // Update the agent's metadata in memory
          currentAgent.metadata.phone_number = phoneNumberFromArgs;
          console.log(
            `[handleFunctionCall] Restored/Updated phone_number from args: ${phoneNumberFromArgs}`
          );
        }

        console.log(
          `[handleFunctionCall] Merged args with metadata:`,
          args
        );
      }


      // Check if the tool logic actually exists on the current agent
      const toolFunction = currentAgent?.toolLogic?.[functionCallParams.name];

      if (typeof toolFunction === 'function') {
        // Tool logic exists, proceed to call it
        console.log(`[handleFunctionCall] Executing tool logic for "${functionCallParams.name}" on agent "${selectedAgentName}"`);
        let fnResult = await toolFunction(args, transcriptItems || []);
        console.log(`[handleFunctionCall] Tool "${functionCallParams.name}" result:`, fnResult);
        
        // Store scheduling detection results for use in subsequent calls
        if (functionCallParams.name === 'detectPropertyInMessage' && fnResult) {
          lastDetectionResultRef.current = {
            isScheduleRequest: fnResult.isScheduleRequest,
            detectedProperty: fnResult.detectedProperty
          };
          console.log(`🔍 [SCHEDULING CONTEXT] Stored detection result:`, lastDetectionResultRef.current);
        }
        
        // 🚨 COMPREHENSIVE FUNCTION RESULT LOGGING
        console.log(`✅ [FUNCTION COMPLETED] ${selectedAgentName.toUpperCase()}.${functionName}() finished`);
        if (fnResult) {
          console.log(`📤 [FUNCTION RESULT] ${functionName} returned:`, {
            hasMessage: !!fnResult.message,
            hasError: !!fnResult.error,
            hasProperties: !!fnResult.properties,
            hasUIHint: !!fnResult.ui_display_hint,
            hasTransfer: !!fnResult.destination_agent,
            resultKeys: Object.keys(fnResult)
          });
          
          if (fnResult.message) {
            console.log(`💬 [FUNCTION MESSAGE] ${functionName}: "${fnResult.message.substring(0, 150)}${fnResult.message.length > 150 ? '...' : ''}"`);
          }
          
          if (fnResult.error) {
            console.log(`❌ [FUNCTION ERROR] ${functionName}: "${fnResult.error}"`);
          }
          
          if (fnResult.ui_display_hint) {
            console.log(`🖥️ [UI HINT] ${functionName} wants to show: ${fnResult.ui_display_hint}`);
          }
          
          if (fnResult.destination_agent) {
            console.log(`🔄 [TRANSFER] ${functionName} wants to transfer to: ${fnResult.destination_agent}`);
          }
        } else {
          console.log(`📭 [FUNCTION RESULT] ${functionName} returned null/undefined`);
        }

        // Special handling for trigger_scheduling response from trackUserMessage
        if (fnResult && fnResult.trigger_scheduling === true) {
          console.log("[handleFunctionCall] Received trigger_scheduling - calling initiateScheduling tool");
          
          // Get the current agent and call initiateScheduling
          const currentAgent = selectedAgentConfigSet?.find(a => a.name === selectedAgentName);
          const initiateSchedulingTool = currentAgent?.toolLogic?.initiateScheduling;
          
          if (typeof initiateSchedulingTool === 'function') {
            try {
              const schedulingResult = await initiateSchedulingTool({}, transcriptItems || []);
              console.log("[handleFunctionCall] initiateScheduling result:", schedulingResult);
              
              // Process the scheduling result like any other tool result
              if (schedulingResult && schedulingResult.destination_agent) {
                // This should transfer to scheduleMeeting agent
                // Process the transfer logic below
                fnResult = schedulingResult; // Replace fnResult with scheduling result
              }
            } catch (error) {
              console.error("[handleFunctionCall] Error calling initiateScheduling:", error);
            }
          }
        }

        // CRITICAL: Check if this is part of a scheduling flow BEFORE handling suggested_next_action
        const isSchedulingFlow = functionCallParams.name === 'updateActiveProject' && 
                                 transcriptItems && transcriptItems.length > 0 &&
                                 transcriptItems[transcriptItems.length - 1]?.text?.toLowerCase().includes('schedule') ||
                                 transcriptItems[transcriptItems.length - 1]?.text?.toLowerCase().includes('book') ||
                                 transcriptItems[transcriptItems.length - 1]?.text?.toLowerCase().includes('visit') ||
                                 transcriptItems[transcriptItems.length - 1]?.text?.toLowerCase().includes('appointment');

        // Check the most recent detectPropertyInMessage result for scheduling intent
        let wasScheduleRequest = false;
        if (functionCallParams.name === 'updateActiveProject') {
          // First priority: Check stored detection result from the previous detectPropertyInMessage call
          if (lastDetectionResultRef.current?.isScheduleRequest === true) {
            wasScheduleRequest = true;
            console.log(`🔍 [SCHEDULING DETECTION] ✅ Using stored detection result: isScheduleRequest = true`);
          } else {
            // Fallback: Look for recent scheduling detection in the conversation context
            // This is a more reliable way to detect if we're in a scheduling flow
            const recentTranscript = transcriptItems?.slice(-5) || []; // Check last 5 items
            wasScheduleRequest = recentTranscript.some(item => 
              item.text && item.role === 'user' && (
                item.text.toLowerCase().includes('schedule') ||
                item.text.toLowerCase().includes('book') ||
                item.text.toLowerCase().includes('visit') ||
                item.text.toLowerCase().includes('appointment') ||
                item.text.toLowerCase().includes('tour')
              )
            );
            
            console.log(`🔍 [SCHEDULING DETECTION] Checking if updateActiveProject is part of scheduling flow:`);
            console.log(`🔍 [SCHEDULING DETECTION] Recent user messages:`, recentTranscript.filter(item => item.role === 'user').map(item => item.text));
            console.log(`🔍 [SCHEDULING DETECTION] Scheduling intent detected: ${wasScheduleRequest}`);
          }
        }

        if (wasScheduleRequest && functionCallParams.name === 'updateActiveProject') {
          console.log("🚨🚨🚨 [SCHEDULING FLOW] updateActiveProject completed in scheduling context - calling initiateScheduling instead of suggested action");
          
          // Clear the stored detection result since we're using it now
          lastDetectionResultRef.current = null;
          
          // Get the current agent and call initiateScheduling immediately
          const currentAgent = selectedAgentConfigSet?.find(a => a.name === selectedAgentName);
          const initiateSchedulingTool = currentAgent?.toolLogic?.initiateScheduling;
          
          if (typeof initiateSchedulingTool === 'function') {
            try {
              const schedulingResult = await initiateSchedulingTool({}, transcriptItems || []);
              console.log("🚨🚨🚨 [SCHEDULING FLOW] initiateScheduling result:", schedulingResult);
              
              // Process the scheduling result like any other tool result
              if (schedulingResult && schedulingResult.destination_agent) {
                // This should transfer to scheduleMeeting agent
                fnResult = schedulingResult; // Replace fnResult with scheduling result
                console.log("🚨🚨🚨 [SCHEDULING FLOW] Proceeding with transfer to scheduling agent");
              }
            } catch (error) {
              console.error("🚨🚨🚨 [SCHEDULING FLOW] Error calling initiateScheduling:", error);
            }
          }
        } 
        // ✅ REMOVED: No more automatic tool calling after updateActiveProject
        // Let the LLM intelligently choose the next tool based on user intent

        // --- Centralized UI Update Logic based on fnResult ---
        if (fnResult && fnResult.ui_display_hint) {
          console.log(`[handleFunctionCall] Received UI display hint: ${fnResult.ui_display_hint}`);
          setActiveDisplayMode(fnResult.ui_display_hint as ActiveDisplayMode); // Cast to ensure type safety

          // Clear all view-specific data first for a clean slate unless specified otherwise
          setPropertyListData(null);
          setSelectedPropertyDetails(null);
          setPropertyGalleryData(null);
          setLocationMapData(null);
          setBrochureData(null);
          // Other view-specific data setters can be called here with null

          // Populate data for the target mode
          if (fnResult.ui_display_hint === 'PROPERTY_LIST' && fnResult.properties) {
            setPropertyListData(fnResult.properties);
          } else if (fnResult.ui_display_hint === 'PROPERTY_DETAILS' && fnResult.property_details) {
            setSelectedPropertyDetails(fnResult.property_details);
          } else if (fnResult.ui_display_hint === 'IMAGE_GALLERY' && fnResult.images_data) {
            setPropertyGalleryData(fnResult.images_data);
          } else if (fnResult.ui_display_hint === 'LOCATION_MAP' && fnResult.location_data) {
            setLocationMapData(fnResult.location_data);
          } else if (fnResult.ui_display_hint === 'BROCHURE_VIEWER' && fnResult.brochure_data) {
            setBrochureData(fnResult.brochure_data);
          } else if (fnResult.ui_display_hint === 'SCHEDULING_FORM') {
            // Logic for scheduling form, e.g., if fnResult.scheduling_data exists
            // This might involve setting state for availableSlots, selectedProperty in chat.tsx
            // For now, just logging. The actual state update for slots happens in chat.tsx's handleServerEvent
            console.log("[handleFunctionCall] SCHEDULING_FORM hint. Data:", fnResult.scheduling_data);
          } else if (fnResult.ui_display_hint === 'VERIFICATION_FORM') {
            console.log("[handleFunctionCall] VERIFICATION_FORM hint.");
          } else if (fnResult.ui_display_hint === 'OTP_FORM') {
            console.log("[handleFunctionCall] OTP_FORM hint.");
          } else if (fnResult.ui_display_hint === 'VERIFICATION_SUCCESS') {
            console.log("[handleFunctionCall] VERIFICATION_SUCCESS hint - showing success message.");
            // Show success message, then after delay transition to CHAT
            // This ensures VERIFICATION_SUCCESS is not indefinite if the next step (e.g. booking confirmation) is delayed
            setTimeout(() => {
              // Check current mode before transitioning, to avoid overriding a more specific mode like BOOKING_CONFIRMATION
              // This requires access to the current activeDisplayMode state, which is not directly available here.
              // For simplicity, we'll just set to CHAT. If BOOKING_CONFIRMATION comes later, it will override CHAT.
              console.log("[handleFunctionCall] Transitioning from VERIFICATION_SUCCESS to CHAT after 3 seconds (if not overridden).");
              setActiveDisplayMode('CHAT');
            }, 3000); // Show success message UI for 3 seconds before defaulting to CHAT
          } else if (fnResult.ui_display_hint === 'BOOKING_CONFIRMATION' && fnResult.booking_details) {
            console.log(`[handleFunctionCall] BOOKING_CONFIRMATION hint - showing booking details card`);
            if (setBookingDetails) {
              setBookingDetails(fnResult.booking_details);
            }
            setActiveDisplayMode('BOOKING_CONFIRMATION');
            
            // Give enough time to see the booking details card
            setTimeout(() => {
              console.log(`[handleFunctionCall] Transitioning from BOOKING_CONFIRMATION to CHAT`);
              setActiveDisplayMode('CHAT');
            }, 15000); // 15 seconds delay to give more time to see the details
          }
          // If the mode is CHAT, data was already cleared.
        } else if (fnResult && !fnResult.destination_agent) {
          // If no specific UI hint, but not a transfer, we need to be careful about when to default to CHAT
          // to avoid closing property details when processing trigger messages
          
          // Check if this is a trigger message processing (detectPropertyInMessage or updateActiveProject)
          // and we're currently showing property details - in that case, preserve the current mode
          const isInternalManagementTool = functionCallParams.name === 'detectPropertyInMessage' || 
                                          functionCallParams.name === 'updateActiveProject' ||
                                          functionCallParams.name === 'trackUserMessage';
          
          if (isInternalManagementTool) {
            console.log(`[handleFunctionCall] Internal management tool "${functionCallParams.name}" executed, preserving current display mode and allowing agent to continue`);
            // Don't change the display mode for internal management tools
            // But DO allow the agent to continue processing (don't return early)
          } else {
            console.log("[handleFunctionCall] No UI hint from tool, defaulting to CHAT display mode.");
            
            // If this is a verification result, delay setting activeDisplayMode back to CHAT to 
            // allow verification success UI to be visible longer
            if (fnResult && fnResult.verified === true) {
              console.log("[handleFunctionCall] Delaying CHAT mode after successful verification");
              setTimeout(() => {
                // If there's scheduling data, ensure we process it correctly
                const metadataAny = currentAgent.metadata as any;
                let hasTriggeredConfirmation = false;
                
                setTimeout(() => {
                  if (metadataAny?.selectedDate && metadataAny?.selectedTime && metadataAny?.property_name && !hasTriggeredConfirmation) {
                    console.log("[handleFunctionCall] Found scheduling data after verification");
                    hasTriggeredConfirmation = true;
                    
                    // Call completeScheduling to show the confirmation message
                    const toolFunction = currentAgent?.toolLogic?.completeScheduling;
                    if (typeof toolFunction === 'function') {
                      console.log("[handleFunctionCall] Calling completeScheduling to show booking confirmation");
                      toolFunction({}, transcriptItems || []).then((result: any) => {
                        if (result.message) {
                          const newMessageId = generateSafeId();
                          sendClientEvent({
                            type: "conversation.item.create", 
                            item: {
                              id: newMessageId,
                              type: "message",
                              role: "assistant",
                              content: [{ type: "text", text: result.message }]
                            }
                          }, "(scheduling confirmation message)");
                          
                          // Set a small delay before transitioning to CHAT mode
                          setTimeout(() => {
                            setActiveDisplayMode('CHAT');
                          }, 1000);
                        }
                      });
                    }
                  } else {
                    // If no scheduling data, just transition to CHAT mode
                    setActiveDisplayMode('CHAT');
                  }
                }, 3000);
              }, 3000);
            } else {
              setActiveDisplayMode('CHAT');
            }
            
            setPropertyListData(null);
            setSelectedPropertyDetails(null);
            setPropertyGalleryData(null);
          }
        }
        // --- End of Centralized UI Update Logic ---

        if (fnResult && fnResult.destination_agent) {
          // Check if the transfer was blocked (e.g., due to user already being verified)
          if (fnResult.success === false) {
            console.log("[handleFunctionCall] Transfer was blocked:", fnResult.error || "Unknown reason");
            
            // Send the blocked transfer result as function output
            sendClientEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: functionCallParams.call_id,
                output: JSON.stringify(fnResult),
              },
            });
            sendClientEvent({ type: "response.create" });
            return; // Don't proceed with transfer
          }
          
          // ... (rest of existing agent transfer logic) ...

          // The new agent, upon activation, might send an initial message/tool call that sets its own UI mode.
          // For example, scheduleMeetingAgent immediately calls getAvailableSlots.
          // Consider if setActiveDisplayMode('CHAT') is needed here before transfer, or if new agent handles it.
          isTransferringAgentRef.current = true;
          agentBeingTransferredToRef.current = fnResult.destination_agent; // Store the target agent
          
          const isSilent = fnResult.silentTransfer === true;

          console.log(
            `[handleFunctionCall] ${isSilent ? 'Silently transferring' : 'Transferring'} to agent: ${fnResult.destination_agent}`
          );
          const newAgentConfig = selectedAgentConfigSet?.find(
            (a) => a.name === fnResult.destination_agent
          );

          if (newAgentConfig) {
            const cameFromContext = fnResult.came_from || currentAgent.metadata?.came_from || currentAgent.name;

            // Start with the default metadata from the new agent's config, then layer existing, then fnResult
            let newAgentPreparedMetadata: AgentMetadata = {
              ...(newAgentConfig.metadata || {}), // Base: New agent's default metadata
              ...(currentAgent.metadata || {}),   // Layer: Old agent's metadata (for continuity of session/org IDs etc.)
              
              // Ensure critical IDs are robustly determined, preferring current, then newConfig default, then generated
              chatbot_id: currentAgent.metadata?.chatbot_id || newAgentConfig.metadata?.chatbot_id,
              org_id: currentAgent.metadata?.org_id || newAgentConfig.metadata?.org_id,
              session_id: currentAgent.metadata?.session_id || newAgentConfig.metadata?.session_id || generateSafeId(),

              // CRITICAL: Preserve language setting during transfers
              language: currentAgent.metadata?.language || newAgentConfig.metadata?.language || "English",

              ...(fnResult as any), // Layer: Fields from the transferring tool's result (takes highest precedence for its specific fields)
              
              came_from: cameFromContext, // Explicitly set came_from
              
              // CRITICAL: Properly pass flow_context for authentication
              flow_context: fnResult.flow_context || (currentAgent.metadata as any)?.flow_context,
              pending_question: fnResult.pending_question || (currentAgent.metadata as any)?.pending_question,
            };

            // Debug log to check if property information is being transferred correctly
            console.log("[handleFunctionCall] Transfer debug - fnResult property fields:", {
              property_name: (fnResult as any)?.property_name,
              property_id_to_schedule: (fnResult as any)?.property_id_to_schedule,
              active_project: (fnResult as any)?.active_project,
              active_project_id: (fnResult as any)?.active_project_id
            });
            console.log("[handleFunctionCall] Transfer debug - currentAgent metadata property fields:", {
              property_name: (currentAgent.metadata as any)?.property_name,
              active_project: currentAgent.metadata?.active_project,
              active_project_id: (currentAgent.metadata as any)?.active_project_id
            });

            // Clean up transfer-control fields from the final metadata object
            delete (newAgentPreparedMetadata as any).destination_agent;
            delete (newAgentPreparedMetadata as any).silentTransfer;
            delete (newAgentPreparedMetadata as any).error; 
            delete (newAgentPreparedMetadata as any).success; // also remove general success flags if they exist from tool result

            newAgentConfig.metadata = newAgentPreparedMetadata;
            
            console.log("[handleFunctionCall] Final merged metadata for new agent:", newAgentConfig.metadata);

            // CRITICAL DEBUG: Log verification status transfer
            console.log(`🔍 [handleFunctionCall] is_verified status transfer: ${currentAgent.metadata?.is_verified} → ${newAgentConfig.metadata?.is_verified}`);

            // First cancel any active response to avoid the "conversation_already_has_active_response" error
            if (hasActiveResponseRef.current) {
              console.log("[handleFunctionCall] Cancelling active response before transfer");
              sendClientEvent({ type: "response.cancel" }, "(cancelling before transfer)");
              // Short delay to ensure the cancellation is processed
              await delay(100);
              hasActiveResponseRef.current = false;
            }
            
            // Update the agent state in the parent component
            setSelectedAgentName(fnResult.destination_agent);
            if (newAgentConfig?.metadata) {
              setAgentMetadata(newAgentConfig.metadata);
            }

            // ALL transfers should be silent by default
            let silentTransfer = isSilent || true; // Force silent transfers - ALL agent transfers should be silent
            // Check if this is the scheduling agent (should be silent)
            if (newAgentConfig && newAgentConfig.name === "scheduleMeeting") {
              console.log("[handleFunctionCall] Always performing silent transfer to scheduling agent");
              silentTransfer = true; // Always silent transfer for scheduleMeeting
            }
            
            // Authentication agent transfers should also be silent
            if (newAgentConfig && newAgentConfig.name === "authentication") {
              console.log("[handleFunctionCall] Always performing silent transfer to authentication agent");
              silentTransfer = true; // Always silent transfer for authentication
              
              // Special handling for authentication - preserve VERIFICATION_FORM display mode
              if (fnResult.ui_display_hint === 'VERIFICATION_FORM') {
                setActiveDisplayMode('VERIFICATION_FORM');
                console.log("[handleFunctionCall] Setting VERIFICATION_FORM mode for authentication transfer");
              }
            }

            // Use silentTransfer variable for the condition
            if (silentTransfer) {
              console.log("[handleFunctionCall] Silent transfer - skipping function_call_output event.");
              
              // ADD BACK: Automatic response trigger specifically for scheduleMeeting agent
              if (newAgentConfig && newAgentConfig.name === "scheduleMeeting") {
                console.log("[handleFunctionCall] Scheduling agent transfer - triggering automatic welcome/slot fetch");
                // Allow a small delay for the transfer to complete before triggering the response
                setTimeout(() => {
                  // Before creating a new response, make sure there's no active one
                  if (hasActiveResponseRef.current) {
                    console.log("[handleFunctionCall] Cancelling active response before triggering new one");
                    sendClientEvent({ type: "response.cancel" }, "(cancelling before new response)");
                    // Short delay to ensure the cancellation is processed
                    setTimeout(() => {
                      // First send a simulated message to trigger the scheduling agent
                      const simulatedMessageId = generateSafeId();
                      console.log("[handleFunctionCall] Sending simulated message to scheduleMeeting agent: 'Hello, I need help with booking a visit. Please show me available dates.'");
                      
                      sendClientEvent({
                        type: "conversation.item.create", 
                        item: {
                          id: simulatedMessageId,
                          type: "message",
                          role: "user",
                          content: [{ type: "input_text", text: "Hello, I need help with booking a visit. Please show me available dates." }]
                        }
                      }, "(simulated message for scheduling)");
                      
                      // Then trigger a response to that message
                      setTimeout(() => {
                        sendClientEvent({ type: "response.create" }, "(auto-trigger response after scheduling transfer)");
                      }, 100);
                    }, 100);
                  } else {
                    // No need to send simulated message - slots are loaded manually in newchat.tsx
                    console.log("[handleFunctionCall] Scheduling agent transfer complete - slots will be loaded manually");
                  }
                }, 200); // Increased delay
              }
              
              // Also trigger automatic response for authentication agent transfers
              if (newAgentConfig && newAgentConfig.name === "authentication") {
                console.log("[handleFunctionCall] Authentication agent transfer - triggering automatic response");
                
                // Special handling for authentication - preserve VERIFICATION_FORM display mode after transfer
                const preserveVerificationForm = fnResult.ui_display_hint === 'VERIFICATION_FORM';
                
                // Always ensure we're in VERIFICATION_FORM mode
                if (typeof setActiveDisplayMode === 'function') {
                  console.log("[handleFunctionCall] Setting VERIFICATION_FORM mode for authentication agent");
                  setActiveDisplayMode('VERIFICATION_FORM');
                }
                
                setTimeout(() => {
                  // Before creating a new response, make sure there's no active one
                  if (hasActiveResponseRef.current) {
                    console.log("[handleFunctionCall] Cancelling active response before triggering new one");
                    sendClientEvent({ type: "response.cancel" }, "(cancelling before new response)");
                    // Short delay to ensure the cancellation is processed
                    setTimeout(() => {
                      // For authentication, set the UI mode explicitly again right before sending response
                      if (preserveVerificationForm || true) {
                        console.log("[handleFunctionCall] Preserving VERIFICATION_FORM mode after authentication transfer");
                        setActiveDisplayMode('VERIFICATION_FORM');
                      }
                      
                      // First send a simulated message to trigger the authentication agent
                      const simulatedAuthMessageId = generateSafeId();
                      console.log("[handleFunctionCall] Sending simulated message to authentication agent: 'I need to verify my details'");
                      
                      sendClientEvent({
                        type: "conversation.item.create", 
                        item: {
                          id: simulatedAuthMessageId,
                          type: "message",
                          role: "user",
                          content: [{ type: "input_text", text: "I need to verify my details" }]
                        }
                      }, "(simulated message for authentication)");
                      
                      // Then trigger a response to that message
                      setTimeout(() => {
                        sendClientEvent({ type: "response.create" }, "(auto-trigger response after authentication transfer)");
                      }, 100);
                    }, 100);
                  } else {
                    // For authentication, set the UI mode explicitly again right before sending response
                    if (preserveVerificationForm || true) {
                      console.log("[handleFunctionCall] Preserving VERIFICATION_FORM mode after authentication transfer");
                      setActiveDisplayMode('VERIFICATION_FORM');
                    }
                    
                    // First send a simulated message to trigger the authentication agent
                    const simulatedAuthMessageId = generateSafeId();
                    console.log("[handleFunctionCall] Sending simulated message to authentication agent: 'I need to verify my details'");
                    
                    sendClientEvent({
                      type: "conversation.item.create", 
                      item: {
                        id: simulatedAuthMessageId,
                        type: "message",
                        role: "user",
                        content: [{ type: "input_text", text: "I need to verify my details" }]
                      }
                    }, "(simulated message for authentication)");
                    
                    // Then trigger a response to that message
                    setTimeout(() => {
                      sendClientEvent({ type: "response.create" }, "(auto-trigger response after authentication transfer)");
                    }, 100);
                  }
                }, 200);
              } else if (newAgentConfig && newAgentConfig.name === "realEstate" && (fnResult.flow_context === "from_scheduling_verification" || (newAgentPreparedMetadata as any).flow_context === "from_scheduling_verification")) {
                // ENHANCED handling for return to realEstate after scheduling - DIRECTLY call completeScheduling
                console.log("🚨🚨🚨 [handleFunctionCall] realEstate agent transfer after scheduling - DIRECTLY calling completeScheduling");
                
                // Clear the flow context to prevent loops
                if (newAgentConfig.metadata) {
                  delete (newAgentConfig.metadata as any).flow_context;
                  console.log("[handleFunctionCall] Cleared flow_context from realEstate agent metadata");
                }
                
                // DIRECT APPROACH: Call completeScheduling immediately instead of relying on trigger messages
                setTimeout(() => {
                  // Cancel any active response first
                  if (hasActiveResponseRef.current) {
                    console.log("🚨🚨🚨 [handleFunctionCall] Cancelling active response before calling completeScheduling");
                    sendClientEvent({ type: "response.cancel" }, "(cancelling before completeScheduling)");
                    hasActiveResponseRef.current = false;
                  }
                  
                  // Wait for cancellation to process, then call completeScheduling directly
                  setTimeout(() => {
                    console.log("🚨🚨🚨 [handleFunctionCall] Calling completeScheduling DIRECTLY");
                    
                    // Get the completeScheduling tool and call it directly
                    const completeSchedulingTool = newAgentConfig?.toolLogic?.completeScheduling;
                    console.log("🚨🚨🚨 [handleFunctionCall] Checking completeScheduling tool:", {
                      toolExists: !!completeSchedulingTool,
                      toolType: typeof completeSchedulingTool,
                      agentName: newAgentConfig?.name,
                      availableTools: Object.keys(newAgentConfig?.toolLogic || {})
                    });
                    
                    if (typeof completeSchedulingTool === 'function') {
                      console.log("🚨🚨🚨 [handleFunctionCall] Calling completeScheduling with agent:", newAgentConfig.name);
                      
                      completeSchedulingTool({}, transcriptItems || []).then((result: any) => {
                        console.log("🚨🚨🚨 [handleFunctionCall] Direct completeScheduling result:", result);
                        
                        if (result && result.message) {
                          const newMessageId = generateSafeId();
                          console.log("🚨🚨🚨 [handleFunctionCall] Adding booking confirmation message to conversation");
                          
                          sendClientEvent({
                            type: "conversation.item.create", 
                            item: {
                              id: newMessageId,
                              type: "message",
                              role: "assistant",
                              content: [{ type: "text", text: result.message }]
                            }
                          }, "(booking confirmation message)");
                          
                          // Handle UI display hint if present
                          if (result.ui_display_hint === 'BOOKING_CONFIRMATION' && result.booking_details) {
                            console.log("🚨🚨🚨 [handleFunctionCall] Setting BOOKING_CONFIRMATION UI mode with details:", result.booking_details);
                            setActiveDisplayMode('BOOKING_CONFIRMATION');
                            if (setBookingDetails) {
                              setBookingDetails(result.booking_details);
                            }
                            
                            // Transition back to CHAT after showing booking details
                            setTimeout(() => {
                              console.log("🚨🚨🚨 [handleFunctionCall] Transitioning from BOOKING_CONFIRMATION to CHAT");
                              setActiveDisplayMode('CHAT');
                            }, 15000);
                          } else {
                            console.log("🚨🚨🚨 [handleFunctionCall] No booking details in result, setting CHAT mode");
                            setActiveDisplayMode('CHAT');
                          }
                        } else {
                          console.error("🚨🚨🚨 [handleFunctionCall] completeScheduling returned no message:", result);
                          // Still clear the scheduling form even if there's no message
                          setActiveDisplayMode('CHAT');
                          
                          // Add a fallback message
                          const fallbackMessageId = generateSafeId();
                          sendClientEvent({
                            type: "conversation.item.create", 
                            item: {
                              id: fallbackMessageId,
                              type: "message",
                              role: "assistant",
                              content: [{ type: "text", text: "Your visit has been scheduled successfully! You'll receive confirmation details shortly." }]
                            }
                          }, "(fallback booking message)");
                        }
                      }).catch((error: any) => {
                        console.error("🚨🚨🚨 [handleFunctionCall] Error calling completeScheduling directly:", error);
                        setActiveDisplayMode('CHAT');
                        
                        // Add a fallback message even on error
                        const errorFallbackMessageId = generateSafeId();
                        sendClientEvent({
                          type: "conversation.item.create", 
                          item: {
                            id: errorFallbackMessageId,
                            type: "message",
                            role: "assistant",
                            content: [{ type: "text", text: "Your visit has been scheduled! You'll receive confirmation details shortly." }]
                          }
                        }, "(error fallback booking message)");
                      });
                    } else {
                      console.error("🚨🚨🚨 [handleFunctionCall] completeScheduling tool not found on realEstate agent");
                      console.error("🚨🚨🚨 [handleFunctionCall] Available tools:", Object.keys(newAgentConfig?.toolLogic || {}));
                      setActiveDisplayMode('CHAT');
                    }
                  }, 200);
                }, 300);
              } else if (newAgentConfig && newAgentConfig.name === "realEstate" && (fnResult.flow_context === "from_question_auth" || (newAgentPreparedMetadata as any).flow_context === "from_question_auth")) {
                // Special handling for return to realEstate after authentication with pending question
                console.log("[handleFunctionCall] realEstate agent transfer after authentication - SENDING pending question immediately");
                
                // 🚨🚨🚨 CRITICAL: Reset authentication triggered flag after successful verification
                console.log("🚨🚨🚨 [AUTH RESET] Resetting authenticationTriggeredRef after successful verification");
                authenticationTriggeredRef.current = false;
                
                const pendingQuestion = fnResult.pending_question || (newAgentPreparedMetadata as any).pending_question;
                
                if (pendingQuestion) {
                  console.log(`🚨🚨🚨 [PENDING QUESTION] Sending pending question immediately: "${pendingQuestion}"`);
                  
                  // Store the pending question for filtering from UI
                  // No longer using pending question filtering in simple auth approach
                  
                  // Clear the flow context to prevent loops
                  if (newAgentConfig.metadata) {
                    delete (newAgentConfig.metadata as any).flow_context;
                    delete (newAgentConfig.metadata as any).pending_question;
                    console.log("[handleFunctionCall] Cleared flow_context and pending_question from metadata");
                  }
                  
                  // Set the display mode to show verification success (longer duration)
                  console.log("🚨🚨🚨 [VERIFICATION SUCCESS] Showing verification success page for 3 seconds");
                  setActiveDisplayMode('VERIFICATION_SUCCESS');
                  
                  // Clear verification success after 3 seconds and switch to CHAT
                  setTimeout(() => {
                    console.log("🚨🚨🚨 [VERIFICATION SUCCESS] Switching from verification success to CHAT mode");
                    setActiveDisplayMode('CHAT');
                  }, 2000);
                  
                  // Send the pending question immediately like a simulated message
                  setTimeout(() => {
                    // Cancel any active response first
                    if (hasActiveResponseRef.current) {
                      console.log("[handleFunctionCall] Cancelling active response before sending pending question");
                      sendClientEvent({ type: "response.cancel" }, "(cancelling before pending question)");
                      hasActiveResponseRef.current = false;
                    }
                    
                    // Wait for cancellation to process
                    setTimeout(() => {
                      const pendingMessageId = generateSafeId();
                      console.log(`🚨🚨🚨 [PENDING QUESTION] Sending pending question as user message: "${pendingQuestion}"`);
                      
                      sendClientEvent({
                        type: "conversation.item.create",
                        item: {
                          id: pendingMessageId,
                          type: "message",
                          role: "user",
                          content: [{ type: "input_text", text: pendingQuestion }]
                        }
                      }, "(pending question after authentication)");
                      
                      // Trigger response to process the pending question
                      setTimeout(() => {
                        console.log(`🚨🚨🚨 [PENDING QUESTION] Triggering response for pending question`);
                        sendClientEvent({ type: "response.create" }, "(response for pending question)");
                      }, 100);
                    }, 200);
                  }, 500); // Small delay to show verification success first
                } else {
                  console.warn("[handleFunctionCall] No pending question found after authentication transfer");
                  
                  // Show verification success page even without pending question
                  console.log("🚨🚨🚨 [VERIFICATION SUCCESS] Showing verification success page for 3 seconds (no pending question)");
                  setActiveDisplayMode('VERIFICATION_SUCCESS');
                  
                  // Clear verification success after 3 seconds and switch to CHAT
                  setTimeout(() => {
                    console.log("🚨🚨🚨 [VERIFICATION SUCCESS] Switching from verification success to CHAT mode");
                    setActiveDisplayMode('CHAT');
                  }, 2000);
                  
                  // Even if no pending question, we should trigger a response for the transfer
                  setTimeout(() => {
                    if (!hasActiveResponseRef.current) {
                      console.log("[handleFunctionCall] Triggering response for authentication transfer without pending question");
                      sendClientEvent({ type: "response.create" }, "(trigger response after auth transfer)");
                    }
                  }, 300);
                }
              }
            } else {
              // Only send non-silent transfers (should be rare or never used now)
              sendClientEvent({
                type: "conversation.item.create",
                item: {
                  id: generateSafeId(),
                  type: "function_call_output",
                  call_id: functionCallParams.call_id,
                  output: JSON.stringify({
                    status: newAgentConfig ? "Transfer successful" : "Transfer failed: Agent not found",
                    transferred_to: fnResult.destination_agent,
                    ...(newAgentConfig ? {} : {error: `Agent ${fnResult.destination_agent} not found`})
                  }),
                },
              });
            }

            // Set a timeout to reset the transferring flag
            // setTimeout(() => {
            //   isTransferringAgentRef.current = false;
            //   console.log("[handleFunctionCall] Reset transferring flag after timeout");
            // }, 500); // REMOVED TIMEOUT
            
            return; // Stop further processing in this handler
          } else {
              console.error(`[handleFunctionCall] Destination agent "${fnResult.destination_agent}" not found.`);
              // Inform the LLM about the failure
               sendClientEvent({
                   type: "conversation.item.create",
                   item: {
                       type: "function_call_output",
                       call_id: functionCallParams.call_id,
                       output: JSON.stringify({ error: `Agent ${fnResult.destination_agent} not found.` }),
                   },
               });
               sendClientEvent({ type: "response.create" }); // Let the current agent respond to the failure
               // Reset transferring flag
               isTransferringAgentRef.current = false;
               return;
          }
          // No return here if newAgentConfig was not found initially
        } // End of agent transfer logic


        // Handle silent tool calls (non-transfer)
        if (fnResult && fnResult.silent === true) {
          console.log(
            `[handleFunctionCall] Silent mode for ${functionCallParams.name}, not sending output to LLM.`
          );
          // Optional: Decide if a response.create is still needed even for silent tools
          // sendClientEvent({ type: "response.create" });
          return;
        }

        // Specific handling for getAvailableSlots (might be redundant now but keep for safety)
        if (functionCallParams.name === "getAvailableSlots") {
          // No need to call fn again, we already have fnResult
          console.log("[handleFunctionCall] getAvailableSlots result:", fnResult);
          
          // Store the property_id in the agent's metadata for later use
          if (fnResult.property_id && currentAgent.metadata) {
            console.log(`[handleFunctionCall] Storing property_id from getAvailableSlots: ${fnResult.property_id}`);
            (currentAgent.metadata as any).lastReturnedPropertyId = fnResult.property_id;
          }
          
          // Send function output
          sendClientEvent({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: functionCallParams.call_id,
              output: JSON.stringify(fnResult),
            },
          });
          sendClientEvent({ type: "response.create" });
          return; // Skip the regular function handling below
        }

        // Specific handling for completeScheduling
        if (functionCallParams.name === "completeScheduling") {
          console.log("🚨🚨🚨 [handleFunctionCall] completeScheduling TOOL CALLED - ensuring proper processing:", fnResult);
          
          // This tool should ALWAYS return a booking confirmation message and UI hint
          if (!fnResult.ui_display_hint) {
            console.warn("[handleFunctionCall] completeScheduling did not return ui_display_hint, adding default");
            fnResult.ui_display_hint = 'BOOKING_CONFIRMATION';
          }
          
          // Send function output
          sendClientEvent({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: functionCallParams.call_id,
              output: JSON.stringify(fnResult),
            },
          });
          sendClientEvent({ type: "response.create" });
          
          return; // Skip the regular function handling below
        }

        // Special handling for scheduleVisit function result
        if (fnResult && functionCallParams.name === "scheduleVisit") {
          console.log("[handleFunctionCall] scheduleVisit result processed:", fnResult);
          // No fallback needed - scheduleVisit now properly transfers to realEstate agent
        }

        // Check if this was a completeScheduling call
        if (functionCallParams.name === "completeScheduling") {
          console.log("[handleFunctionCall] completeScheduling called successfully");
        }

        // Send regular function output for other non-silent, non-transferring tools
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: functionCallParams.call_id,
            output: JSON.stringify(fnResult),
          },
        });
        sendClientEvent({ type: "response.create" });

      } else {
        // Handle case where tool logic is NOT found for the current agent
        console.error(`[handleFunctionCall] Tool logic for function "${functionCallParams.name}" not found on agent "${selectedAgentName}".`);
        
        // Create a more helpful error response based on the specific agent/tool combination
        let errorMessage = `Agent ${selectedAgentName} cannot perform action ${functionCallParams.name}.`;
        let suggestedAction = "";
        
        // Add agent-specific suggestions for common mistaken tool calls
        if (selectedAgentName === "scheduleMeeting" && functionCallParams.name === "initiateScheduling") {
          errorMessage = "The scheduleMeeting agent cannot call initiateScheduling.";
          suggestedAction = "You should call getAvailableSlots to show available dates and times.";
        } else if (selectedAgentName === "authentication" && functionCallParams.name === "completeScheduling") {
          errorMessage = "The authentication agent cannot complete scheduling directly.";
          suggestedAction = "You should call verifyOTP to complete the authentication process.";
        } else if (selectedAgentName === "authentication" && functionCallParams.name === "initiateScheduling") {
          errorMessage = "The authentication agent cannot initiate scheduling.";
          suggestedAction = "You should complete verification with submitPhoneNumber and verifyOTP.";
        }
        
        const errorResult = { 
          error: errorMessage,
          suggested_action: suggestedAction,
          ui_display_hint: getAgentDefaultUiHint(selectedAgentName) // Helper function to determine appropriate UI state
        };
        
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: functionCallParams.call_id,
            output: JSON.stringify(errorResult),
          },
        });
        // Trigger a response so the agent can explain the error
        sendClientEvent({ type: "response.create" }); 
      }
    } catch (error: any) {
      console.error(
        `[handleFunctionCall] Error parsing arguments or executing ${functionCallParams.name}:`,
        error
      );
      const errorResult = { error: `Failed to process function call ${functionCallParams.name}: ${error.message}` };

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(errorResult),
        },
      });
      // Decide if we should trigger a response even if the tool failed
       sendClientEvent({ type: "response.create" });
    }
  };


  const handleServerEvent = (serverEvent: ServerEvent) => {
    //  console.log("[Server Event]", serverEvent.type, serverEvent); // Basic logging

    switch (serverEvent.type) {
      case "session.created": {
        if (serverEvent.session?.id) {
          setSessionStatus("CONNECTED");
          // Match old code by adding a system message with connection info
          addTranscriptMessage(generateSafeId(), 'system', 'Connection established.');
        }
        break;
      }

      case "session.updated": {
        // Session was updated successfully, no action needed
        // console.log(`[Server Event] Session updated successfully`);
        break;
      }

      case "input_audio_buffer.cleared": {
        // Audio buffer cleared, no action needed
        // console.log(`[Server Event] Input audio buffer cleared`);
        break;
      }

      case "response.function_call_arguments.delta":
      case "response.function_call_arguments.done": {
        // Function call arguments streaming events, can be ignored for now
        // These are used for streaming updates during function call argument formation
        // console.log(`[Server Event] Function call arguments ${serverEvent.type === 'response.function_call_arguments.done' ? 'completed' : 'updated'}`);
        break;
      }

      case "output_audio_buffer.stopped": {
        // Audio playback actually stopped - user stopped hearing the agent
        const currentAgentNameInResponse = selectedAgentName;
        console.log(`🔊 [AUDIO BUFFER STOPPED] ${currentAgentNameInResponse.toUpperCase()} audio playback stopped`);
        
        // This is the perfect time to trigger authentication - when user truly stops hearing the agent
        // BUT ONLY if user is not already verified
        const currentAgent = selectedAgentConfigSet?.find(a => a.name === selectedAgentName);
        const isVerified = currentAgent?.metadata?.is_verified ?? false;
        
        if (authenticationTriggeredRef.current && !isTransferringAgentRef.current && currentAgentNameInResponse === 'realEstate' && !isVerified) {
          console.log(`🚨🚨🚨 [BUFFER AUTH] Audio buffer stopped - triggering authentication for unverified user`);
          
          // Find authentication agent
          const authAgent = selectedAgentConfigSet?.find((a: any) => a.name === 'authentication');
          const currentAgent = selectedAgentConfigSet?.find(a => a.name === selectedAgentName);
          
          if (authAgent && currentAgent) {
            // Disable mic to prevent new input during transition
            console.log(`🚨🚨🚨 [MIC CONTROL] Disabling mic for authentication transition`);
            setMicMuted(true);
            
            setTimeout(() => {
              // Prepare metadata for authentication agent
              const newAgentMetadata: AgentMetadata = {
                ...(currentAgent.metadata || {}),
                ...(authAgent.metadata || {}),
                // Preserve critical fields
                chatbot_id: currentAgent.metadata?.chatbot_id || authAgent.metadata?.chatbot_id,
                org_id: currentAgent.metadata?.org_id || authAgent.metadata?.org_id,
                session_id: currentAgent.metadata?.session_id || authAgent.metadata?.session_id,
                language: currentAgent.metadata?.language || authAgent.metadata?.language || "English",
                // Set authentication context
                flow_context: 'from_question_auth',
                came_from: 'realEstate',
              } as any;
              
              authAgent.metadata = newAgentMetadata;
              
              // Switch to authentication agent
              setSelectedAgentName('authentication');
              setAgentMetadata(newAgentMetadata);
              setActiveDisplayMode('VERIFICATION_FORM');
              
              console.log(`🚨🚨🚨 [BUFFER AUTH] ✅ SWITCHED TO AUTHENTICATION AGENT`);
              
              // Trigger the authentication agent to speak its welcome message
              setTimeout(() => {
                // Cancel any active response first
                if (hasActiveResponseRef.current) {
                  console.log("🚨🚨🚨 [BUFFER AUTH] Cancelling active response before authentication trigger");
                  sendClientEvent({ type: "response.cancel" }, "(cancelling before auth trigger)");
                  hasActiveResponseRef.current = false;
                }
                
                // Wait for cancellation to process
                setTimeout(() => {
                  // Send a simulated message to trigger the authentication agent
                  const simulatedAuthMessageId = generateSafeId();
                  console.log("🚨🚨🚨 [BUFFER AUTH] Sending simulated message to authentication agent: 'I need to verify my details'");
                  
                  sendClientEvent({
                    type: "conversation.item.create", 
                    item: {
                      id: simulatedAuthMessageId,
                      type: "message",
                      role: "user",
                      content: [{ type: "input_text", text: "I need to verify my details" }]
                    }
                  }, "(simulated message for authentication)");
                  
                  // Trigger a response to that message
                  setTimeout(() => {
                    console.log("🚨🚨🚨 [BUFFER AUTH] Triggering response for authentication agent");
                    sendClientEvent({ type: "response.create" }, "(auto-trigger response after buffer auth)");
                  }, 100);
                }, 100);
              }, 100);
              
              // Mic will be re-enabled when auth UI is ready (in component)
            }, 200); // Even shorter delay since audio buffer has truly stopped
          }
        } else if (authenticationTriggeredRef.current && currentAgentNameInResponse === 'realEstate' && isVerified) {
          // User is already verified, just reset the authentication flag
          console.log(`🚨🚨🚨 [BUFFER AUTH] Audio buffer stopped but user is already verified - resetting authentication flag`);
          authenticationTriggeredRef.current = false;
        }
        break;
      }

      case "conversation.item.created": {
        const itemId = serverEvent.item?.id;
        const role = serverEvent.item?.role as "user" | "assistant" | "system";
        let text = serverEvent.item?.content?.[0]?.text ?? serverEvent.item?.content?.[0]?.transcript ?? "";
        const itemType = serverEvent.item?.type;
        const itemStatus = serverEvent.item?.status;
        
        // 🚨 COMPREHENSIVE AGENT RESPONSE LOGGING - ALWAYS LOG EVERY AGENT RESPONSE
        if (role === "assistant" && text && text.trim().length > 0) {
          const isComplete = itemStatus === "done" || itemStatus === "completed" || (serverEvent.item as any)?.done === true;
          const logPrefix = isComplete ? "🗣️ [AGENT COMPLETE]" : "📝 [AGENT STREAMING]";
          const displayText = text.length > 150 ? text.substring(0, 150) + "..." : text;
          
          console.log(`${logPrefix} ${selectedAgentName.toUpperCase()}: "${displayText}"`);
          console.log(`📊 [AGENT DETAILS] Agent: ${selectedAgentName} | Status: ${itemStatus} | Length: ${text.length} chars | ItemID: ${itemId?.substring(0, 8)}...`);
        }
        
        console.log("🎯 [CONVERSATION ITEM] Role:", role, "Text:", text, "Type:", itemType, "Agent:", selectedAgentName);

        if (!itemId || !role) break;
        if (transcriptItems?.some((item) => item.itemId === itemId && item.status !== 'IN_PROGRESS')) {
             console.log(`[Transcript] Skipping duplicate non-IN_PROGRESS item creation: ${itemId}`);
             break;
        }

        // AUTOMATIC QUESTION COUNTING - BULLETPROOF APPROACH
        if (role === "user" && text && selectedAgentName === 'realEstate') {
          console.log(`🚨🚨🚨 [Auto Counter] Processing user message: "${text}"`);
          console.log(`🚨🚨🚨 [Auto Counter] Role: ${role}, Agent: ${selectedAgentName}`);
          
          const currentAgent = selectedAgentConfigSet?.find(a => a.name === selectedAgentName);
          const isVerified = currentAgent?.metadata?.is_verified ?? false;
          
          // Skip counting if user is already verified
          if (isVerified) {
            console.log(`🚨🚨🚨 [Auto Counter] User is verified - skipping question counting`);
          } else {
            // Count real user questions automatically only if not verified
            if (isRealUserQuestion(text, selectedAgentName)) {
              console.log(`🚨🚨🚨 [Auto Counter] Message passed filter, proceeding to count`);
              console.log(`🚨🚨🚨 [Auto Counter] Current agent found:`, !!currentAgent);
              
              if (currentAgent) {
                // Initialize question count in metadata if not present
                if (!currentAgent.metadata) {
                  console.log(`🚨🚨🚨 [Auto Counter] Initializing metadata`);
                  currentAgent.metadata = {} as AgentMetadata;
                }
                
                const metadataWithCount = currentAgent.metadata as any; // Use any to add user_question_count
                const currentCount = metadataWithCount.user_question_count || 0;
                console.log(`🚨🚨🚨 [Auto Counter] Current question count: ${currentCount}`);
                
                if (!metadataWithCount.user_question_count) {
                  metadataWithCount.user_question_count = 0;
                  console.log(`🚨🚨🚨 [Auto Counter] Initialized question count to 0`);
                }
                
                // Increment question count
                metadataWithCount.user_question_count++;
                const questionCount = metadataWithCount.user_question_count;
                
                console.log(`🚨🚨🚨 [Auto Counter] ✅ QUESTION COUNT INCREMENTED TO: ${questionCount}`);
                console.log(`🚨🚨🚨 [Auto Counter] Message that triggered count: "${text}"`);
                
                console.log(`🚨🚨🚨 [Auto Counter] Should trigger auth? Count >= 6: ${questionCount >= 6}, Not verified: ${!isVerified}, Agent: ${selectedAgentName}`);
                
                                if (questionCount >= 6 && !authenticationTriggeredRef.current && String(selectedAgentName) !== "scheduleMeeting") {
                  console.log(`🚨🚨🚨 [AUTH TRIGGER] 🔥🔥🔥 AUTHENTICATION REQUIRED! Questions: ${questionCount}`);
                  
                  // Mark authentication as triggered to prevent duplicate triggers
                  authenticationTriggeredRef.current = true;
                  
                  console.log(`🚨🚨🚨 [AUTH TRIGGER] Waiting for agent response to complete naturally...`);
                  // Don't switch immediately - let the current response complete naturally
                  
                } else {
                  console.log(`🚨🚨🚨 [Auto Counter] No auth needed - continuing normal flow`);
                }
              } else {
                console.error(`🚨🚨🚨 [Auto Counter] ❌ Current agent not found!`);
              }
            } else {
              console.log(`🚨🚨🚨 [Auto Counter] Message filtered out, not counting`);
            }
          }
        } else {
          console.log(`🚨🚨🚨 [Auto Counter] Skipping - Role: ${role}, HasText: ${!!text}, Agent: ${selectedAgentName}`);
        }

        if (role === "user" && text === "hi" && serverEvent.item?.content?.[0]?.type === "input_text") {
          simulatedMessageIdRef.current = itemId;
          break;
        }

        // Filter out SPEAK trigger messages from transcript but allow agent processing
        if (role === "user" && text.startsWith('{Trigger msg: Say ')) {
          console.log(`[Transcript] Filtering SPEAK trigger from transcript: "${text}"`);
          break; // Don't add SPEAK triggers to the visible transcript
        }
        if (role === "user" && text.startsWith('My verification code ')) {
          console.log(`[Transcript] Filtering OTP verification message from transcript: "${text}"`);
          break; // Don't add OTP messages to the visible transcript
        }

        // Filter out all UI-generated messages from transcript
        if (role === "user") {
          const shouldFilter = 
            // OTP verification messages
            text === "Hello, I need help with booking a visit. Please show me available dates." ||
            text.toLowerCase().includes('hello, i need help with booking a visit') ||
            text.toLowerCase().includes('verification code') ||
            text.toLowerCase().includes('my code is') ||
            text.toLowerCase().includes('otp is') ||
            /verification code is \d{4,6}/.test(text.toLowerCase()) ||
            /my verification code is \d{4,6}/.test(text.toLowerCase()) ||
            (/\b\d{4,6}\b/.test(text) && selectedAgentName === 'authentication') ||
            
            // Verification form submission messages
            /my name is .+ and my phone number is .+/i.test(text) ||
            text.toLowerCase().includes('my name is') && text.toLowerCase().includes('phone number is') ||
            
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
            text.toLowerCase().includes('i would like to schedule') ||
            
            // Any message that looks like it's from a form or UI interaction
            (text.includes('.') && (
              text.toLowerCase().includes('selected') ||
              text.toLowerCase().includes('my ') ||
              text.toLowerCase().includes('verification') ||
              text.toLowerCase().includes('schedule')
            ));

          if (shouldFilter) {
            console.log(`[Transcript] Filtering UI-generated message from transcript: "${text}"`);
            break; // Don't add UI-generated messages to the visible transcript
          }
        }

        // Filter out pending questions from transcript - they should be processed but not shown to user
        if (role === "user" && (text === "I am interested in something else" || 
            text === "I need to verify my details")) {
          console.log(`[Transcript] Filtering internal/pending question from transcript: "${text}"`);
          break; // Don't add internal messages to the visible transcript
        }

        // No longer using pending question filtering with simple auth approach

        // Filter out TRIGGER_BOOKING_CONFIRMATION from transcript - it's an internal trigger
        if (role === "user" && text === "TRIGGER_BOOKING_CONFIRMATION") {
          console.log(`[Transcript] Filtering TRIGGER_BOOKING_CONFIRMATION from transcript: "${text}"`);
          break; // Don't add trigger messages to the visible transcript
        }

        if(isTransferringAgentRef.current && role==="assistant") {
          // console.log(`[Server Event Hook] Skipping item creation for agent transfer: ${itemId}`);
          break;
        }
        // If this is a function_call_output, its primary data (for UI state) should have been processed
        // by handleFunctionCall via fnResult.ui_display_hint.
        // Here, we mainly focus on adding the *message* part of the output to the transcript.
        if (itemType === "function_call_output") {
          const functionName = (serverEvent.item as any).name;
          const outputString = (serverEvent.item as any).output;
          // console.log(`[Server Event Hook] function_call_output for ${functionName}:`, outputString);
          if (outputString) {
            try {
              const outputData = JSON.parse(outputString);
              // Add message to transcript if present in the outputData from the tool.
              // The actual UI display (gallery, list, details) is driven by setActiveDisplayMode from handleFunctionCall.
              if (outputData.message) {
                // 🚨 LOG FUNCTION CALL OUTPUT MESSAGE
                console.log(`🔧 [TOOL RESPONSE] ${selectedAgentName.toUpperCase()} (${functionName}): "${outputData.message}"`);
                
                if (!transcriptItems?.some(item => item.itemId === itemId)) {
                    addTranscriptMessage(itemId, "assistant", outputData.message, outputData.properties || outputData.images || [], selectedAgentName);
                } else {
                    updateTranscriptMessage(itemId, outputData.message, false);
                }
              } else if (outputData.error) {
                // 🚨 LOG FUNCTION CALL ERROR
                console.log(`❌ [TOOL ERROR] ${selectedAgentName.toUpperCase()} (${functionName}): "${outputData.error}"`);
                
                 if (!transcriptItems?.some(item => item.itemId === itemId)) {
                    addTranscriptMessage(itemId, "assistant", `Error: ${outputData.error}`, [], selectedAgentName);
                 } else {
                    updateTranscriptMessage(itemId, `Error: ${outputData.error}`, false);
                 }
              } else if (functionName === 'getAvailableSlots' && outputData.slots) {
                 // 🚨 CRITICAL: Handle getAvailableSlots response and set UI state
                 console.log(`📅 [SLOTS RECEIVED] ${selectedAgentName.toUpperCase()}: slots data:`, outputData.slots);
                 
                 // Set the available slots in the UI state
                 if (setAvailableSlots) {
                   setAvailableSlots(outputData.slots);
                 }
                 
                 // Set up the scheduling UI
                 if (setShowTimeSlots) {
                   setShowTimeSlots(true);
                 }
                 
                 // Ensure we're in scheduling mode
                 setActiveDisplayMode('SCHEDULING_FORM');
                 
                 // Create/update property if needed
                 if (!outputData.property_id && setSelectedProperty) {
                   const propertyName = outputData.property_name || "Selected Property";
                   setSelectedProperty({
                     id: outputData.property_id || "default-property",
                     name: propertyName,
                     price: "Contact for pricing",
                     area: "Available on request",
                     description: `Schedule a visit to see ${propertyName} in person.`,
                     mainImage: "/placeholder.svg",
                   });
                 }
                                
                 // Add message to transcript
                 const defaultSlotsMessage = "Please select a date and time for your visit.";
                 const slotsMessage = outputData.message || outputData.text_message || defaultSlotsMessage;
               
                 // 🚨 LOG SCHEDULING SLOTS MESSAGE
                 console.log(`📅 [SCHEDULING RESPONSE] ${selectedAgentName.toUpperCase()}: "${slotsMessage}"`);
               
                 if (!transcriptItems?.some(item => item.itemId === itemId)) {
                    addTranscriptMessage(itemId, "assistant", slotsMessage, [], selectedAgentName); 
                 } else {
                    updateTranscriptMessage(itemId, slotsMessage, false);
                 }
              }
              // Do not return here for all function_call_outputs, let general message handling proceed if no specific message was added.
            } catch (error) {
              console.error(`[Transcript] Error parsing ${functionName} output in item.created:`, error);
              // Add a generic error to transcript if parsing fails
              if (!transcriptItems?.some(item => item.itemId === itemId)) {
                addTranscriptMessage(itemId, "assistant", "An error occurred processing the tool's response.");
              }
            }
          }
          // After processing the message part, if it was a function_call_output, often we don't want to fall through to general text processing
          // However, if the outputData.message was empty, we might want to. This logic needs care.
          // For now, if a message was added from outputData.message, we can break.
          if (JSON.parse(outputString || '{}').message || JSON.parse(outputString || '{}').error) break;
        }

        // --- Handle Regular Assistant Message ---
        if (serverEvent.type === "conversation.item.created" && serverEvent.item?.role === 'assistant') {
            let propertiesHandledLocally = false;
            let assistantMessageHandledLocally = false;
            let text = serverEvent.item?.content?.[0]?.text ?? serverEvent.item?.content?.[0]?.transcript ?? "";
            const itemId = serverEvent.item?.id;
            const itemStatus = serverEvent.item?.status;
            
            if (itemId && text) {
               // 🚨 COMPREHENSIVE LOGGING FOR REGULAR ASSISTANT MESSAGES
               const isComplete = itemStatus === "done" || itemStatus === "completed" || (serverEvent.item as any)?.done === true;
               const logPrefix = isComplete ? "💬 [REGULAR MESSAGE COMPLETE]" : "💬 [REGULAR MESSAGE STREAMING]";
               const displayText = text.length > 100 ? text.substring(0, 100) + "..." : text;
               
               console.log(`${logPrefix} ${selectedAgentName.toUpperCase()}: "${displayText}"`);
               console.log(`📋 [MESSAGE DETAILS] Agent: ${selectedAgentName} | Status: ${itemStatus} | Full Length: ${text.length} chars`);
               
               // ALWAYS LOG THE COMPLETE MESSAGE FOR DEBUGGING
               if (isComplete && text.length > 100) {
                 console.log(`📄 [FULL MESSAGE] ${selectedAgentName.toUpperCase()}: "${text}"`);
               }
               
               // Use a prefix to identify which agent sent the message
               let activeDisplayMode: string = 'CHAT';
               const agentPrefix = activeDisplayMode === 'SCHEDULING_FORM' ? '[Scheduler] ' : 
                                  selectedAgentName === 'authentication' ? '[Auth] ' : '';
               
               // Critical: For authentication agent, ensure we DON'T change the display mode
               // even though we're showing a message
               const preserveCurrentMode = selectedAgentName === 'authentication' && 
                                         activeDisplayMode === 'VERIFICATION_FORM';
               
               if (preserveCurrentMode) {
                 console.log('[Agent Response] Authentication agent responding, preserving VERIFICATION_FORM mode');
               }
               
               // Special case handling for scheduling agent messages
               if (selectedAgentName === 'scheduleMeeting') {
                 // Filter out premature scheduling confirmations before time selection is complete
                 let selectedTime: string | null = null;
                 if (!selectedTime && text.toLowerCase().includes('confirm') && 
                     (text.toLowerCase().includes('visit') || text.toLowerCase().includes('schedule'))) {
                   console.log(`[Agent Response] Filtering premature scheduling confirmation message`);
                   assistantMessageHandledLocally = true; // Skip adding this message
                   return;
                 }
                 
                 // Filter out repeat date selection prompts if we already have date selected
                 let selectedDay: string | null = null;
                 if (selectedDay && text.toLowerCase().includes('select a date') && 
                     text.toLowerCase().includes('calendar')) {
                   console.log(`[Agent Response] Filtering repeat date selection prompt (date already selected)`);
                   assistantMessageHandledLocally = true; // Skip adding this message
                   return;
                 }
               }
               
               // Utility function to generate an ID for new messages
               const localGenerateSafeId = () => {
                 return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
               };
               
               // If we're transitioning between agents, make it clear in the conversation
               const prevAgentNameRef = { current: selectedAgentName };
               if (prevAgentNameRef.current && prevAgentNameRef.current !== selectedAgentName) {
                 // Only for the first message from a new agent
                 const isFirstMessageFromAgent = !(transcriptItems.some(item => 
                   item.type === 'MESSAGE' && item.role === 'assistant' && 
                   item.agentName === selectedAgentName));
                   
                 if (isFirstMessageFromAgent) {
                   console.log(`[Agent Response] First message from new agent: ${selectedAgentName}`);
                   addTranscriptMessage(
                     localGenerateSafeId(),
                     'system',
                     `--- ${selectedAgentName === 'scheduleMeeting' ? 'Scheduling Assistant' : 
                        selectedAgentName === 'authentication' ? 'Authentication' : 
                        'Property Assistant'} ---`
                   );
                 }
               }
               
               // Add message to transcript with agent prefix and agent name
               addTranscriptMessage(itemId, 'assistant', agentPrefix + text, undefined, selectedAgentName);
               
               // Ensure we keep the verification form visible even after authentication agent responds
               if (preserveCurrentMode) {
                 setTimeout(() => {
                   // Make sure we're using the passed-in setActiveDisplayMode function
                   if (typeof setActiveDisplayMode === 'function') {
                     setActiveDisplayMode('VERIFICATION_FORM');
                     console.log('[Agent Response] Re-applying VERIFICATION_FORM mode after authentication response');
                   }
                 }, 10);
               }
               
               assistantMessageHandledLocally = true; // Mark that an assistant message was added
               
               // If we handled the message here, skip further processing
               if (assistantMessageHandledLocally) {
                 return;
               }
            } else {
               //  console.log("[handleServerEvent] Skipping assistant conversation.item.created event (no itemId or text).");
            }
        }

        // General message handling (user messages, or assistant messages not from function_call_output with a .message field)
        if (role === "user" && !text && serverEvent.item?.content?.[0]?.type !== "input_text") {
          text = "[Transcribing...]";
        }
        // Ensure item is not already in transcript from optimistic update or previous processing pass
        if (!transcriptItems?.some((item) => item.itemId === itemId)) {
            addTranscriptMessage(itemId, role, text, (serverEvent.item?.type === "function_call_output" && JSON.parse((serverEvent.item as any).output || "{}").properties) || [], selectedAgentName);
        } else if (itemType !== "function_call_output") { // Only update if not a func call output (already handled message part)
            const existingItem = transcriptItems.find(item => item.itemId === itemId);
            if (existingItem && existingItem.status === 'IN_PROGRESS') {
                updateTranscriptMessage(itemId, text, false);
            }
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        const itemId = serverEvent.item_id;
        const finalTranscript =
          !serverEvent.transcript || serverEvent.transcript === ""
            ? "[inaudible]"
            : serverEvent.transcript;

        console.log(
          `[Transcript] Completed: itemId=${itemId}, transcript="${finalTranscript}"`
        );

        // AUTOMATIC QUESTION COUNTING - BULLETPROOF APPROACH (MOVED HERE WHERE WE HAVE ACTUAL TEXT)
        if (selectedAgentName === 'realEstate' && finalTranscript && finalTranscript !== "[inaudible]") {
          console.log(`🚨🚨🚨 [Auto Counter] Processing completed transcript: "${finalTranscript}"`);
          console.log(`🚨🚨🚨 [Auto Counter] Agent: ${selectedAgentName}`);
          
          const currentAgent = selectedAgentConfigSet?.find(a => a.name === selectedAgentName);
          const isVerified = currentAgent?.metadata?.is_verified ?? false;
          
          // Skip counting if user is already verified
          if (isVerified) {
            console.log(`🚨🚨🚨 [Auto Counter] User is verified - skipping question counting for transcript`);
          } else {
            // Count real user questions automatically only if not verified
            if (isRealUserQuestion(finalTranscript, selectedAgentName)) {
              console.log(`🚨🚨🚨 [Auto Counter] Transcript passed filter, proceeding to count`);
              console.log(`🚨🚨🚨 [Auto Counter] Current agent found:`, !!currentAgent);
              
              if (currentAgent) {
              // Initialize question count in metadata if not present
              if (!currentAgent.metadata) {
                console.log(`🚨🚨🚨 [Auto Counter] Initializing metadata`);
                currentAgent.metadata = {} as AgentMetadata;
              }
              
              const metadataWithCount = currentAgent.metadata as any; // Use any to add user_question_count
              const currentCount = metadataWithCount.user_question_count || 0;
              console.log(`🚨🚨🚨 [Auto Counter] Current question count: ${currentCount}`);
              
              if (!metadataWithCount.user_question_count) {
                metadataWithCount.user_question_count = 0;
                console.log(`🚨🚨🚨 [Auto Counter] Initialized question count to 0`);
              }
              
              // Increment question count
              metadataWithCount.user_question_count++;
              const questionCount = metadataWithCount.user_question_count;
              
              console.log(`🚨🚨🚨 [Auto Counter] ✅ QUESTION COUNT INCREMENTED TO: ${questionCount}`);
              console.log(`🚨🚨🚨 [Auto Counter] Transcript that triggered count: "${finalTranscript}"`);
              
              // Check if authentication should be triggered (use non-async version)
              const isVerified = currentAgent?.metadata?.is_verified ?? false;
              console.log(`🚨🚨🚨 [Auto Counter] Verification status: ${isVerified}`);
              console.log(`🚨🚨🚨 [Auto Counter] Should trigger auth? Count >= 6: ${questionCount >= 6}, Not verified: ${!isVerified}, Agent: ${selectedAgentName}`);
              
              if (!isVerified && questionCount >= 6 && !authenticationTriggeredRef.current && String(selectedAgentName) !== "scheduleMeeting") {
                console.log(`🚨🚨🚨 [AUTH TRIGGER] 🔥🔥🔥 AUTHENTICATION REQUIRED! Questions: ${questionCount}`);
                
                // Mark authentication as triggered - actual auth will happen in response.done
                authenticationTriggeredRef.current = true;
                
                console.log(`🚨🚨🚨 [AUTH TRIGGER] ⏳ WAITING for agent response to complete in response.done handler...`);
                // Don't trigger authentication here - let response complete naturally
              } else {
                console.log(`🚨🚨🚨 [Auto Counter] No auth needed - continuing normal flow`);
              }
            } else {
              console.error(`🚨🚨🚨 [Auto Counter] ❌ Current agent not found!`);
            }
          } else {
            console.log(`🚨🚨🚨 [Auto Counter] Transcript filtered out, not counting`);
          }
        }
        } else {
          console.log(`🚨🚨🚨 [Auto Counter] Skipping transcript - Agent: ${selectedAgentName}, HasText: ${!!finalTranscript}, IsInaudible: ${finalTranscript === "[inaudible]"}`);
        }

        if (itemId) {
          try {
             // Use the passed-in function
            updateTranscriptMessage(itemId, finalTranscript, false);
            if (finalTranscript === "[inaudible]") {
              console.warn("[Transcript] Audio detected as inaudible");
            }
          } catch (error) {
            console.error(
              "[Transcript] Error updating transcript message:",
              error
            );
             try {
                 // Use the passed-in function
                 updateTranscriptMessage(
                     itemId,
                     "[Error transcribing audio]",
                     false
                 );
             } catch (innerError) {
                 console.error("[Transcript] Failed to update with error message:", innerError);
             }
          }
        }
        break;
      }

      case "response.audio_transcript.delta": {
        const itemId = serverEvent.item_id || "";
        const deltaText = serverEvent.delta || "";

        if (itemId) {
             // Use the passed-in function
            updateTranscriptMessage(itemId, deltaText, true);
        }
        break;
      }

      case "response.created": {
        // Mark that we have an active response
        hasActiveResponseRef.current = true;
        // console.log(`[Server Event] Response created, marked as active`);
        break;
      }

      case "response.done": {
        // When a response is completed, clear the active response flag
        hasActiveResponseRef.current = false;
        const currentAgentNameInResponse = selectedAgentName; // Capture at event time
        
        // 🚨 LOG EVERY RESPONSE.DONE EVENT WITH AGENT NAME
        console.log(`✅ [RESPONSE COMPLETE] ${currentAgentNameInResponse.toUpperCase()} finished response`);
        console.log(`[Server Event Hook] Response done. Agent: ${currentAgentNameInResponse}. Transferring flag: ${isTransferringAgentRef.current}, Target: ${agentBeingTransferredToRef.current}`);
        
        // Authentication now handled in response.audio.done (when user hears agent stop speaking)
        
        // Log additional response details
        const responseDetails = serverEvent.response as any || {};
        if (responseDetails.usage) {
          console.log(`📊 [RESPONSE STATS] Agent: ${currentAgentNameInResponse} | Tokens: ${JSON.stringify(responseDetails.usage)} | Outputs: ${responseDetails.output?.length || 0}`);
        }
        
        // Log what outputs are in the response
        if (responseDetails.output && responseDetails.output.length > 0) {
          console.log(`📤 [RESPONSE OUTPUTS] ${currentAgentNameInResponse.toUpperCase()} generated ${responseDetails.output.length} output(s):`);
          responseDetails.output.forEach((output: any, index: number) => {
            if (output.type === 'message') {
              const content = output.content?.[0]?.text || 'No text content';
              console.log(`  ${index + 1}. MESSAGE: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
            } else if (output.type === 'function_call') {
              console.log(`  ${index + 1}. FUNCTION_CALL: ${output.name}(${Object.keys(JSON.parse(output.arguments || '{}')).join(', ')})`);
            } else {
              console.log(`  ${index + 1}. ${output.type?.toUpperCase()}: ${JSON.stringify(output).substring(0, 100)}...`);
            }
          });
        } else {
          console.log(`📭 [NO OUTPUTS] ${currentAgentNameInResponse.toUpperCase()} response contained no outputs`);
        }

        // Add a small delay before processing tools to avoid race conditions
        const delayBeforeProcessing = isTransferringAgentRef.current ? 100 : 0;
        
        if (delayBeforeProcessing > 0) {
          setTimeout(() => {
            processResponseOutputs(serverEvent, currentAgentNameInResponse);
          }, delayBeforeProcessing);
        } else {
          processResponseOutputs(serverEvent, currentAgentNameInResponse);
        }
        break;
      }

      case "response.cancel": {
        // When a response is canceled, clear the active response flag
        hasActiveResponseRef.current = false;
        console.log(`[Server Event Hook] Response canceled for agent ${selectedAgentName}`);
        break;
      }

      case "response.output_item.done": {
        const itemId = serverEvent.item?.id;
        if (itemId) {
           // Use the passed-in function
          updateTranscriptItemStatus(itemId, "DONE");
        }
        break;
      }

      // Handle the previously unhandled event types
      case "rate_limits.updated":
        // These events can be logged but don't require specific handling
        // console.log(`[Server Event] ${serverEvent.type} received and acknowledged`);
        break;
        
      case "response.output_item.added":
        // This event signals a new output item (like text or function call) is being added to the response
        // console.log(`[Server Event] Output item added, index: ${(serverEvent as any).output_index}`);
        break;

      case "response.content_part.added":
      case "response.content_part.done":
        // These events relate to content parts within output items
        if ((serverEvent as any).item_id) {
          // console.log(`[Server Event] Content part event for item: ${(serverEvent as any).item_id}`);
        }
        break;
        
      case "output_audio_buffer.started":
        // Audio playback is starting
        // console.log(`[Server Event] Audio buffer started for response: ${(serverEvent as any).response_id}`);
        break;
        
      case "response.audio.done": {
        // Audio generation complete (but might still be playing locally)
        const currentAgentNameInResponse = selectedAgentName;
        console.log(`🔊 [AUDIO GENERATION DONE] ${currentAgentNameInResponse.toUpperCase()} finished generating audio`);
        // Authentication now handled in output_audio_buffer.stopped (when user stops hearing audio)
        break;
      }
      
      case "response.audio_transcript.done":
        // Transcript complete (but audio might still be playing)
        // console.log(`[Server Event] Audio transcript complete`);
        break;

      case "session.error": {
           console.error("[Session Error Event] Received session.error:", serverEvent);
           const errorMessage = serverEvent.response?.status_details?.error?.message || 'Unknown session error';
           addTranscriptMessage(generateSafeId(), 'system', `Session Error: ${errorMessage}`);
           setSessionStatus("DISCONNECTED"); 
           break;
       }
       case "error": { 
           console.error("[Top-Level Error Event] Received error event:", serverEvent);
           const errorDetails = (serverEvent as any).error;
           const errorMessage = errorDetails?.message || JSON.stringify(serverEvent) || 'Unknown error structure from server';
           const errorCode = errorDetails?.code || 'N/A';
           console.error(`[Top-Level Error Event] Code: ${errorCode}, Message: ${errorMessage}`, errorDetails, serverEvent);
           
           // Handle expected error cases
           if (errorCode === "conversation_already_has_active_response") {
             hasActiveResponseRef.current = true;
             console.log("[Error Handler] Marked response as active due to error");
           }
           else if (errorCode === "response_cancel_not_active") {
             // This is an expected error when trying to cancel a response that's already done
             console.log("[Error Handler] Ignoring harmless cancel error: no active response found");
             // Ensure the active response flag is cleared
             hasActiveResponseRef.current = false;
           }
           // Only add system message for unexpected errors
           else if (errorCode !== "conversation_already_has_active_response") {
             addTranscriptMessage(generateSafeId(), 'system', `Server Error (${errorCode}): ${errorMessage}`);
           }
           break;
       }
      default:
        //  console.log(`[Server Event Hook] Unhandled event type: ${serverEvent.type}`);
        break;
    }
  };

  // Extract the response output processing logic into a separate function
  const processResponseOutputs = (serverEvent: any, currentAgentNameInResponse: string) => {
    if (isTransferringAgentRef.current) {
      if (currentAgentNameInResponse === agentBeingTransferredToRef.current) {
        // This is the NEW agent's first response. It's now taking over.
        console.log(`[Server Event Hook] New agent ${currentAgentNameInResponse} completing its first response. Transfer flag will be cleared. Tools will be processed.`);
        isTransferringAgentRef.current = false;
        agentBeingTransferredToRef.current = null;
        // Fall through to process tools for the new agent
      } else {
        // This is the OLD agent's response completing AFTER a transfer was decided.
        console.log(`[Server Event Hook] Old agent ${currentAgentNameInResponse} response done after transfer to ${agentBeingTransferredToRef.current} initiated. Stopping tool processing for old agent.`);
        isTransferringAgentRef.current = false; 
        agentBeingTransferredToRef.current = null;
        return; // Skip tool processing for the old agent
      }
    }

    // Tool processing logic (will run for new agent on its first response.done, or normally for non-transfer scenarios)
    // If not transferring, process tool calls for the CURRENT agent.
    console.log(`[Server Event Hook] Processing tools for agent ${currentAgentNameInResponse} (Transfer flag is now ${isTransferringAgentRef.current})`);
    
    // 🔍 ADD DETAILED LOGGING FOR FUNCTION CALLS
    console.log(`🔍 [Server Event Hook] Response output structure:`, serverEvent.response?.output);
    
    if (serverEvent.response?.output) {
      console.log(`🔍 [Server Event Hook] Found ${serverEvent.response.output.length} output items to process`);
      
      let functionCallCount = 0;
      serverEvent.response.output.forEach((outputItem: any, index: number) => {
        console.log(`🔍 [Server Event Hook] Output item ${index}:`, {
          type: outputItem.type,
          name: (outputItem as any).name,
          hasArguments: !!(outputItem as any).arguments,
          content: outputItem.type === 'message' ? (outputItem as any).content : 'N/A'
        });
        
        if (outputItem.type === "function_call" && outputItem.name && outputItem.arguments) {
          functionCallCount++;
          console.log(`🔍 [Server Event Hook] Processing function call #${functionCallCount}: ${outputItem.name}`);
          
          // Add delay before processing function calls to prevent race conditions
          if (hasActiveResponseRef.current) {
            console.log(`🔍 [Server Event Hook] Delaying function call processing due to active response`);
            setTimeout(() => {
              if (!hasActiveResponseRef.current) {
                handleFunctionCall({
                  name: outputItem.name,
                  call_id: outputItem.call_id,
                  arguments: outputItem.arguments,
                });
              }
            }, 150);
          } else {
            // This handleFunctionCall will execute for the selectedAgentName.
            // If a transfer previously occurred and setSelectedAgentName was called, this should be the NEW agent.
            handleFunctionCall({
              name: outputItem.name,
              call_id: outputItem.call_id,
              arguments: outputItem.arguments,
            });
          }
        }
      });
      
      console.log(`🔍 [Server Event Hook] Total function calls processed: ${functionCallCount}`);
    } else {
      console.log(`🚨🚨🚨 [Server Event Hook] NO OUTPUT FOUND in response! This is unusual.`);
    }
  };

  const handleServerEventRef = useRef(handleServerEvent);

  useEffect(() => {
    handleServerEventRef.current = handleServerEvent;
  }, [
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
  ]);

  const canCreateResponse = () => {
    const canCreate = !hasActiveResponseRef.current && !isTransferringAgentRef.current;
    if (!canCreate) {
      console.log("[canCreateResponse] Blocking response creation:", {
        hasActiveResponse: hasActiveResponseRef.current,
        isTransferringAgent: isTransferringAgentRef.current
      });
    }
    return canCreate;
  };

  return {
    handleServerEvent: handleServerEventRef,
    canCreateResponse,
    setSimulatedMessageId: (id: string) => { simulatedMessageIdRef.current = id; }
  };
}


// Add this helper function near the bottom of the file, outside other functions
function getAgentDefaultUiHint(agentName: string): string {
  switch (agentName) {
    case "scheduleMeeting":
      return "SCHEDULING_FORM";
    case "authentication":
      return "VERIFICATION_FORM";
    default:
      return "CHAT";
  }
}