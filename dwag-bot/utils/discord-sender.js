/**
 * Discord webhook sender module
 * Shared between different bot implementations
 */

async function sendToDiscord(messages, webhookUrls) {
    if (messages.length === 0) {
        console.log('No messages to send to Discord');
        return;
    }

    for (const msg of messages) {
        const webhookUrl = msg.webhookUrl || webhookUrls.default;
        
        if (!webhookUrl) {
            console.log(`No Discord webhook configured for message from ${msg.sender}`);
            continue;
        }
        
        let payload;
        
        // Handle different message types differently
        if (msg.content.includes('/reel/') || msg.content.includes('/video/')) {
            // For reels/videos: send just the link (no embed)
            payload = {
                content: `**${msg.sender}**: ${msg.content}`
            };
        } else if (msg.content.includes('/p/') || msg.content.includes('/photo/')) {
            // For posts/photos: send link inline for embedding + context
            payload = {
                content: `**${msg.sender}**: ${msg.content}`
            };
        } else {
            // For text: send just the text
            payload = {
                content: `**${msg.sender}:** ${msg.content}`
            };
        }

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to send to Discord: ${response.status} - ${errorText}`);
                console.error('Payload:', JSON.stringify(payload, null, 2));
            }
        } catch (error) {
            console.error('Error sending to Discord:', error);
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

module.exports = { sendToDiscord };