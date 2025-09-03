const fs = require('fs');

class MessageScraper {
    constructor(page) {
        this.page = page;
        this.lastRunFile = '.tiktok-last-run';
    }

    getLastRunTime() {
        try {
            if (fs.existsSync(this.lastRunFile)) {
                const time = parseInt(fs.readFileSync(this.lastRunFile, 'utf8'));
                console.log(`[DEBUG] Last run time from file: ${new Date(time).toLocaleString()}`);
                return time;
            }
        } catch (error) {
            console.error('Error reading last run file:', error);
        }
        // Default to 1 hour ago
        const defaultTime = Date.now() - (60 * 60 * 1000);
        console.log(`[DEBUG] No last run file, using default: ${new Date(defaultTime).toLocaleString()}`);
        return defaultTime;
    }

    saveLastRunTime() {
        fs.writeFileSync(this.lastRunFile, Date.now().toString());
    }

    async navigateToMessages() {
        console.log('Navigating to messages...');
        await this.page.goto('https://www.tiktok.com/messages', { waitUntil: 'networkidle' });
        
        // Wait for page to load
        console.log('Waiting for messages page to load...');
        await this.page.waitForTimeout(3000);
        
        // Click into the first conversation (Jeremy L)
        console.log('Looking for conversation to click...');
        try {
            // Look for the conversation item containing "dwag add"
            const conversationSelector = await this.page.evaluate(() => {
                // Find all elements that might be conversation items
                const allElements = Array.from(document.querySelectorAll('*'));
                const conversationElement = allElements.find(el => {
                    const text = el.textContent || '';
                    return text.includes('dwag add') && 
                           text.includes('Jeremy L') && 
                           el.tagName === 'DIV' && 
                           text.length < 300; // Reasonable conversation preview length
                });
                
                if (conversationElement) {
                    // Find clickable parent (usually has href or onclick)
                    let clickableParent = conversationElement;
                    while (clickableParent && clickableParent !== document.body) {
                        if (clickableParent.onclick || 
                            clickableParent.href || 
                            clickableParent.getAttribute('role') === 'button' ||
                            clickableParent.style.cursor === 'pointer') {
                            return true; // Found clickable element
                        }
                        clickableParent = clickableParent.parentElement;
                    }
                    // Just click the element itself
                    conversationElement.click();
                    return true;
                }
                return false;
            });
            
            if (conversationSelector) {
                console.log('Clicked into conversation, waiting for messages to load...');
                await this.page.waitForTimeout(2000);
            } else {
                console.log('Could not find conversation to click');
            }
            
        } catch (error) {
            console.log('Error clicking into conversation:', error.message);
        }
    }

    formatTikTokUrl(url) {
        if (!url) return null;
        
        // Extract video ID from URL
        const videoMatch = url.match(/\/video\/(\d+)/);
        if (videoMatch) {
            return `https://www.tiktok.com/@user/video/${videoMatch[1]}`;
        }
        
        return url;
    }

