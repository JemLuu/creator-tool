require('dotenv').config();
const { IgApiClient } = require('instagram-private-api');

const ig = new IgApiClient();

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
            const threadTitle = thread.thread_title || thread.users[0]?.username || 'Unknown';
            console.log(`\nConversation with: ${threadTitle}`);
            console.log('-'.repeat(30));

            const threadFeed = ig.feed.directThread({ thread_id: thread.thread_id });
            const messages = await threadFeed.items();

            messages.reverse().slice(-5).forEach(msg => {
                const sender = msg.user_id === ig.state.cookieUserId ? 'You' : threadTitle;
                const text = msg.text || '[Media/Other content]';
                const time = new Date(msg.timestamp / 1000).toLocaleString();
                
                console.log(`[${time}] ${sender}: ${text}`);
            });
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('Done reading DMs!');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

readDMs();