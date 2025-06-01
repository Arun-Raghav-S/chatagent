import { AgentMetadata as BaseAgentMetadata } from "@/types/types";

// Extended interface for real estate agent
interface AgentMetadata extends BaseAgentMetadata {
  project_id_map?: Record<string, string>;
  active_project_id?: string;
  selectedDate?: string;
  selectedTime?: string;
  property_name?: string;
  flow_context?: 'from_full_scheduling' | 'from_direct_auth' | 'from_scheduling_verification';
}

export const fetchOrgMetadata = async ({ session_id, chatbot_id }: { session_id: string; chatbot_id: string; }, realEstateAgent: any, getInstructions: any) => {
    console.log(`[fetchOrgMetadata] Fetching metadata via edge function for session: ${session_id}, chatbot: ${chatbot_id}`);
    
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const toolsEdgeFunctionUrl = process.env.NEXT_PUBLIC_TOOLS_EDGE_FUNCTION_URL || "https://dashboard.propzing.in/functions/v1/realtime_tools";
    
    if (!supabaseAnonKey) {
        console.error("[fetchOrgMetadata] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return { error: "Server configuration error." };
    }
    try {
        const response = await fetch(
            toolsEdgeFunctionUrl,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseAnonKey}`,
                },
                body: JSON.stringify({
                    action: "fetchOrgMetadata",
                    session_id,
                    chatbot_id,
                }),
            }
        );

        const metadataResult: AgentMetadata & { error?: string } = await response.json();

        if (!response.ok || metadataResult.error) {
            console.error("[fetchOrgMetadata] Edge function error:", metadataResult.error || response.statusText);
            return { error: metadataResult.error || "Error fetching organizational metadata." };
        }

        console.log("[fetchOrgMetadata] Received metadata:", metadataResult);
        
        // Log critical IDs for debugging
        console.log("[fetchOrgMetadata] Critical ID fields in response:", {
            chatbot_id: metadataResult.chatbot_id,
            org_id: metadataResult.org_id,
            session_id: metadataResult.session_id,
            project_id_map: metadataResult.project_id_map,
        });
        
        // Ensure org_id is preserved from the API response
        if (!metadataResult.org_id) {
            console.warn("[fetchOrgMetadata] No org_id in response, this will cause issues with authentication");
        }
        
        // Create project_id_map from returned data if not already present
        if (!metadataResult.project_id_map && metadataResult.project_ids && metadataResult.project_names) {
            // Make sure arrays are the same length
            const minLength = Math.min(metadataResult.project_ids.length, metadataResult.project_names.length);
            const project_id_map: Record<string, string> = {};
            
            // Create mapping from project name to ID
            for (let i = 0; i < minLength; i++) {
                const name = metadataResult.project_names[i];
                const id = metadataResult.project_ids[i];
                if (name && id) {
                    project_id_map[name] = id;
                }
            }
            
            metadataResult.project_id_map = project_id_map;
            console.log("[fetchOrgMetadata] Created project_id_map:", project_id_map);
        }

        // Reset question count when metadata is fetched/refreshed


        // Update the agent's internal state and instructions
        // Preserve critical fields from existing metadata before overwriting
        const existingMetadata = realEstateAgent.metadata || {};
        const preservedFields: Partial<AgentMetadata> = {
            is_verified: existingMetadata.is_verified,
            has_scheduled: existingMetadata.has_scheduled,
            customer_name: existingMetadata.customer_name,
            phone_number: existingMetadata.phone_number,
            // CRITICAL: Preserve language setting during metadata refresh
            language: existingMetadata.language,
            // Preserve scheduling details if they exist from a previous flow
            selectedDate: (existingMetadata as any).selectedDate,
            selectedTime: (existingMetadata as any).selectedTime,
            property_name: (existingMetadata as any).property_name,
            project_id_map: (existingMetadata as any).project_id_map, // Preserve existing map if new one isn't created
            active_project_id: (existingMetadata as any).active_project_id, // Preserve existing active project id
        };

        realEstateAgent.metadata = { 
            ...preservedFields, // Apply preserved fields first
            ...metadataResult, // Then apply fetched results (will overwrite non-preserved if names clash)
            session_id // Ensure session_id from the fetch arguments persists
        } as AgentMetadata; // Cast the final object to AgentMetadata

        // If metadataResult provided its own project_id_map, it would have overwritten the preserved one.
        // If not, and we created one from project_ids/names, ensure it's part of the final metadata.
        if (!metadataResult.project_id_map && preservedFields.project_id_map && !(realEstateAgent.metadata as any).project_id_map) {
            (realEstateAgent.metadata as any).project_id_map = preservedFields.project_id_map;
        }
        // Same for active_project_id if not set by metadataResult
        if (!metadataResult.active_project_id && preservedFields.active_project_id && !(realEstateAgent.metadata as any).active_project_id) {
            (realEstateAgent.metadata as any).active_project_id = preservedFields.active_project_id;
        }

        realEstateAgent.instructions = getInstructions(realEstateAgent.metadata);
        console.log("[fetchOrgMetadata] Updated agent instructions based on new metadata.");
        
        // Log the final metadata state for debugging
        console.log("[fetchOrgMetadata] Final metadata state:", {
            chatbot_id: realEstateAgent.metadata.chatbot_id,
            org_id: realEstateAgent.metadata.org_id,
            session_id: realEstateAgent.metadata.session_id
        });

        return metadataResult; // Return fetched metadata

    } catch (error: any) {
        console.error("[fetchOrgMetadata] Exception calling edge function:", error);
        return { error: `Exception fetching metadata: ${error.message}` };
    }
}; 