import { checkAuthenticationOnly } from './trackUserMessage';

interface RealEstateAgent {
  metadata?: {
    project_locations?: Record<string, string>;
  };
}

interface NearestPlace {
  name: string;
  address?: string;
}

export const findNearestPlace = async ({ query, reference_property }: { query: string; reference_property: string }, realEstateAgent: RealEstateAgent) => {
    console.log(`[findNearestPlace] Finding nearest place: "${query}" from property "${reference_property}"`);
    
    // CRITICAL: Check authentication before processing user request
    const authCheck = checkAuthenticationOnly(realEstateAgent, 'findNearestPlace');
    
    if (authCheck.needs_authentication) {
        console.log("[findNearestPlace] 🚨 Authentication required - transferring to authentication agent");
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
    
    if (!supabaseAnonKey) {
        console.error("[findNearestPlace] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return { 
            error: "Server configuration error.", 
            ui_display_hint: 'CHAT',
            message: "Sorry, I couldn't find nearby places due to a server configuration issue."
        };
    }

    // Get the reference coordinates from project_locations
    const project_locations = metadata?.project_locations || {};
    const referenceCoords = project_locations[reference_property];
    
    if (!referenceCoords) {
        console.error(`[findNearestPlace] No location found for property: ${reference_property}`);
        console.log(`[findNearestPlace] Available properties:`, Object.keys(project_locations));
        return {
            error: `Location not found for property: ${reference_property}`,
            ui_display_hint: 'CHAT',
            message: `Sorry, I don't have the location coordinates for ${reference_property}.`
        };
    }

    console.log(`[findNearestPlace] Found reference coordinates: ${referenceCoords} for property: ${reference_property}`);

    try {
        // Call the edge function
        const response = await fetch(
            toolsEdgeFunctionUrl,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseAnonKey}`,

                },
                body: JSON.stringify({
                    action: "findNearestPlace",
                    query: query,
                    location: referenceCoords,
                    k: 2 // Default to 2 results as shown in the curl example
                }),
            }
        );

        const data = await response.json();
        
        // Debug logging to understand the response structure
        console.log("[findNearestPlace] Response status:", response.status, response.statusText);
        console.log("[findNearestPlace] Response data:", data);
        console.log("[findNearestPlace] Data type and keys:", typeof data, Object.keys(data));

        if (response.ok && data.nearestPlaces && Array.isArray(data.nearestPlaces)) {
            console.log(`[findNearestPlace] Found ${data.nearestPlaces.length} nearest places:`, data.nearestPlaces);
            
            // Format the results into a concise, brief string - just name and location
            let resultMessage = "";
            if (data.nearestPlaces.length > 0) {
                resultMessage = data.nearestPlaces.map((place: NearestPlace, index: number) => {
                    // Extract just the essential location info (first part before comma usually)
                    const briefLocation = place.address ? place.address.split(',')[0] : 'Location not available';
                    return `${index + 1}. ${place.name} - ${briefLocation}`;
                }).join('\n');
            } else {
                resultMessage = "No places found matching your query.";
            }
            
            return { 
                nearestPlaces: data.nearestPlaces,
                nearestPlace: resultMessage, // Keep this for backward compatibility
                ui_display_hint: 'CHAT',
                message: `Here are the nearest ${query.toLowerCase()} near ${reference_property}:`
            };
        } else if (response.ok && data.error) {
            const errorMessage = typeof data.error === 'object' ? JSON.stringify(data.error) : data.error;
            console.warn(`[findNearestPlace] Edge function returned an error:`, data.error);
            return { 
                error: errorMessage,
                ui_display_hint: 'CHAT',
                message: `Sorry, I couldn't find nearby places: ${errorMessage}`
            };
        } else {
            const errorMessage = typeof data.error === 'object' ? JSON.stringify(data.error) : (data.error || response.statusText);
            console.error("[findNearestPlace] Edge function error:", data.error || response.statusText);
            console.error("[findNearestPlace] Full response data:", data);
            return { 
                error: errorMessage,
                ui_display_hint: 'CHAT',
                message: "Sorry, there was an error finding nearby places."
            };
        }
    } catch (error: unknown) {
        console.error("[findNearestPlace] Error calling edge function:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { 
            error: `Exception finding nearest place: ${errorMessage}`,
            ui_display_hint: 'CHAT',
            message: "Sorry, an unexpected error occurred while finding nearby places."
        };
    }
}; 