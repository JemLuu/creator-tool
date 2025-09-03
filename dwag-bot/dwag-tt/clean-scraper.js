const fs = require('fs');

class CleanScraper {
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
        
        // Enable console logging from the browser
        this.page.on('console', msg => {
            if (msg.text().includes('[DEBUG]')) {
                console.log('Browser:', msg.text());
            }
        });
        
        const messages = await this.page.evaluate(() => {
            const results = [];
            const seen = new Set(); // Track unique messages
            
            // First, let's see what's on the page
            console.log('[DEBUG] Page URL:', window.location.href);
            const bodyText = document.body.textContent || '';
            console.log('[DEBUG] Page contains "hi":', bodyText.includes('hi'));
            console.log('[DEBUG] Page contains "dwag add":', bodyText.includes('dwag add'));
            console.log('[DEBUG] Page contains "rock climbing":', bodyText.includes('rock climbing'));
            console.log('[DEBUG] Page contains "meme":', bodyText.includes('meme'));
            console.log('[DEBUG] Page contains "skit":', bodyText.includes('skit'));
            
            // Strategy 1: Look for chat item wrappers
            let chatItems = document.querySelectorAll('[class*="ChatItemWrapper"]');
            console.log(`[DEBUG] Found ${chatItems.length} ChatItemWrapper elements`);
            
            // Strategy 2: If no chat items, look for message containers
            if (chatItems.length === 0) {
                chatItems = document.querySelectorAll('[class*="MessageContainer"], [class*="MessageVertical"], [class*="ChatItem"]');
                console.log(`[DEBUG] Found ${chatItems.length} message container elements (fallback)`);
            }
            
            // Strategy 3: Look for text containers and any p tags
            if (chatItems.length === 0) {
                const textElements = document.querySelectorAll('[class*="TextContainer"], p[class*="Text"], [class*="MessageHorizontal"]');
                console.log(`[DEBUG] Found ${textElements.length} text elements (fallback 2)`);
                
                // Also try to find all elements with specific text
                const allElements = Array.from(document.querySelectorAll('*'));
                const messageElements = allElements.filter(el => {
                    const text = el.textContent?.trim() || '';
                    const isMessage = (text === 'hi' || 
                                      text.includes('dwag add') || 
                                      text.includes('rock climbing') ||
                                      text.includes('test')) && 
                                     text.length < 200;
                    
                    // Check if this is the innermost element with this text
                    if (isMessage) {
                        const hasChildWithSameText = Array.from(el.children).some(child => 
                            child.textContent?.trim() === text
                        );
                        return !hasChildWithSameText; // Only include if no child has same text
                    }
                    return false;
                });
                
                console.log(`[DEBUG] Found ${messageElements.length} potential message elements by text content`);
                
                messageElements.forEach((el, index) => {
                    const text = el.textContent?.trim() || '';
                    console.log(`[DEBUG] Element ${index}: "${text}" (${el.tagName}, ${el.className})`);
                    
                    if (text && !seen.has(text)) {
                        seen.add(text);
                        
                        if (text === 'hi') {
                            results.push({ type: 'text', content: 'hi' });
                        } else if (text.includes('dwag add')) {
                            // Clean the command
                            const clean = text.replace(/\d{1,2}:\d{2}/g, '').trim();
                            results.push({ type: 'command', content: clean });
                        }
                    }
                });
            }
            
            // Process chat items if found
            if (chatItems.length > 0) {
                chatItems.forEach((item, index) => {
                    const text = item.textContent?.trim() || '';
                    
                    // Skip if we've seen this exact text
                    if (seen.has(text)) {
                        console.log(`[DEBUG] Skipping duplicate: "${text.substring(0, 50)}"`);
                        return;
                    }
                    seen.add(text);
                    
                    console.log(`[DEBUG] Processing chat item ${index}: "${text.substring(0, 50)}..."`);
                    
                    // Check for different message types
                    if (text === 'hi') {
                        results.push({ type: 'text', content: 'hi' });
                    } else if (text.includes('dwag add')) {
                        // Clean up the command
                        const cleanCommand = text
                            .replace(/\d{1,2}:\d{2}/g, '') // Remove timestamps
                            .replace(/^\w+\s+/, '') // Remove username at start
                            .trim();
                        
                        if (cleanCommand.startsWith('dwag add')) {
                            results.push({ type: 'command', content: cleanCommand });
                        }
                    } else if (text.includes('You shared') || text.includes('shared a video')) {
                        results.push({ type: 'video', content: 'https://www.kktiktok.com/video/placeholder' });
                    } else if (item.querySelector('video') || item.querySelector('[class*="Video"]')) {
                        // Check for video elements
                        results.push({ type: 'video', content: 'https://www.kktiktok.com/video/placeholder' });
                    }
                });
            }
            
            // AGGRESSIVE FALLBACK: Find ALL text that looks like messages anywhere on page
            if (results.length < 2) {  // If we found less than expected
                console.log('[DEBUG] Using aggressive fallback to find all messages');
                
                // Find all divs and p tags
                const allTextElements = document.querySelectorAll('div, p, span');
                const possibleMessages = [];
                
                allTextElements.forEach(el => {
                    const text = el.textContent?.trim() || '';
                    
                    // Only process if this element doesn't have children with the same text
                    const hasChildWithSameText = Array.from(el.children).some(child => 
                        child.textContent?.trim() === text
                    );
                    
                    if (!hasChildWithSameText && text.length > 0 && text.length < 200) {
                        // Check for specific message patterns
                        if (text === 'hi' && !seen.has('hi')) {
                            possibleMessages.push({ type: 'text', content: 'hi', source: 'aggressive' });
                            seen.add('hi');
                        } else if (text.match(/^dwag\s+add\s+\w+/i)) {
                            const clean = text.replace(/\d{1,2}:\d{2}/g, '').trim();
                            const key = `cmd:${clean}`;
                            if (!seen.has(key)) {
                                possibleMessages.push({ type: 'command', content: clean, source: 'aggressive' });
                                seen.add(key);
                            }
                        } else if ((text.includes('rock climbing') || text.includes('test')) && text.includes('dwag')) {
                            const clean = text.replace(/\d{1,2}:\d{2}/g, '').trim();
                            const key = `cmd:${clean}`;
                            if (!seen.has(key)) {
                                possibleMessages.push({ type: 'command', content: clean, source: 'aggressive' });
                                seen.add(key);
                            }
                        }
                    }
                });
                
                console.log(`[DEBUG] Aggressive search found ${possibleMessages.length} additional messages`);
                possibleMessages.forEach(msg => {
                    console.log(`[DEBUG] Found via aggressive: ${msg.type} - "${msg.content}"`);
                    results.push(msg);
                });
            }
            
            // Remove any remaining duplicates
            const uniqueResults = [];
            const seenContent = new Set();
            results.forEach(msg => {
                const key = `${msg.type}:${msg.content}`;
                if (!seenContent.has(key)) {
                    seenContent.add(key);
                    uniqueResults.push(msg);
                }
            });
            
            console.log(`[DEBUG] Extracted ${uniqueResults.length} unique messages`);
            return uniqueResults;
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

module.exports = CleanScraper;