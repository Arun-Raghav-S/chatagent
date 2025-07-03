import { AgentMetadata as BaseAgentMetadata } from "@/types/types";

// Extended AgentMetadata with real estate specific fields
interface AgentMetadata extends BaseAgentMetadata {
  project_id_map?: Record<string, string>;
  active_project_id?: string;
}

// Utility function for fuzzy string matching
const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Jaccard similarity for word-based matching
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const jaccardSim = intersection.size / union.size;
    
    // Levenshtein distance for character-based matching
    const levenshteinSim = 1 - (levenshteinDistance(s1, s2) / Math.max(s1.length, s2.length));
    
    // Substring matching
    const substringScore = (s1.includes(s2) || s2.includes(s1)) ? 0.8 : 0;
    
    // Spaceless matching (for "Bayz101" vs "Bayz 101")
    const spaceless1 = s1.replace(/\s+/g, '');
    const spaceless2 = s2.replace(/\s+/g, '');
    const spacelessScore = spaceless1.includes(spaceless2) || spaceless2.includes(spaceless1) ? 0.7 : 0;
    
    // Return highest score
    return Math.max(jaccardSim, levenshteinSim, substringScore, spacelessScore);
};

const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // insertion
                matrix[j - 1][i] + 1, // deletion
                matrix[j - 1][i - 1] + substitutionCost // substitution
            );
        }
    }
    
    return matrix[str2.length][str1.length];
};

interface PropertyMatch {
    property: string;
    confidence: number;
    matchType: 'exact' | 'fuzzy' | 'partial' | 'spaceless';
    extractedText?: string;
}

export const detectPropertyInMessage = async ({ message }: { message: string }, realEstateAgent: { metadata: AgentMetadata }) => {
    console.log(`[detectPropertyInMessage] Analyzing message: "${message}"`);
    
    try {
        const metadata = realEstateAgent.metadata as AgentMetadata;
        const project_names = metadata?.project_names || [];
        
        if (!project_names.length) {
            console.log("[detectPropertyInMessage] No properties available");
            return { propertyDetected: false, message: "No properties available" };
        }
        
        console.log(`[detectPropertyInMessage] Available properties:`, project_names);

        // Handle trigger messages
        if (message.startsWith('{Trigger msg:')) {
            return handleTriggerMessage(message, project_names);
        }

        // SIMPLIFIED: Just detect property names, let LLM decide intent through tool selection
        const propertyMatches = findPropertyMatches(message, project_names);
        
        if (propertyMatches.length === 0) {
            console.log(`[detectPropertyInMessage] No property matches found`);
            return { propertyDetected: false };
        }

        // Get best match (highest confidence)
        const bestMatch = propertyMatches.reduce((best, current) => 
            current.confidence > best.confidence ? current : best
        );

        console.log(`[detectPropertyInMessage] Best match: "${bestMatch.property}" (confidence: ${bestMatch.confidence}, type: ${bestMatch.matchType})`);

        // Only accept matches with reasonable confidence
        if (bestMatch.confidence < 0.3) {
            console.log(`[detectPropertyInMessage] Best match confidence too low: ${bestMatch.confidence}`);
            return { propertyDetected: false };
        }

        const shouldUpdate = metadata?.active_project !== bestMatch.property;
        
        return {
            propertyDetected: true,
            detectedProperty: bestMatch.property,
            shouldUpdateActiveProject: shouldUpdate,
            confidence: bestMatch.confidence,
            matchType: bestMatch.matchType,
            extractedText: bestMatch.extractedText
        };

    } catch (error) {
        console.error("[detectPropertyInMessage] Error during property detection:", error);
        return { 
            propertyDetected: false, 
            error: "Property detection failed",
            message: "Unable to analyze message for property references"
        };
    }
};

const handleTriggerMessage = (message: string, project_names: string[]) => {
    console.log("[detectPropertyInMessage] Processing trigger message");
    
    // Extract property name from trigger message
    const triggerPropertyRegex = /\{Trigger msg:.*?(?:this|about|for)\s+(.+?)(?:\s+in\s+brief|\s+and\s+then.*|\s*\})/i;
    const match = message.match(triggerPropertyRegex);
    
    if (!match || !match[1]) {
        return { propertyDetected: false, isTriggerMessage: true };
    }
    
    const propertyNameFromTrigger = match[1].trim();
    console.log(`[detectPropertyInMessage] Property name extracted from trigger: "${propertyNameFromTrigger}"`);
    
    // Find best matching property
    const matches = findPropertyMatches(propertyNameFromTrigger, project_names);
    const bestMatch = matches.length > 0 ? matches[0] : null;
    
    if (bestMatch && bestMatch.confidence > 0.5) {
        console.log(`[detectPropertyInMessage] Matched property: "${bestMatch.property}" from trigger`);
        return {
            propertyDetected: true,
            detectedProperty: bestMatch.property,
            shouldUpdateActiveProject: true,
            isTriggerMessage: true,
            confidence: bestMatch.confidence
        };
    }
    
    console.log(`[detectPropertyInMessage] No good match found for trigger property`);
    return { propertyDetected: false, isTriggerMessage: true };
};

const findPropertyMatches = (text: string, project_names: string[]): PropertyMatch[] => {
    const matches: PropertyMatch[] = [];
    const normalizedText = text.toLowerCase().trim();
    
    for (const property of project_names) {
        const similarity = calculateSimilarity(text, property);
        
        if (similarity > 0.3) { // Minimum threshold
            let matchType: PropertyMatch['matchType'] = 'fuzzy';
            
            if (similarity === 1.0) {
                matchType = 'exact';
            } else if (normalizedText.includes(property.toLowerCase()) || property.toLowerCase().includes(normalizedText)) {
                matchType = 'partial';
            } else if (normalizedText.replace(/\s+/g, '').includes(property.toLowerCase().replace(/\s+/g, ''))) {
                matchType = 'spaceless';
            }
            
            matches.push({
                property,
                confidence: similarity,
                matchType,
                extractedText: text
            });
        }
    }
    
    // Sort by confidence (highest first)
    return matches.sort((a, b) => b.confidence - a.confidence);
}; 