    async collectAllMessages() {
        const messagesByConversation = {};
        const lastRunTime = this.getLastRunTime();
        
        console.log(`Looking for messages since: ${new Date(lastRunTime).toLocaleString()}`);
        
        await this.navigateToMessages();
        
        console.log('Parsing conversation for dwag commands and videos...');
        
        try {
            // First, let's check what's actually on the page
            const pageInfo = await this.page.evaluate(() => {
                return {
                    url: window.location.href,
                    title: document.title,
                    bodyText: document.body.textContent.substring(0, 500),
                    hasDwagAdd: document.body.textContent.includes('dwag add'),
                    hasYouSharedVideo: document.body.textContent.includes('You shared a video'),
                    hasHi: document.body.textContent.includes('hi'),
                    divCount: document.querySelectorAll('div').length
                };
            });
            
            console.log('[DEBUG] Page Info:', pageInfo);
            
            // Get all messages by looking at the conversation structure
            const messages = await this.page.evaluate((lastRunTime) => {
                const results = [];
                
                console.log('[DEBUG] Starting page evaluation...');
                console.log(`[DEBUG] Page URL: ${window.location.href}`);
                console.log(`[DEBUG] Page title: ${document.title}`);
                
                // Check if we can find any text containing our keywords
                const pageText = document.body.textContent || '';
                console.log(`[DEBUG] Page contains "dwag add": ${pageText.includes('dwag add')}`);
                console.log(`[DEBUG] Page contains "You shared a video": ${pageText.includes('You shared a video')}`);
                console.log(`[DEBUG] Page contains "hi": ${pageText.includes('hi')}`);
                
                // Look for the actual conversation messages in chronological order
                // Try different selectors for the message container
                let messageContainer = document.querySelector('[class*="DivChatContainer"]') ||
                                     document.querySelector('[class*="ChatRoom"]') ||
                                     document.querySelector('[class*="MessageList"]');
                
                console.log(`[DEBUG] Found message container with class selectors: ${messageContainer ? 'YES' : 'NO'}`);
                
                if (!messageContainer) {
                    // Fallback to finding the main chat area
                    const chatArea = Array.from(document.querySelectorAll('div')).find(div => {
                        const text = div.textContent || '';
                        return text.includes('dwag add') && text.includes('You shared a video');
                    });
                    messageContainer = chatArea;
                    console.log(`[DEBUG] Found chat area with fallback method: ${messageContainer ? 'YES' : 'NO'}`);
                }
                
                if (!messageContainer) {
                    // Even more aggressive fallback - find ANY div with our text
                    const allDivs = Array.from(document.querySelectorAll('div'));
                    console.log(`[DEBUG] Total divs on page: ${allDivs.length}`);
                    
                    const divsWithDwag = allDivs.filter(div => div.textContent?.includes('dwag add'));
                    console.log(`[DEBUG] Divs containing "dwag add": ${divsWithDwag.length}`);
                    
                    const divsWithVideo = allDivs.filter(div => div.textContent?.includes('You shared a video'));
                    console.log(`[DEBUG] Divs containing "You shared a video": ${divsWithVideo.length}`);
                    
                    // Use the body as container if nothing else works
                    messageContainer = document.body;
                    console.log(`[DEBUG] Using document.body as fallback container`);
                }
                
                if (messageContainer) {
                    console.log(`[DEBUG] Message container found: ${messageContainer.tagName} with class="${messageContainer.className}"`);
                    
                    // Get all child elements that might be messages
                    const messageElements = Array.from(messageContainer.querySelectorAll('div')).filter(div => {
                        const text = div.textContent || '';
                        return (text.includes('dwag add') || text.includes('You shared a video')) && 
                               text.trim().length > 0 && text.trim().length < 200;
                    });
                    
                    console.log(`[DEBUG] Found ${messageElements.length} message elements in conversation`);
                    
                    // Parse the conversation chronologically
                    let lastVideoUrl = null;
                    
                    messageElements.forEach((el, index) => {
                        const text = el.textContent?.trim() || '';
                        console.log(`\n[DEBUG] Processing element ${index}: "${text}"`);
                        console.log(`[DEBUG] Element HTML: ${el.outerHTML.substring(0, 200)}...`);
                        
                        // Check for shared video
                        if (text.includes('You shared a video')) {
                            console.log(`[DEBUG] Found "You shared a video" element`);
                            
                            // Look for actual video URL in this element or nearby
                            const videoSelectors = [
                                'a[href*="tiktok.com/@"]',
                                'a[href*="/@"]', 
                                'a[href*="video/"]',
                                'video',
                                'img[src*="tiktok"]'
                            ];
                            
                            let foundUrl = null;
                            let foundSelector = null;
                            
                            for (const selector of videoSelectors) {
                                const locations = [
                                    { el: el.querySelector(selector), name: 'self' },
                                    { el: el.parentElement?.querySelector(selector), name: 'parent' },
                                    { el: el.nextElementSibling?.querySelector(selector), name: 'next sibling' },
                                    { el: el.previousElementSibling?.querySelector(selector), name: 'prev sibling' }
                                ];
                                
                                for (const {el: videoEl, name: location} of locations) {
                                    if (videoEl) {
                                        const url = videoEl.href || videoEl.src || videoEl.getAttribute('data-src');
                                        console.log(`[DEBUG] Found ${selector} in ${location}: ${url}`);
                                        
                                        if (url && url.includes('tiktok') && !url.includes('tiktokcdn')) {
                                            foundUrl = url.replace('www.tiktok.com', 'www.kktiktok.com');
                                            foundSelector = selector;
                                            console.log(`[DEBUG] Selected URL: ${foundUrl}`);
                                            break;
                                        }
                                    }
                                }
                                if (foundUrl) break;
                            }
                            
                            if (!foundUrl) {
                                console.log(`[DEBUG] No valid video URL found, using placeholder`);
                                foundUrl = 'https://www.kktiktok.com/@user/video/placeholder';
                            }
                            
                            results.push({
                                content: foundUrl,
                                itemType: 'video_share',
                                timestamp: Date.now(),
                                sender: 'Jeremy L',
                                rawText: text,
                                debug: { foundSelector, elementIndex: index }
                            });
                            
                            console.log(`[DEBUG] Added video result: ${foundUrl}`);
                        }
                        
                        // Check for dwag command (clean text parsing)
                        if (text.includes('dwag add')) {
                            console.log(`[DEBUG] Found "dwag add" element: "${text}"`);
                            
                            // Extract clean dwag command
                            let cleanCommand = text;
                            
                            // Remove timestamp artifacts like "17:15"
                            cleanCommand = cleanCommand.replace(/\\d{1,2}:\\d{2}/g, '');
                            
                            // Remove username artifacts  
                            cleanCommand = cleanCommand.replace(/Jeremy L/g, '');
                            
                            // Clean up extra spaces
                            cleanCommand = cleanCommand.replace(/\\s+/g, ' ').trim();
                            
                            console.log(`[DEBUG] Cleaned command: "${cleanCommand}"`);
                            
                            // Validate it's still a proper dwag command
                            if (cleanCommand.match(/^dwag\\s+add\\s+\\w+/)) {
                                results.push({
                                    content: cleanCommand,
                                    itemType: 'text',
                                    timestamp: Date.now(),
                                    sender: 'Jeremy L',
                                    rawText: text,
                                    debug: { elementIndex: index }
                                });
                                console.log(`[DEBUG] Added dwag command result: "${cleanCommand}"`);
                            } else {
                                console.log(`[DEBUG] Command failed validation: "${cleanCommand}"`);
                            }
                        }
                    });
                } else {
                    console.log('Could not find message container');
                }
                
                return results;
            }, lastRunTime);
            
            console.log(`Extracted ${messages.length} new messages`);
            
            // For debugging, show all messages regardless of timestamp
            console.log(`[DEBUG] All extracted messages: ${messages.length}`);
            messages.forEach((msg, i) => {
                console.log(`[DEBUG] Message ${i}: ${msg.itemType} - "${msg.content}"`);
            });
            
            // Filter messages by timestamp (like Instagram implementation) 
            const newMessages = messages; // Temporarily disable filtering
            // const newMessages = messages.filter(msg => msg.timestamp > lastRunTime);
            
            if (newMessages.length > 0) {
                // Format messages
                const formattedMessages = newMessages.map(msg => ({
                    sender: msg.sender,
                    content: msg.content,
                    time: new Date(msg.timestamp).toLocaleString(),
                    timestamp: new Date(msg.timestamp).toISOString(),
                    itemType: msg.itemType,
                    rawMessage: msg
                }));
                
                messagesByConversation['Jeremy L'] = formattedMessages;
                
                // Debug output
                formattedMessages.forEach(msg => {
                    console.log(`  -> ${msg.itemType === 'video_share' ? '[VIDEO]' : '[TEXT]'} "${msg.content}"`);
                });
            } else {
                console.log('No new messages since last run');
            }
            
        } catch (error) {
            console.error('Error parsing messages:', error);
        }
        
        return messagesByConversation;
    }
}

module.exports = MessageScraper;