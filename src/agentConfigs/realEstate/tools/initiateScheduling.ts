import { TranscriptItem } from "@/types/types";
import { checkAuthenticationOnly } from './trackUserMessage';

export const initiateScheduling = async ({}: {}, realEstateAgent: any, transcript: TranscriptItem[] = []) => {
    console.log("[initiateScheduling] User wants to schedule a visit");
    
    // CRITICAL: Check authentication before processing user request
    const authCheck = checkAuthenticationOnly(realEstateAgent, 'initiateScheduling');
    
    if (authCheck.needs_authentication) {
        console.log("[initiateScheduling] 🚨 Authentication required - transferring to authentication agent");
        return {
            destination_agent: authCheck.destination_agent,
            flow_context: authCheck.flow_context,
            came_from: authCheck.came_from,
            pending_question: authCheck.pending_question,
            message: null,
            silentTransfer: authCheck.silentTransfer
        };
    }

    const metadata = realEstateAgent.metadata;
    const metadataAny = metadata as any;
    
    let actualPropertyIdToSchedule: string | undefined = undefined;
    let propertyNameForScheduling: string | undefined = undefined;

    console.log("[initiateScheduling] DEBUG - Using active project context only");
    console.log("  - active_project_id:", metadataAny?.active_project_id);
    console.log("  - active_project:", metadata?.active_project);
    console.log("  - project_ids:", metadata?.project_ids);
    console.log("  - project_names:", metadataAny?.project_names);
    console.log("  - project_id_map:", metadataAny?.project_id_map);
    
    // Always use active project context - no property_id parameter accepted
    if (metadataAny?.active_project_id) {
        actualPropertyIdToSchedule = metadataAny.active_project_id;
        propertyNameForScheduling = metadata?.active_project && metadata?.active_project !== "N/A" ? metadata.active_project : undefined;
        
        // If name is still undefined for the active_project_id, try to find it
        if (!propertyNameForScheduling && actualPropertyIdToSchedule) {
            if (metadataAny?.project_id_map) {
                for (const nameInMap in metadataAny.project_id_map) {
                    if (metadataAny.project_id_map[nameInMap] === actualPropertyIdToSchedule) {
                        propertyNameForScheduling = nameInMap;
                        break;
                    }
                }
            }
            if (!propertyNameForScheduling && metadataAny?.project_ids && metadataAny?.project_names) {
                const idIndex = metadataAny.project_ids.indexOf(actualPropertyIdToSchedule);
                if (idIndex !== -1) propertyNameForScheduling = metadataAny.project_names[idIndex];
            }
        }
        console.log(`[initiateScheduling] Using active project. ID: '${actualPropertyIdToSchedule}', Name: '${propertyNameForScheduling}'.`);
    }

    // Fallback to the first project if no active project is set
    if (!actualPropertyIdToSchedule && !propertyNameForScheduling && metadata?.project_ids && metadata.project_ids.length > 0) {
        actualPropertyIdToSchedule = metadata.project_ids[0];
        if (metadata?.project_names && metadata.project_names.length > 0) {
            propertyNameForScheduling = metadata.project_names[0];
        } else if (metadataAny?.project_id_map) {
             for (const nameInMap in metadataAny.project_id_map) {
                if (metadataAny.project_id_map[nameInMap] === actualPropertyIdToSchedule) {
                    propertyNameForScheduling = nameInMap;
                    break;
                }
            }
        }
        console.log(`[initiateScheduling] No active project, falling back to first project. ID: '${actualPropertyIdToSchedule}', Name: '${propertyNameForScheduling}'.`);
    }
    
    propertyNameForScheduling = propertyNameForScheduling || "the selected property";
    
    console.log(`[initiateScheduling] Transferring to scheduleMeeting agent with Property ID: '${actualPropertyIdToSchedule || 'undefined'}', Property Name: '${propertyNameForScheduling}'`);
    
    return {
        destination_agent: "scheduleMeeting",
        property_id_to_schedule: actualPropertyIdToSchedule, 
        property_name: propertyNameForScheduling, 
        silentTransfer: true,
        message: null 
    };
}; 