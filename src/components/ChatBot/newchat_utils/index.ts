import { v4 as uuidv4 } from "uuid"

// Helper to generate safe IDs (32 chars max)
export const generateSafeId = () => uuidv4().replace(/-/g, "").slice(0, 32) 