import { TranscriptItem } from "@/types/types";

export const findNearestPlace = async ({ query, reference_property }: { query: string; reference_property: string }, realEstateAgent: any, transcript: TranscriptItem[] = []) => {
    console.log(`[findNearestPlace] Finding "${query}" near property "${reference_property}"`);
    
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

        if (response.ok && data.nearestPlaces && Array.isArray(data.nearestPlaces)) {
            console.log(`[findNearestPlace] Found ${data.nearestPlaces.length} nearest places:`, data.nearestPlaces);
            
            // Format the results into a concise, brief string - just name and location
            let resultMessage = "";
            if (data.nearestPlaces.length > 0) {
                resultMessage = data.nearestPlaces.map((place: any, index: number) => {
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
            console.warn(`[findNearestPlace] Edge function returned an error: ${data.error}`);
            return { 
                error: data.error,
                ui_display_hint: 'CHAT',
                message: `Sorry, I couldn't find nearby places: ${data.error}`
            };
        } else {
            console.error("[findNearestPlace] Edge function error:", data.error || response.statusText);
            console.error("[findNearestPlace] Full response data:", data);
            return { 
                error: data.error || "Error calling findNearestPlace edge function.",
                ui_display_hint: 'CHAT',
                message: "Sorry, there was an error finding nearby places."
            };
        }
    } catch (error: any) {
        console.error("[findNearestPlace] Error calling edge function:", error);
        return { 
            error: `Exception finding nearest place: ${error.message}`,
            ui_display_hint: 'CHAT',
            message: "Sorry, an unexpected error occurred while finding nearby places."
        };
    }
}; 