const fs = require('fs');

class FinalScraper {
    constructor(page) {
        this.page = page;
        this.lastRunFile = '.tiktok-last-run';
    }

    getLastRunTime() {
        try {
            if (fs.existsSync(this.lastRunFile)) {
                return parseInt(fs.readFileSync(this.lastRunFile, 'utf8'));
            }
        } catch (error) {
            console.error('Error reading last run file:', error);
        }
        // Default to 1 hour ago
        return Date.now() - (60 * 60 * 1000);
    }

    saveLastRunTime() {
        fs.writeFileSync(this.lastRunFile, Date.now().toString());
    }

    async navigateToMessages() {
        console.log('Navigating to TikTok messages...');
        await this.page.goto('https://www.tiktok.com/messages', { waitUntil: 'networkidle' });
        await this.page.waitForTimeout(3000);
    }

    async getConversationList() {
        console.log('Getting conversation list...');
        
        const conversations = await this.page.evaluate(() => {
            // Find the specific conversation wrapper elements
            const wrappers = document.querySelectorAll('.css-1rrx3i5-DivItemWrapper');
            console.log(`[DEBUG] Found ${wrappers.length} conversation wrappers`);
            
            const convList = [];
            wrappers.forEach((wrapper, index) => {
                const text = wrapper.textContent || '';
                
                // Extract username more carefully
                let username = 'Unknown';
                
                // Look for known usernames
                if (text.includes('Jonathan Coulter')) {
                    username = 'Jonathan Coulter';
                } else if (text.includes('Jeremy L')) {
                    username = 'Jeremy L';
                } else {
                    // Fallback: try to get first line before any message text
                    const lines = text.split(/Message request|dwag add|\d{1,2}\/\d{1,2}\/\d{4}/);
                    if (lines.length > 0) {
                        username = lines[0].trim();
                    }
                }
                
                // Get preview text
                const preview = text.substring(0, 100);
                
                convList.push({
                    index,
                    username,
                    preview,
                    hasMessages: text.includes('dwag') || text.includes('Message request')
                });
                
                console.log(`[DEBUG] Conversation ${index}: ${username} - "${preview}"`);
            });
            
            return convList;
        });
        
        console.log(`Found ${conversations.length} conversations:`);
        conversations.forEach(conv => {
            console.log(`  - ${conv.username}: ${conv.preview.substring(0, 50)}...`);
        });
        
        return conversations;
    }

    async clickIntoConversation(index) {
        console.log(`Clicking into conversation ${index}...`);
        
        const clicked = await this.page.evaluate((idx) => {
            const wrappers = document.querySelectorAll('.css-1rrx3i5-DivItemWrapper');
            if (wrappers[idx]) {
                console.log(`[DEBUG] Clicking conversation at index ${idx}`);
                wrappers[idx].click();
                return true;
            }
            console.log(`[DEBUG] Could not find conversation at index ${idx}`);
            return false;
        }, index);
        
        if (clicked) {
            // Wait for chat to load
            await this.page.waitForTimeout(3000);
        }
        
        return clicked;
    }

