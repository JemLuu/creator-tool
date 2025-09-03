const fs = require('fs');

class MessageScraper {
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
        // Default to 24 hours ago
        return Date.now() - (24 * 60 * 60 * 1000);
    }

    saveLastRunTime() {
        fs.writeFileSync(this.lastRunFile, Date.now().toString());
    }

    async navigateToMessages() {
        console.log('Navigating to messages...');
        await this.page.goto('https://www.tiktok.com/messages', { waitUntil: 'networkidle' });
        
        // Wait for page to load - TikTok uses different selectors
        console.log('Waiting for messages page to load...');
        await this.page.waitForTimeout(3000); // Give page time to load
        
        // Try multiple possible selectors
        try {
            await Promise.race([
                this.page.waitForSelector('[data-e2e="chat-list"]', { timeout: 5000 }),
                this.page.waitForSelector('.conversation-list', { timeout: 5000 }),
                this.page.waitForSelector('[class*="DivChatList"]', { timeout: 5000 }),
                this.page.waitForSelector('[class*="conversation"]', { timeout: 5000 })
            ]);
            console.log('Messages page loaded');
        } catch (error) {
            console.log('Warning: Could not find chat list selector, continuing anyway...');
            // Take a screenshot for debugging
            await this.page.screenshot({ path: 'tiktok-messages-page.png' });
            console.log('Screenshot saved to tiktok-messages-page.png for debugging');
        }
    }

    async getConversations() {
        console.log('Fetching conversations...');
        
        // Wait a bit more for dynamic content
        await this.page.waitForTimeout(2000);
        
        // Try multiple selectors for conversation items based on TikTok structure
        let conversations = [];
        const selectors = [
            // Try to find the conversation elements from the left sidebar
            'div[class*="DivChatListContainer"] > div',
            'div[class*="ChatList"] > div',
            '[data-e2e="chat-item"]',
            'div:has-text("dwag add")', // Direct text search
            'div:has-text("Jeremy L")', // Username search
            'a[href*="/messages/"]',
            // Generic approach - any clickable div in the messages area
            'div[class*="Chat"] div[role="button"]',
            'div[class*="Message"] div[role="button"]'
        ];
        
        for (const selector of selectors) {
            try {
                conversations = await this.page.$$(selector);
                if (conversations.length > 0) {
                    console.log(`Found ${conversations.length} conversations using selector: ${selector}`);
                    break;
                }
            } catch (error) {
                // Continue to next selector
            }
        }
        
        // If no conversations found with selectors, try a more generic approach
        if (conversations.length === 0) {
            console.log('Trying generic text search...');
            // Look for any element containing "dwag add" text
            conversations = await this.page.$$('xpath=//div[contains(text(), "dwag add")]');
            if (conversations.length > 0) {
                console.log(`Found ${conversations.length} elements with "dwag add" text`);
            }
        }
        
        if (conversations.length === 0) {
            console.log('No conversations found - trying to debug DOM structure...');
            // Log the page content for debugging
            const bodyText = await this.page.evaluate(() => document.body.innerText);
            console.log('Page contains "dwag":', bodyText.includes('dwag'));
            console.log('Page contains "Jeremy":', bodyText.includes('Jeremy'));
            return [];
        }
        
        const convData = [];
        
        for (const conv of conversations) {
            try {
                // Extract conversation info - TikTok's structure
                const text = await conv.evaluate(el => el.textContent);
                const href = await conv.evaluate(el => el.href).catch(() => null);
                
                // Try to extract username from the text or href
                let username = 'Unknown';
                if (href && href.includes('/messages/')) {
                    username = href.split('/messages/')[1] || username;
                } else if (text) {
                    // First line is usually the username
                    username = text.split('\n')[0].trim() || username;
                }
                
                convData.push({
                    element: conv,
                    username,
                    lastMessage: text
                });
            } catch (error) {
                console.error('Error extracting conversation:', error);
            }
        }
        
        console.log(`Found ${convData.length} conversations`);
        return convData;
    }

    async getMessagesFromConversation(conversation) {
        const { element, username } = conversation;
        
        console.log(`Opening conversation with ${username}...`);
        await element.click();
        
        // Wait for messages to load
        await this.page.waitForSelector('[data-e2e="message-item"]', { timeout: 5000 }).catch(() => {});
        
        // Scroll to load more messages if needed
        const messageContainer = await this.page.$('[data-e2e="message-list"]');
        if (messageContainer) {
            await messageContainer.evaluate(el => el.scrollTop = 0);
            await this.page.waitForTimeout(1000);
        }
        
        // Get all messages
        const messages = await this.page.$$eval('[data-e2e="message-item"]', (elements, lastRunTime) => {
            return elements.map(el => {
                const content = el.querySelector('.message-content')?.textContent || '';
                const timeEl = el.querySelector('.message-time');
                const isOwn = el.classList.contains('own-message');
                
                // Try to extract video link if present
                const videoLink = el.querySelector('a[href*="/video/"]')?.href || 
                                el.querySelector('a[href*="/@"]')?.href || null;
                
                // Parse timestamp (TikTok uses various formats)
                let timestamp = Date.now();
                if (timeEl) {
                    const timeText = timeEl.textContent;
                    // Simple parsing - you may need to enhance this
                    if (timeText.includes('min ago')) {
                        const mins = parseInt(timeText);
                        timestamp = Date.now() - (mins * 60 * 1000);
                    } else if (timeText.includes('hour')) {
                        const hours = parseInt(timeText);
                        timestamp = Date.now() - (hours * 60 * 60 * 1000);
                    }
                }
                
                return {
                    content,
                    videoLink,
                    timestamp,
                    isOwn,
                    itemType: videoLink ? 'video_share' : 'text'
                };
            }).filter(msg => msg.timestamp > lastRunTime && !msg.isOwn);
        }, this.getLastRunTime());
        
        return messages;
    }

    formatTikTokUrl(url) {
        if (!url) return null;
        
        // Extract video ID from URL
        const videoMatch = url.match(/\/video\/(\d+)/);
        if (videoMatch) {
            // Return clean TikTok URL
            return `https://www.tiktok.com/@user/video/${videoMatch[1]}`;
        }
        
        return url;
    }

    async collectAllMessages() {
        const messagesByConversation = {};
        
        await this.navigateToMessages();
        
        // New approach: Parse messages directly from the current view
        console.log('Attempting to parse visible messages...');
        
        try {
            // Extract all text content that might contain "dwag add" commands
            const allText = await this.page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                const textElements = elements.filter(el => {
                    const text = el.textContent || '';
                    return text.includes('dwag add') && text.length < 200; // Reasonable message length
                });
                
                return textElements.map(el => ({
                    text: el.textContent.trim(),
                    className: el.className,
                    tagName: el.tagName
                }));
            });
            
            console.log(`Found ${allText.length} elements containing "dwag add"`);
            
            if (allText.length > 0) {
                // Create messages from the found text
                const messages = allText.map((item, index) => ({
                    sender: 'TikTok User', // We'll extract this later
                    content: item.text,
                    time: new Date().toLocaleString(),
                    timestamp: new Date().toISOString(),
                    itemType: 'text',
                    rawMessage: item
                }));
                
                messagesByConversation['TikTok Messages'] = messages;
                console.log(`Created ${messages.length} messages from visible content`);
            }
            
        } catch (error) {
            console.error('Error parsing visible messages:', error);
        }
        
        // Fallback to original conversation-based approach
        if (Object.keys(messagesByConversation).length === 0) {
            console.log('Falling back to conversation-based parsing...');
            const conversations = await this.getConversations();
            
            for (const conv of conversations) {
                try {
                    const messages = await this.getMessagesFromConversation(conv);
                    
                    if (messages.length > 0) {
                        // Format messages similar to Instagram bot
                        const formattedMessages = messages.map(msg => ({
                            sender: conv.username,
                            content: msg.videoLink ? this.formatTikTokUrl(msg.videoLink) : msg.content,
                            time: new Date(msg.timestamp).toLocaleString(),
                            timestamp: new Date(msg.timestamp).toISOString(),
                            itemType: msg.itemType,
                            rawMessage: msg
                        }));
                        
                        messagesByConversation[conv.username] = formattedMessages;
                    }
                    
                } catch (error) {
                    console.error(`Error processing conversation with ${conv.username}:`, error);
                }
            }
        }
        
        return messagesByConversation;
    }
}

module.exports = MessageScraper;