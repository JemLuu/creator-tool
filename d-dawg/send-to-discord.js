require('dotenv').config();

async function sendToDiscord(messages) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.error('DISCORD_WEBHOOK_URL not set');
        return;
    }

    for (const msg of messages) {
        const embed = {
            embeds: [{
                color: 0xE1306C, // Instagram pink
                author: {
                    name: msg.sender,
                    icon_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/132px-Instagram_logo_2016.svg.png'
                },
                fields: [
                    {
                        name: 'Type',
                        value: msg.type,
                        inline: true
                    },
                    {
                        name: 'Content',
                        value: msg.content.substring(0, 1024),
                        inline: false
                    }
                ],
                timestamp: msg.timestamp,
                footer: {
                    text: 'Instagram DM'
                }
            }]
        };

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(embed)
            });

            if (!response.ok) {
                console.error(`Failed to send message: ${response.status}`);
            }
        } catch (error) {
            console.error('Error sending to Discord:', error);
        }

        // Rate limit: Discord webhooks allow 30 requests per minute
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

module.exports = { sendToDiscord };