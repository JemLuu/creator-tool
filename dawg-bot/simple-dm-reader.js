require('dotenv').config();
const { IgApiClient } = require('instagram-private-api');

const ig = new IgApiClient();

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

async function readDMs() {
    try {
        ig.state.generateDevice(process.env.INSTAGRAM_USERNAME);
        
        console.log('Logging in...');
        await ig.account.login(process.env.INSTAGRAM_USERNAME, process.env.INSTAGRAM_PASSWORD);
        console.log('Logged in successfully!\n');

        console.log('Fetching inbox...');
        const inbox = await ig.feed.directInbox().items();
        
        console.log(`Found ${inbox.length} conversations\n`);
        console.log('='.repeat(50));

        for (const thread of inbox) {
            // console.log('Thread:', thread); // debugging
            const threadTitle = thread.thread_title || thread.users[0]?.username || 'Unknown';
            console.log(`\nConversation with: ${threadTitle}`);
            console.log('-'.repeat(30));

            const threadFeed = ig.feed.directThread({ thread_id: thread.thread_id });
            const messages = await threadFeed.items();

            messages
                .reverse()
                .slice(-5)
                .filter(msg => msg.user_id !== parseInt(process.env.INSTAGRAM_USERID))
                .map(msg => formatMessage(msg, threadTitle, ig.state.cookieUserId))
                .forEach(({ time, sender, content }) => {
                    console.log(`[${time}] ${sender}: ${content}`);
                });
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('Done reading DMs!');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

readDMs();