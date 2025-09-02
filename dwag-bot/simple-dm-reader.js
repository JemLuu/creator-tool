require('dotenv').config();
const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');

const ig = new IgApiClient();
const LAST_RUN_FILE = '.last-run';
const DEBUG_MODE = process.argv.includes('--debug');
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const messageHandlers = {
    clip: (msg) => {
        const code = msg.clip?.clip?.code;
        if (!code) return '[Instagram Reel - no code]';
        return `https://www.instagram.com/reel/${code}/`;
    },
    
    media_share: (msg) => {
        const code = msg.media_share?.code;
        if (!code) return '[Shared Post - no code]';
        return `https://www.instagram.com/p/${code}/`;
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

async function sendToDiscord(messages) {
    if (!DISCORD_WEBHOOK_URL) {
        console.log('No Discord webhook configured');
        return;
    }

    for (const msg of messages) {
        const embed = {
            embeds: [{
                color: 0xE1306C,
                author: {
                    name: msg.sender,
                    icon_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/132px-Instagram_logo_2016.svg.png'
                },
                fields: [
                    {
                        name: 'Content',
                        value: msg.content.substring(0, 1024)
                    }
                ],
                timestamp: msg.timestamp,
                footer: {
                    text: 'Instagram DM'
                }
            }]
        };

        try {
            const response = await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(embed)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to send to Discord: ${response.status} - ${errorText}`);
                console.error('Payload:', JSON.stringify(embed, null, 2));
            }
        } catch (error) {
            console.error('Error sending to Discord:', error);
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

async function checkMessages() {
    const lastRunTime = getLastRunTime();
    
    if (!DEBUG_MODE) {
        console.log(`Checking messages since: ${new Date(lastRunTime).toLocaleString()}\n`);
    }

    console.log('Fetching inbox...');
    const inbox = await ig.feed.directInbox().items();
    
    console.log(`Found ${inbox.length} conversations\n`);
    console.log('='.repeat(50));

    let totalNewMessages = 0;
    const discordMessages = [];

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
            });

        if (newMessages.length > 0) {
            console.log(`\nConversation with: ${threadTitle}`);
            console.log('-'.repeat(30));
            
            newMessages
                .reverse()
                .forEach(msg => {
                    const { time, sender, content } = formatMessage(msg, threadTitle);
                    console.log(`[${time}] ${sender}: ${content}`);
                    totalNewMessages++;
                    
                    // Collect messages for Discord
                    discordMessages.push({
                        sender: threadTitle,
                        content,
                        timestamp: new Date(parseInt(msg.timestamp) / 1000).toISOString()
                    });
                });
        }
    }

    if (totalNewMessages === 0) {
        console.log('No new messages since last check.');
    } else {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`Total new messages: ${totalNewMessages}`);
        
        // Send to Discord if configured
        if (DISCORD_WEBHOOK_URL) {
            console.log('Sending messages to Discord...');
            await sendToDiscord(discordMessages);
            console.log('Messages sent to Discord!');
        }
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (DEBUG_MODE) {
        console.log(`Next check in 1 second...`);
    } else {
        console.log('Done reading DMs!');
    }

    saveLastRunTime();
}

async function startDebugMode() {
    console.log('DEBUG MODE - Checking every second (Press Ctrl+C to stop)\n');
    
    // Check immediately
    await checkMessages();
    
    // Then check every second
    setInterval(async () => {
        try {
            await checkMessages();
        } catch (error) {
            console.error('Error checking messages:', error.message);
        }
    }, 1000);
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