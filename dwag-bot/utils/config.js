/**
 * Shared configuration module
 */

require('dotenv').config();

// Webhook URLs for different content types
const WEBHOOK_URLS = {
    meme: process.env.DISCORD_WEBHOOK_MEME || process.env.DISCORD_WEBHOOK_URL,
    skit: process.env.DISCORD_WEBHOOK_SKIT || process.env.DISCORD_WEBHOOK_URL,
    audio: process.env.DISCORD_WEBHOOK_AUDIO || process.env.DISCORD_WEBHOOK_URL,
    default: process.env.DISCORD_WEBHOOK_URL
};

module.exports = {
    WEBHOOK_URLS,
    DEBUG_MODE: process.argv.includes('--debug')
};