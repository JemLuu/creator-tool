const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');
const { WEBHOOK_URLS, DEBUG_MODE } = require('../utils/config');
const { parseCommand } = require('../utils/command-parser');
const { sendToDiscord } = require('../utils/discord-sender');

const ig = new IgApiClient();
const SENT_PAIRS_FILE = path.join(__dirname, '.instagram-sent-pairs');
const POPULATE_ONLY = process.argv.includes('--populate-only');

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


function isDuplicatePair(reelUrl, ideaText) {
    try {
        if (!fs.existsSync(SENT_PAIRS_FILE)) {
            return false;
        }

        const pairToCheck = `${reelUrl}|${ideaText}`;
        const sentPairs = fs.readFileSync(SENT_PAIRS_FILE, 'utf8');

        return sentPairs.includes(pairToCheck);
    } catch (error) {
        console.error('Error checking duplicate pairs:', error);
        return false; // If we can't check, assume it's not a duplicate
    }
}

function markPairAsSent(reelUrl, ideaText) {
    try {
        const pair = `${reelUrl}|${ideaText}\n`;
        fs.appendFileSync(SENT_PAIRS_FILE, pair);
    } catch (error) {
        console.error('Error saving sent pair:', error);
    }
}

// sendToDiscord is now imported from shared module

/**
 * Collects messages from all conversations and organizes them by thread
 * @returns {Object} Dictionary with thread titles as keys and arrays of messages as values
 */
async function collectMessagesByConversation() {
    const messagesByConversation = {};

    console.log('Fetching inbox...');
    const inbox = await ig.feed.directInbox().items();
    console.log(`Found ${inbox.length} conversations\n`);

    for (const thread of inbox) {
        const threadTitle = thread.thread_title || thread.users[0]?.username || 'Unknown';
        const threadFeed = ig.feed.directThread({ thread_id: thread.thread_id });
        const messages = await threadFeed.items();

        // Get ALL messages (not filtered by time), only exclude bot's own messages
        const allMessages = messages
            .filter(msg => {
                const isNotBot = msg.user_id !== parseInt(process.env.INSTAGRAM_USERID);
                return isNotBot;
            })
            .reverse() // Chronological order
            .map(msg => ({
                ...formatMessage(msg, threadTitle),
                rawMessage: msg, // Keep raw message for future filtering
                itemType: msg.item_type,
                timestamp: new Date(parseInt(msg.timestamp) / 1000).toISOString()
            }));

        if (allMessages.length > 0) {
            messagesByConversation[threadTitle] = allMessages;
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
                    // Check if we've already sent this reel-idea pair
                    if (isDuplicatePair(media.content, command.ideaText)) {
                        console.log(`Skipping duplicate pair from ${threadTitle}: "${command.ideaText}"`);
                        return;
                    }

                    // Create the Discord message with media and idea text
                    discordMessages.push({
                        sender: threadTitle,
                        content: `${media.content}\n"${command.ideaText}"`,
                        timestamp: msg.timestamp,
                        webhookUrl: WEBHOOK_URLS[command.type],
                        reelUrl: media.content,
                        ideaText: command.ideaText
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
            if (POPULATE_ONLY) {
                console.log(`\n🔄 POPULATE-ONLY MODE: Found ${discordMessages.length} reel+idea pairs`);
                console.log('Not sending to Discord, only marking as sent...');

                // Mark all pairs as sent without sending to Discord
                discordMessages.forEach(msg => {
                    markPairAsSent(msg.reelUrl, msg.ideaText);
                    console.log(`✅ Marked as sent: ${msg.reelUrl} | "${msg.ideaText}"`);
                });
                console.log(`\n✅ Successfully populated ${discordMessages.length} pairs to tracking file!`);
            } else {
                console.log(`Sending ${discordMessages.length} message(s) to Discord...`);
                await sendToDiscord(discordMessages, WEBHOOK_URLS);
                console.log('Messages sent to Discord!');

                // Mark all sent pairs as sent to avoid duplicates in future runs
                discordMessages.forEach(msg => {
                    markPairAsSent(msg.reelUrl, msg.ideaText);
                });
            }
        } else {
            console.log('No new dwag commands found to send to Discord');
        }
    }
    
    console.log('\n' + '='.repeat(50));

    if (DEBUG_MODE) {
        console.log(`Next check in 60 seconds...`);
    } else {
        console.log('Done reading DMs!');
    }
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
        if (POPULATE_ONLY) {
            console.log('📋 POPULATE-ONLY MODE ENABLED');
            console.log('Will scan all reels and mark them as sent without posting to Discord\n');
        }

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