import { TranscriptItem } from "@/types/types";
import { checkAuthenticationOnly } from './trackUserMessage';

// Smart detection function to determine if user is asking about a specific property
const isSpecificPropertyRequest = (query: string, searchResults: any[], availableProperties: string[]) => {
    // Patterns that indicate specific property questions
    const specificPatterns = [
        /^(tell me about|what about|about|show me|details of|info on|information about)\s+(.+)$/i,
        /^(.+?)\s+(details|info|information)$/i,
        /^(how about|what is|describe)\s+(.+)$/i
    ];
    
    // Check if query matches specific property question patterns
    const isSpecificQuestion = specificPatterns.some(pattern => pattern.test(query.trim()));
    
    // Also consider it specific if the query looks like a property name
    const looksLikePropertyName = query.trim().length > 2 && 
                                 !query.toLowerCase().includes('properties') && 
                                 !query.toLowerCase().includes('list') &&
                                 !query.toLowerCase().includes('all') &&
                                 !query.toLowerCase().includes('show me all');
    
    if (!isSpecificQuestion && !looksLikePropertyName) {
        // If only 1 result, still consider it specific
        return { isSpecific: searchResults.length === 1, bestMatch: searchResults[0] || null };
    }
    
    // Extract property name from query
    let extractedProperty = query.trim(); // Default to the full query
    
    if (isSpecificQuestion) {
        for (const pattern of specificPatterns) {
            const match = query.match(pattern);
            if (match) {
                extractedProperty = match[2] || match[1];
                break;
            }
        }
    }
    
    // Find best matching property from search results using fuzzy matching
    const bestMatch = findBestPropertyMatch(extractedProperty.trim(), searchResults, availableProperties);
    
    return { 
        isSpecific: !!bestMatch, 
        bestMatch,
        extractedName: extractedProperty.trim()
    };
};

// Fuzzy matching function to find best property match
const findBestPropertyMatch = (searchTerm: string, searchResults: any[], availableProperties: string[]) => {
    const searchLower = searchTerm.toLowerCase().trim();
    
    // First, try to find exact or close matches in search results
    let bestMatch = null;
    let bestScore = 0;
    
    for (const property of searchResults) {
        const propertyName = (property.name || '').toLowerCase().trim();
        const score = calculateSimilarity(searchLower, propertyName);
        
        if (score > bestScore) {
            bestScore = score;
            bestMatch = property;
        }
    }
    
    // If we found a good match (confidence > 0.5), return it
    if (bestScore > 0.5) {
        return bestMatch;
    }
    
    // Fallback: return first result if no good match found
    return searchResults.length > 0 ? searchResults[0] : null;
};

// Simple similarity calculation (same logic as detectPropertyInMessage)
const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Substring matching
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;
    
    // Spaceless matching (for "Bayz101" vs "Bayz 101")
    const spaceless1 = s1.replace(/\s+/g, '');
    const spaceless2 = s2.replace(/\s+/g, '');
    if (spaceless1.includes(spaceless2) || spaceless2.includes(spaceless1)) return 0.7;
    
    // Simple word overlap
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
};



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
            // Smart detection: Check if this is a specific property query
            const isSpecificPropertyQuery = isSpecificPropertyRequest(query, result.properties, metadata?.project_names || []);
            
            console.log(`[lookupProperty] Smart detection result:`, {
                query,
                isSpecific: isSpecificPropertyQuery.isSpecific,
                bestMatch: isSpecificPropertyQuery.bestMatch?.name,
                extractedName: isSpecificPropertyQuery.extractedName,
                totalResults: result.properties.length
            });

            if (isSpecificPropertyQuery.isSpecific) {
                // Single property detail view - format data for property details UI
                const property = isSpecificPropertyQuery.bestMatch;
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
                    ui_display_hint: 'CHAT',
                };
            } else {
                // Multiple properties - show property list UI
                const processedProperties = result.properties.map((property: any) => {
                    const mainImage = property.images && property.images.length > 0 ? property.images[0].url : "/placeholder.svg";
                    const galleryImages = property.images && property.images.length > 1 ? property.images.slice(1).map((img: any) => ({ url: img.url, alt: img.alt || property.name, description: img.description })) : [];
                    const amenities = Array.isArray(property.amenities) ? property.amenities.map((amenity: any) => (typeof amenity === 'string' ? { name: amenity } : amenity)) : [];
                    return {
                        ...property,
                        mainImage,
                        galleryImages,
                        amenities
                    };
                });

                return {
                    properties: processedProperties,
                    search_results: result.properties, 
                    message: result.message || `I found ${result.properties.length} properties matching "${query}".`,
                    ui_display_hint: 'CHAT',
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