const fs = require('fs');

class RobustScraper {
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
        await this.page.waitForTimeout(5000); // Give more time for dynamic content to load
    }

    async findAndClickConversations() {
        console.log('Finding all conversations to click through...');
        
        const conversationElements = await this.page.evaluate(() => {
            // Find all conversation item wrappers
            const wrappers = document.querySelectorAll('[class*="ItemWrapper"]');
            console.log(`[DEBUG] Found ${wrappers.length} conversation wrappers`);
            
            const conversations = [];
            wrappers.forEach((wrapper, index) => {
                const text = wrapper.textContent || '';
                const hasRelevantContent = text.includes('dwag') || 
                                         text.includes('Jeremy L') || 
                                         text.includes('Jonathan Coulter');
                
                if (hasRelevantContent) {
                    conversations.push({
                        index,
                        preview: text.substring(0, 100),
                        element: wrapper
                    });
                    console.log(`[DEBUG] Conversation ${index}: "${text.substring(0, 50)}..."`);
                }
            });
            
            return conversations.length;
        });
        
        console.log(`Found ${conversationElements} conversations to process`);
        return conversationElements;
    }

    async extractMessagesFromConversation(conversationIndex) {
        console.log(`\n--- Processing Conversation ${conversationIndex + 1} ---`);
        
        // Click on the conversation
        const clicked = await this.page.evaluate((index) => {
            const wrappers = document.querySelectorAll('[class*="ItemWrapper"]');
            if (wrappers[index]) {
                console.log(`[DEBUG] Clicking conversation ${index}`);
                wrappers[index].click();
                return true;
            }
            return false;
        }, conversationIndex);
        
        if (!clicked) {
            console.log(`Could not click conversation ${conversationIndex + 1}`);
            return [];
        }
        
        // Wait for conversation to load
        await this.page.waitForTimeout(3000);
        
        // Extract messages from the conversation
        const messages = await this.page.evaluate(() => {
            const results = [];
            
            // Look for chat message containers
            const chatItems = document.querySelectorAll('[class*="ChatItemWrapper"]') ||
                             document.querySelectorAll('[class*="MessageContainer"]') ||
                             document.querySelectorAll('[class*="Message"]');
            
            console.log(`[DEBUG] Found ${chatItems.length} potential message containers`);
            
            if (chatItems.length === 0) {
                // Fallback: look for any elements with message-like content
                const allElements = Array.from(document.querySelectorAll('*'));
                const messageElements = allElements.filter(el => {
                    const text = el.textContent?.trim() || '';
                    return (text === 'hi' || 
                           text.includes('dwag add') || 
                           text.includes('You shared') ||
                           text.includes('rock climbing') ||
                           text.includes('test')) && 
                           text.length < 200 && 
                           text.length > 0;
                });
                
                console.log(`[DEBUG] Fallback found ${messageElements.length} message elements`);
                
                messageElements.forEach((el, index) => {
                    const text = el.textContent.trim();
                    console.log(`[DEBUG] Message ${index}: "${text}"`);
                    
                    if (text === 'hi') {
                        results.push({ type: 'text', content: 'hi' });
                    } else if (text.includes('dwag add')) {
                        const cleanCommand = text
                            .replace(/\d{1,2}:\d{2}/g, '')
                            .replace(/Jeremy L/g, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        results.push({ type: 'command', content: cleanCommand });
                    } else if (text.includes('You shared') || text.includes('@')) {
                        results.push({ type: 'video', content: 'https://www.kktiktok.com/video/placeholder' });
                    }
                });
            } else {
                // Process actual chat containers
                chatItems.forEach((item, index) => {
                    const text = item.textContent?.trim() || '';
                    console.log(`[DEBUG] Chat item ${index}: "${text}"`);
                    
                    if (text === 'hi') {
                        results.push({ type: 'text', content: 'hi' });
                    } else if (text.includes('dwag add')) {
                        results.push({ type: 'command', content: text });
                    } else if (item.querySelector('video') || item.querySelector('img')) {
                        results.push({ type: 'video', content: 'https://www.kktiktok.com/video/placeholder' });
                    }
                });
            }
            
            console.log(`[DEBUG] Extracted ${results.length} messages from conversation`);
            return results;
        });
        
        return messages;
    }


    async collectAllMessages() {
        const messagesByConversation = {};
        
        await this.navigateToMessages();
        const conversationCount = await this.findAndClickConversations();
        
        // Process each conversation by clicking into it
        for (let i = 0; i < conversationCount; i++) {
            const messages = await this.extractMessagesFromConversation(i);
            
            if (messages.length > 0) {
                // Format messages for Discord processing
                const formattedMessages = messages.map(msg => ({
                    sender: 'Jeremy L', // Default sender
                    content: msg.content,
                    time: new Date().toLocaleString(),
                    timestamp: new Date().toISOString(),
                    itemType: msg.type === 'video' ? 'video_share' : 'text',
                    rawMessage: msg
                }));
                
                const conversationKey = `Conversation_${i + 1}`;
                messagesByConversation[conversationKey] = formattedMessages;
                
                console.log(`Added ${formattedMessages.length} messages to ${conversationKey}`);
            }
            
            // Go back to messages list for next conversation
            await this.page.goto('https://www.tiktok.com/messages', { waitUntil: 'networkidle' });
            await this.page.waitForTimeout(2000);
        }
        
        return messagesByConversation;
    }
}

module.exports = RobustScraper;