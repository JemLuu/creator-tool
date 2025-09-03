console.log('[DEBUG] Starting TikTok DM Reader...');
console.log('[DEBUG] __dirname:', __dirname);
console.log('[DEBUG] Current working directory:', process.cwd());

// Only load dotenv if not already loaded
if (!process.env.TIKTOK_USERNAME) {
    console.log('[DEBUG] Loading .env file...');
    const envPath = require('path').join(__dirname, '..', '.env');
    console.log('[DEBUG] .env path:', envPath);
    require('dotenv').config({ path: envPath });
}

console.log('[DEBUG] TIKTOK_USERNAME:', process.env.TIKTOK_USERNAME);
console.log('[DEBUG] TIKTOK_PASSWORD:', process.env.TIKTOK_PASSWORD ? '***' : 'NOT SET');
console.log('[DEBUG] TIKTOK_HEADLESS:', process.env.TIKTOK_HEADLESS);
console.log('[DEBUG] DEBUG_MODE from argv:', process.argv.includes('--debug'));

console.log('[DEBUG] Loading modules...');
const TikTokAuth = require('./tiktok-auth');
const FinalScraper = require('./final-scraper');
const { WEBHOOK_URLS, DEBUG_MODE } = require('../utils/config');
const { parseCommand } = require('../utils/command-parser');
const { sendToDiscord } = require('../utils/discord-sender');

console.log('[DEBUG] Modules loaded successfully');
console.log('[DEBUG] DEBUG_MODE from config:', DEBUG_MODE);

/**
 * Find the most recent media message before the given index
 * @param {Array} messages - Array of messages in chronological order
 * @param {number} commandIndex - Index of the command message
 * @returns {Object|null} The media message or null if none found
 */
function findPreviousMedia(messages, commandIndex) {
    // Search backwards from the command
    for (let i = commandIndex - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.itemType === 'video_share') {
            return msg;
        }
    }
    return null;
}

/**
 * Process messages for Discord - filters for dwag commands and pairs with media
 */
function processMessagesForDiscord(messagesByConversation) {
    const discordMessages = [];
    
    for (const [threadTitle, messages] of Object.entries(messagesByConversation)) {
        messages.forEach((msg, index) => {
            // Check if this is a dwag command
            const command = parseCommand(msg.content);
            
            if (command && command.command === 'add') {
                // Find the previous media to pair with
                const media = findPreviousMedia(messages, index);
                
                if (media) {
                    // Create the Discord message with media and idea text
                    discordMessages.push({
                        sender: threadTitle,
                        content: `${media.content}\n"${command.ideaText}"`,
                        timestamp: msg.timestamp,
                        webhookUrl: WEBHOOK_URLS[command.type]
                    });
                } else {
                    // No media found to pair with
                    console.log(`Warning: No media found to pair with command from ${threadTitle}: "${msg.content}"`);
                }
            }
        });
    }
    
    return discordMessages;
}

async function checkMessages(auth, scraper) {
    console.log('='.repeat(50));
    console.log('Checking TikTok messages...\n');
    
    // Collect messages
    const messagesByConversation = await scraper.collectAllMessages();
    
    // Count and display messages
    let totalNewMessages = 0;
    for (const [username, messages] of Object.entries(messagesByConversation)) {
        console.log(`\nConversation with: ${username}`);
        console.log('-'.repeat(30));
        
        messages.forEach(msg => {
            console.log(`[${msg.time}] ${msg.sender}: ${msg.content}`);
            totalNewMessages++;
        });
    }
    
    if (totalNewMessages === 0) {
        console.log('No new messages since last check.');
    } else {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`Total new messages: ${totalNewMessages}`);
        
        // Process and send to Discord
        const discordMessages = processMessagesForDiscord(messagesByConversation);
        if (discordMessages.length > 0) {
            console.log(`Sending ${discordMessages.length} message(s) to Discord...`);
            await sendToDiscord(discordMessages, WEBHOOK_URLS);
            console.log('Messages sent to Discord!');
        } else {
            console.log('No dwag commands found to send to Discord');
        }
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (DEBUG_MODE) {
        console.log(`Next check in 60 seconds...`);
    } else {
        console.log('Done reading TikTok DMs!');
    }
    
    scraper.saveLastRunTime();
}

async function startDebugMode(auth, scraper) {
    console.log('DEBUG MODE - Checking every 60 seconds (Press Ctrl+C to stop)\n');
    
    // Check immediately
    await checkMessages(auth, scraper);
    
    // Then check every 60 seconds
    setInterval(async () => {
        try {
            await checkMessages(auth, scraper);
        } catch (error) {
            console.error('Error checking messages:', error.message);
        }
    }, 60000);
}

async function main() {
    console.log('[DEBUG] main() function called');
    console.log('Initializing TikTok bot...');
    
    console.log('[DEBUG] Creating TikTokAuth instance...');
    const auth = new TikTokAuth();
    console.log('[DEBUG] TikTokAuth instance created');
    
    try {
        // Initialize browser (headless = false for first login to handle captcha)
        const headless = process.env.TIKTOK_HEADLESS !== 'false';
        console.log(`[DEBUG] Headless mode: ${headless}`);
        console.log(`[DEBUG] TIKTOK_HEADLESS env value: '${process.env.TIKTOK_HEADLESS}'`);
        console.log(`Launching browser (headless: ${headless})...`);
        
        console.log('[DEBUG] Calling auth.initialize()...');
        await auth.initialize(headless);
        console.log('[DEBUG] Browser initialized successfully');
        
        console.log('Checking TikTok authentication...');
        const isAuthenticated = await auth.checkAuth();
        
        if (!isAuthenticated) {
            console.log('Not authenticated. Logging in...');
            const loginSuccess = await auth.login(
                process.env.TIKTOK_USERNAME,
                process.env.TIKTOK_PASSWORD
            );
            
            if (!loginSuccess) {
                throw new Error('Failed to login to TikTok');
            }
        } else {
            console.log('Already authenticated!');
        }
        
        // Create final scraper
        const scraper = new FinalScraper(auth.page);
        
        if (DEBUG_MODE) {
            await startDebugMode(auth, scraper);
        } else {
            await checkMessages(auth, scraper);
            await auth.close();
            process.exit(0);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        await auth.close();
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\nStopping...');
    process.exit(0);
});

// Only run if this is the main module
if (require.main === module) {
    console.log('[DEBUG] Running as main module');
    main().catch(err => {
        console.error('[DEBUG] Fatal error in main():', err);
        process.exit(1);
    });
} else {
    console.log('[DEBUG] Loaded as module, not running main()');
}

module.exports = main;