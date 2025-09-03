/**
 * Parse dwag commands from message text
 * @param {string} text - Message text to parse
 * @returns {Object|null} Parsed command or null if not a dwag command
 */
function parseCommand(text) {
    if (!text || typeof text !== 'string') return null;
    
    const trimmedText = text.trim();
    const lowerText = trimmedText.toLowerCase();
    
    // New format: Check if message starts with trigger words (meme, skit, audio)
    const shortMatch = trimmedText.match(/^(meme|skit|audio)\s+(.+)$/i);
    if (shortMatch) {
        return {
            command: 'add',
            type: shortMatch[1].toLowerCase(),
            ideaText: shortMatch[2].trim()
        };
    }
    
    // Original format: "dwag add [type] [idea text]" 
    if (!lowerText.startsWith('dwag')) return null;
    
    const addMatch = trimmedText.match(/^dwag\s+add\s+(?:(meme|skit|audio)\s+)?(.+)$/i);
    if (addMatch) {
        return {
            command: 'add',
            type: addMatch[1] || 'meme', // Default to meme if no type specified
            ideaText: addMatch[2].trim()
        };
    }
    
    return null;
}

module.exports = { parseCommand };