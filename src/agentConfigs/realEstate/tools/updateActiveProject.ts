import { AgentMetadata } from "@/types/types";

export const updateActiveProject = async ({ project_name }: { project_name: string }, realEstateAgent: any, getInstructions: any) => {
    console.log(`[updateActiveProject] Attempting to set active project to: "${project_name}"`);
    
    const metadata = realEstateAgent.metadata as AgentMetadata;
    const metadataAny = metadata as any;
    
    const previousActiveProject = metadata?.active_project || "N/A";
    
    // Update active project in metadata
    if (realEstateAgent.metadata) {
        realEstateAgent.metadata.active_project = project_name;
        
        // Also update the active_project_id if we have a project_id_map
        if (metadataAny?.project_id_map && metadataAny.project_id_map[project_name]) {
            metadataAny.active_project_id = metadataAny.project_id_map[project_name];
            console.log(`[updateActiveProject] Set active_project_id to: ${metadataAny.active_project_id}`);
        }
        
        // Update the agent's instructions with new metadata
        if (getInstructions && typeof getInstructions === 'function') {
            realEstateAgent.instructions = getInstructions(realEstateAgent.metadata);
        }
    }
    
    console.log(`[updateActiveProject] Success: Active project changed from "${previousActiveProject}" to "${project_name}"`);
    
    // CRITICAL: Return a hint to call getProjectDetails to show information about the newly active property
    return { 
        success: true, 
        active_project: project_name,
        active_project_id: metadataAny?.active_project_id,
        // Suggest the next tool to call to continue the conversation flow
        suggested_next_action: {
            tool_name: "getProjectDetails",
            reason: "Show information about the newly active property",
            project_name: project_name
        },
        message: `Successfully updated active project to ${project_name}. Now getting project details...`
    };
}; 