    async extractChatMessages() {
        console.log('Extracting messages from current chat...');
        
        const messages = await this.page.evaluate(() => {
            const results = [];
            const seen = new Set();
            
            console.log('[DEBUG] Starting message extraction...');
            
            // IMPORTANT: Only look in the chat area, not the sidebar
            // The chat area is usually on the right side of the screen
            // Look for the main chat container
            let chatContainer = document.querySelector('[class*="ChatMain"]') || 
                               document.querySelector('[class*="ChatBox"]') ||
                               document.querySelector('[class*="MessageList"]');
            
            if (!chatContainer) {
                // Fallback: find the container that has chat messages but NOT the conversation list
                const allContainers = document.querySelectorAll('div');
                for (const container of allContainers) {
                    const text = container.textContent || '';
                    // Check if this looks like a chat container (has messages but not the sidebar text)
                    if ((text.includes('hi') || text.includes('dwag add')) && 
                        !text.includes('MessagesJonathan CoulterMessage request') &&
                        container.querySelector('[class*="ChatItem"]')) {
                        chatContainer = container;
                        console.log('[DEBUG] Found chat container via fallback');
                        break;
                    }
                }
            }
            
            if (chatContainer) {
                console.log('[DEBUG] Found chat container, looking for messages within it');
                
                // Find all chat items ONLY within the chat container
                const chatItems = chatContainer.querySelectorAll('[class*="ChatItemWrapper"]');
                console.log(`[DEBUG] Found ${chatItems.length} chat items in container`);
                
                chatItems.forEach((item, index) => {
                    const text = item.textContent?.trim() || '';
                    
                    // Skip empty or duplicate messages
                    if (!text || seen.has(text)) {
                        return;
                    }
                    seen.add(text);
                    
                    console.log(`[DEBUG] Processing message ${index}: "${text}"`);
                    
                    // Parse different message types
                    if (text === 'hi') {
                        results.push({ type: 'text', content: 'hi' });
                    } else if (text.includes('dwag add')) {
                        // Extract just the dwag command, remove any usernames or timestamps
                        let command = text;
                        
                        // Remove common prefixes
                        command = command.replace(/^(Jeremy L|Ben Nguyen|Djebug|jwcreative|Va1n|Conor)\s*/i, '');
                        command = command.replace(/\d{1,2}:\d{2}/g, ''); // Remove timestamps
                        command = command.trim();
                        
                        if (command.startsWith('dwag add')) {
                            results.push({ type: 'command', content: command });
                        }
                    } else if (text.match(/^(Jonathan Coulter|Jeremy L|Ben Nguyen|Djebug|jwcreative|Va1n|Conor)$/)) {
                        // This is just a username, likely before a video
                        results.push({ type: 'video', content: 'https://www.kktiktok.com/video/placeholder' });
                    } else if (text === 'Message request accepted. You can start chatting.') {
                        // System message, skip
                        console.log('[DEBUG] Skipping system message');
                    } else if (item.querySelector('video') || item.querySelector('img[src*="tiktok"]')) {
                        // Contains media
                        results.push({ type: 'video', content: 'https://www.kktiktok.com/video/placeholder' });
                    }
                });
            } else {
                console.log('[DEBUG] WARNING: Could not find chat container, results may be incorrect');
                
                // Emergency fallback - just look for ChatItemWrapper elements
                const allChatItems = document.querySelectorAll('[class*="ChatItemWrapper"]');
                console.log(`[DEBUG] Emergency fallback: found ${allChatItems.length} chat items globally`);
                
                allChatItems.forEach((item, index) => {
                    const text = item.textContent?.trim() || '';
                    
                    // Only process items that look like actual messages
                    if (text && !seen.has(text) && 
                        !text.includes('MessagesJonathan Coulter') && 
                        !text.includes('9/2/2025Jeremy L')) {
                        
                        seen.add(text);
                        
                        if (text === 'hi') {
                            results.push({ type: 'text', content: 'hi' });
                        } else if (text.match(/^dwag add/)) {
                            results.push({ type: 'command', content: text });
                        } else if (text.match(/^(jiccjucc|Ben Nguyen|Djebug|jwcreative|Va1n|Conor)$/)) {
                            // Username alone usually means a video was shared
                            results.push({ type: 'video', content: 'https://www.kktiktok.com/video/placeholder' });
                        }
                    }
                });
            }
            
            console.log(`[DEBUG] Extracted ${results.length} messages`);
            return results;
        });
        
        return messages;
    }

    async collectAllMessages() {
        const messagesByConversation = {};
        
        await this.navigateToMessages();
        const conversations = await this.getConversationList();
        
        // Process each conversation
        for (let i = 0; i < conversations.length; i++) {
            const conv = conversations[i];
            console.log(`\n--- Processing: ${conv.username} ---`);
            
            // Click into the conversation
            const clicked = await this.clickIntoConversation(i);
            if (!clicked) {
                console.log(`Could not open conversation with ${conv.username}`);
                continue;
            }
            
            // Extract messages
            const messages = await this.extractChatMessages();
            console.log(`Found ${messages.length} messages`);
            
            if (messages.length > 0) {
                // Format messages for Discord
                const formattedMessages = messages.map(msg => ({
                    sender: conv.username,
                    content: msg.content,
                    time: new Date().toLocaleString(),
                    timestamp: new Date().toISOString(),
                    itemType: msg.type === 'video' ? 'video_share' : 'text',
                    rawMessage: msg
                }));
                
                // Use actual username as key
                messagesByConversation[conv.username] = formattedMessages;
                
                // Debug output
                messages.forEach(msg => {
                    console.log(`  ${msg.type}: ${msg.content}`);
                });
            }
            
            // Navigate back to messages list for next conversation
            if (i < conversations.length - 1) {
                await this.navigateToMessages();
            }
        }
        
        return messagesByConversation;
    }
}

module.exports = FinalScraper;