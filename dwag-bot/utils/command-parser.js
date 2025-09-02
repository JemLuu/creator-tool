/**
 * Parse dwag commands from message text
 * @param {string} text - Message text to parse
 * @returns {Object|null} Parsed command or null if not a dwag command
 */
function parseCommand(text) {
    if (!text || typeof text !== 'string') return null;
    
    const lowerText = text.toLowerCase().trim();
    if (!lowerText.startsWith('dwag')) return null;
    
    // Parse "dwag add [type] [idea text]"
    const addMatch = text.match(/^dwag\s+add\s+(?:(meme|skit|audio)\s+)?(.+)$/i);
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