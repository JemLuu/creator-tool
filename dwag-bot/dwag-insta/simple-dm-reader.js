const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');
const { WEBHOOK_URLS, DEBUG_MODE } = require('../utils/config');
const { parseCommand } = require('../utils/command-parser');
const { sendToDiscord } = require('../utils/discord-sender');

const ig = new IgApiClient();
const LAST_RUN_FILE = '.last-run';

const messageHandlers = {
    clip: (msg) => {
        const code = msg.clip?.clip?.code;
        if (!code) return '[Instagram Reel - no code]';
        // Use "kk" trick for better Discord embeds
        return `https://www.kkinstagram.com/reel/${code}/`;
    },
    
    media_share: (msg) => {
        const code = msg.media_share?.code;
        if (!code) return '[Shared Post - no code]';
        // Use "kk" trick for better Discord embeds
        return `https://www.kkinstagram.com/p/${code}/`;
    },
    
    media: () => '[Photo/Video]',
    text: (msg) => msg.text || '[Empty text]'
};

function formatMessage(msg, threadTitle) {
    const sender = threadTitle;
    const handler = messageHandlers[msg.item_type];
    const content = handler ? handler(msg) : `[${msg.item_type || 'Unknown'}]`;
    const time = new Date(msg.timestamp / 1000).toLocaleString();
    
    return { time, sender, content };
}

function getLastRunTime() {
    try {
        if (fs.existsSync(LAST_RUN_FILE)) {
            return parseInt(fs.readFileSync(LAST_RUN_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading last run file:', error);
    }
    // Default to 24 hours ago if no file
    return Date.now() - (24 * 60 * 60 * 1000);
}

function saveLastRunTime() {
    fs.writeFileSync(LAST_RUN_FILE, Date.now().toString());
}

// sendToDiscord is now imported from shared module

/**
 * Collects messages from all conversations and organizes them by thread
 * @returns {Object} Dictionary with thread titles as keys and arrays of messages as values
 */
async function collectMessagesByConversation() {
    const lastRunTime = getLastRunTime();
    const messagesByConversation = {};
    
    console.log('Fetching inbox...');
    const inbox = await ig.feed.directInbox().items();
    console.log(`Found ${inbox.length} conversations\n`);
    
    for (const thread of inbox) {
        const threadTitle = thread.thread_title || thread.users[0]?.username || 'Unknown';
        const threadFeed = ig.feed.directThread({ thread_id: thread.thread_id });
        const messages = await threadFeed.items();
        
        const newMessages = messages
            .filter(msg => {
                const msgTime = parseInt(msg.timestamp) / 1000;
                const isNew = msgTime > lastRunTime;
                const isNotBot = msg.user_id !== parseInt(process.env.INSTAGRAM_USERID);
                return isNew && isNotBot;
            })
            .reverse() // Chronological order
            .map(msg => ({
                ...formatMessage(msg, threadTitle),
                rawMessage: msg, // Keep raw message for future filtering
                itemType: msg.item_type,
                timestamp: new Date(parseInt(msg.timestamp) / 1000).toISOString()
            }));
        
        if (newMessages.length > 0) {
            messagesByConversation[threadTitle] = newMessages;
        }
    }
    
    return messagesByConversation;
}

// parseCommand is now imported from shared module

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
        if (msg.itemType === 'clip' || msg.itemType === 'media_share') {
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

async function checkMessages() {
    const lastRunTime = getLastRunTime();
    
    if (!DEBUG_MODE) {
        console.log(`Checking messages since: ${new Date(lastRunTime).toLocaleString()}\n`);
    }
    
    console.log('='.repeat(50));
    
    // Collect messages organized by conversation
    const messagesByConversation = await collectMessagesByConversation();
    
    // Count and display messages
    let totalNewMessages = 0;
    for (const [threadTitle, messages] of Object.entries(messagesByConversation)) {
        console.log(`\nConversation with: ${threadTitle}`);
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
        console.log('Done reading DMs!');
    }
    
    saveLastRunTime();
}

async function startDebugMode() {
    console.log('DEBUG MODE - Checking every 60 seconds (Press Ctrl+C to stop)\n');
    
    // Check immediately
    await checkMessages();
    
    // Then check every 60 seconds
    setInterval(async () => {
        try {
            await checkMessages();
        } catch (error) {
            console.error('Error checking messages:', error.message);
        }
    }, 60000);
}

async function main() {
    try {
        ig.state.generateDevice(process.env.INSTAGRAM_USERNAME);
        
        console.log('Logging in...');
        await ig.account.login(process.env.INSTAGRAM_USERNAME, process.env.INSTAGRAM_PASSWORD);
        console.log('Logged in successfully!\n');

        if (DEBUG_MODE) {
            await startDebugMode();
        } else {
            await checkMessages();
            process.exit(0);
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nStopping...');
    process.exit(0);
});

main();