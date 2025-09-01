require('dotenv').config();
const { IgApiClient } = require('instagram-private-api');

const ig = new IgApiClient();
let lastCheckTime = Date.now();
const processedMessages = new Set(); // Track message IDs to avoid duplicates

const messageHandlers = {
    clip: (msg) => {
        const code = msg.clip?.clip?.code;
        if (!code) {
            console.error('No reel code found');
            return '[Instagram Reel - no code]';
        }
        return `https://www.instagram.com/reel/${code}/`;
    },
    
    media_share: (msg) => {
        const code = msg.media_share?.code;
        if (!code) {
            console.error('No post code found');
            return '[Shared Post - no code]';
        }
        return `https://www.instagram.com/p/${code}/`;
    },
    
    media: () => '[Photo/Video]',
    
    text: (msg) => msg.text || '[Empty text]'
};

function formatMessage(msg, threadTitle, userId) {
    const sender = msg.user_id === userId ? 'You' : threadTitle;
    const handler = messageHandlers[msg.item_type];
    const content = handler ? handler(msg) : `[${msg.item_type || 'Unknown'}]`;
    const time = new Date(msg.timestamp / 1000).toLocaleString();
    
    return { time, sender, content };
}

async function checkNewMessages() {
    try {
        const currentTime = Date.now();
        const inbox = await ig.feed.directInbox().items();
        let hasNewMessages = false;

        for (const thread of inbox) {
            const threadTitle = thread.thread_title || thread.users[0]?.username || 'Unknown';
            const threadFeed = ig.feed.directThread({ thread_id: thread.thread_id });
            const messages = await threadFeed.items();

            const newMessages = messages
                .filter(msg => {
                    // Convert Instagram timestamp (microseconds) to milliseconds
                    const msgTime = parseInt(msg.timestamp) / 1000;
                    const isNew = msgTime > lastCheckTime;
                    const isNotBot = msg.user_id !== parseInt(process.env.INSTAGRAM_USERID);
                    const isNotProcessed = !processedMessages.has(msg.item_id);
                    
                    if (isNew && isNotBot && isNotProcessed) {
                        processedMessages.add(msg.item_id);
                        return true;
                    }
                    return false;
                });

            if (newMessages.length > 0) {
                if (!hasNewMessages) {
                    console.log('\n' + '='.repeat(50));
                    console.log(`New messages at ${new Date(currentTime).toLocaleString()}`);
                    console.log('='.repeat(50));
                    hasNewMessages = true;
                }
                
                console.log(`\nConversation with: ${threadTitle}`);
                console.log('-'.repeat(30));
                
                newMessages
                    .reverse()
                    .map(msg => formatMessage(msg, threadTitle, ig.state.cookieUserId))
                    .forEach(({ time, sender, content }) => {
                        console.log(`[${time}] ${sender}: ${content}`);
                    });
            }
        }
        
        lastCheckTime = currentTime;
    } catch (error) {
        console.error('Error checking messages:', error.message);
    }
}

async function startMonitoring() {
    try {
        ig.state.generateDevice(process.env.INSTAGRAM_USERNAME);
        
        console.log('Logging in...');
        await ig.account.login(process.env.INSTAGRAM_USERNAME, process.env.INSTAGRAM_PASSWORD);
        console.log('Logged in successfully!');
        console.log('Monitoring for new messages... (Press Ctrl+C to stop)\n');
        
        // Initial check to set baseline
        lastCheckTime = Date.now();
        
        // Check for new messages every second
        setInterval(checkNewMessages, 1000);
        
    } catch (error) {
        console.error('Error starting monitor:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nStopping message monitor...');
    process.exit(0);
});

startMonitoring();