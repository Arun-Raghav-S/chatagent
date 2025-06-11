import { TranscriptItem } from "@/types/types";
import { checkAuthenticationOnly } from './trackUserMessage';

export const lookupProperty = async ({ query, k = 3 }: { query: string; k?: number }, realEstateAgent: any, transcript: TranscriptItem[] = []) => {
    console.log(`[lookupProperty] Querying edge function: "${query}", k=${k}`);
    
    // CRITICAL: Check authentication before processing user request
    const authCheck = checkAuthenticationOnly(realEstateAgent, 'lookupProperty');
    
    if (authCheck.needs_authentication) {
        console.log("[lookupProperty] 🚨 Authentication required - transferring to authentication agent");
        return {
            destination_agent: authCheck.destination_agent,
            flow_context: authCheck.flow_context,
            came_from: authCheck.came_from,
            pending_question: authCheck.pending_question,
            message: null,
            silentTransfer: authCheck.silentTransfer
        };
    }
    
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const toolsEdgeFunctionUrl = process.env.NEXT_PUBLIC_TOOLS_EDGE_FUNCTION_URL || "https://dashboard.propzing.in/functions/v1/realtime_tools";
    
    const metadata = realEstateAgent.metadata;
    const project_ids_for_filter = metadata?.project_ids || []; // For filtering in vector search

    if (!supabaseAnonKey) {
        return { error: "Server configuration error.", ui_display_hint: 'CHAT', message: "Server error during lookup." };
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
                    action: "lookupProperty",
                    query,
                    k,
                    project_ids: project_ids_for_filter, // Pass current project_ids for context/filtering
                }),
            }
        );

        const result = await response.json();

        if (!response.ok || result.error) {
            console.error("[lookupProperty] Edge function error:", result.error || response.statusText);
            return {
              error: result.error || "Error looking up property.",
              ui_display_hint: 'CHAT',
              message: result.error ? `Lookup failed: ${result.error}` : "Could not find properties."
            };
        }

        console.log("[lookupProperty] Received raw property results:", result);

        if (result.properties && Array.isArray(result.properties) && result.properties.length > 0) {
            // Check if this is a specific property query that should show property details UI
            const isSpecificPropertyQuery = result.properties.length === 1 

            if (isSpecificPropertyQuery) {
                // Single property detail view - format data for property details UI
                const property = result.properties[0];
                const mainImage = property.images && property.images.length > 0 ? property.images[0].url : "/placeholder.svg";
                const galleryImages = property.images && property.images.length > 1 ? property.images.slice(1).map((img: any) => ({ url: img.url, alt: img.alt || property.name, description: img.description })) : [];
                const amenities = Array.isArray(property.amenities) ? property.amenities.map((amenity: any) => (typeof amenity === 'string' ? { name: amenity } : amenity)) : [];

                return {
                    property_details: {
                        ...property,
                        mainImage,
                        galleryImages,
                        amenities
                    },
                    search_results: result.properties,
                    message: result.message || `Here are the details for ${property.name}.`,
                    ui_display_hint: 'PROPERTY_DETAILS',
                };
            } else {
                // Multiple properties or general query - keep CHAT hint for agent to summarize
                return {
                    search_results: result.properties, 
                    message: result.message || `Regarding "${query}", I found information about ${result.properties.length} item(s).`,
                    ui_display_hint: 'PROPERTY_DETAILS',
                };
            }
        } else {
             return { message: result.message || "I couldn't find specific details matching that query.", ui_display_hint: 'CHAT' };
        }

    } catch (error: any) {
        console.error("[lookupProperty] Exception calling edge function:", error);
        return { 
          error: `Exception looking up property: ${error.message}`,
          ui_display_hint: 'CHAT',
          message: "An error occurred during property lookup."
        };
    }
}; 