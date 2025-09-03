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
                
                // Extract username by finding the first line that looks like a name
                let username = 'Unknown';
                const lines = text.split(/\n|Message request|dwag add|\d{1,2}\/\d{1,2}\/\d{4}/);
                
                for (const line of lines) {
                    const cleanLine = line.trim();
                    // Look for lines that could be usernames (not empty, not too long, contains letters)
                    if (cleanLine && cleanLine.length > 1 && cleanLine.length < 50 && 
                        /[a-zA-Z]/.test(cleanLine) && !cleanLine.includes(':')) {
                        username = cleanLine;
                        break;
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
            const seen = new Set();
            
            console.log('[DEBUG] Starting message extraction...');
            
            // First, let's see if there are ANY TikTok URLs anywhere on the page
            const pageHTML = document.body.innerHTML;
            const allTikTokUrls = pageHTML.match(/(https?:\/\/[^\s"']+tiktok\.com[^\s"']*)/g) || [];
            console.log(`[DEBUG] Found ${allTikTokUrls.length} TikTok URLs on entire page:`);
            allTikTokUrls.forEach(url => console.log(`[DEBUG] Page URL: ${url}`));
            
            // Helper function to extract video URL from an element
            function extractVideoUrlFromElement(element) {
                let videoUrl = 'https://www.kktiktok.com/video/placeholder';
                
                console.log(`[DEBUG] Extracting video URL from element: ${element.tagName} with text: "${element.textContent?.substring(0, 50)}"`);
                
                // Strategy 1: Try to click the video and look for copy link functionality
                const videos = element.querySelectorAll('video, [class*="video"], [class*="Video"]');
                for (const video of videos) {
                    try {
                        // Try clicking to see if it reveals a copy link or URL
                        console.log(`[DEBUG] Found video element, trying to click it`);
                        video.click();
                        
                        // Give it a moment for any UI to appear
                        setTimeout(() => {
                            // Look for copy link buttons or menus that might have appeared
                            const copyButtons = document.querySelectorAll('[class*="copy"], [class*="Copy"], button:has-text("copy"), button:has-text("Copy")');
                            console.log(`[DEBUG] Found ${copyButtons.length} potential copy buttons after clicking video`);
                        }, 100);
                    } catch (e) {
                        console.log(`[DEBUG] Error clicking video: ${e.message}`);
                    }
                }
                
                // Strategy 2: Look for direct TikTok links
                const links = element.querySelectorAll('a[href*="tiktok.com"]');
                for (const link of links) {
                    const href = link.href;
                    if (href && (href.includes('/@') || href.includes('/video/')) && !href.includes('tiktokcdn')) {
                        videoUrl = href.replace('www.tiktok.com', 'www.kktiktok.com');
                        console.log(`[DEBUG] Found direct link: ${videoUrl}`);
                        return videoUrl;
                    }
                }
                
                // Strategy 3: Look for React/Vue data attributes
                const allAttributes = element.getAttributeNames();
                console.log(`[DEBUG] Element has ${allAttributes.length} attributes: ${allAttributes.join(', ')}`);
                
                for (const attr of allAttributes) {
                    const value = element.getAttribute(attr);
                    if (value && value.includes('tiktok.com') && (value.includes('/@') || value.includes('/video/'))) {
                        videoUrl = value.replace('www.tiktok.com', 'www.kktiktok.com');
                        console.log(`[DEBUG] Found URL in attribute ${attr}: ${videoUrl}`);
                        return videoUrl;
                    }
                }
                
                // Strategy 4: Look in event handlers and JavaScript properties
                const onclick = element.getAttribute('onclick') || '';
                if (onclick) {
                    const urlMatch = onclick.match(/(https?:\/\/[^\s'"]+tiktok\.com[^\s'"]*)/);
                    if (urlMatch) {
                        videoUrl = urlMatch[1].replace('www.tiktok.com', 'www.kktiktok.com');
                        console.log(`[DEBUG] Found in onclick: ${videoUrl}`);
                        return videoUrl;
                    }
                }
                
                // Strategy 5: Search the entire element HTML more thoroughly
                const html = element.outerHTML;
                const urlMatches = html.match(/(https?:\/\/[^\s"']+tiktok\.com[^\s"']*)/g) || [];
                console.log(`[DEBUG] Found ${urlMatches.length} TikTok URLs in element HTML`);
                
                for (const url of urlMatches) {
                    if (url.includes('/@') || url.includes('/video/')) {
                        videoUrl = url.replace('www.tiktok.com', 'www.kktiktok.com');
                        console.log(`[DEBUG] Found valid URL in HTML: ${videoUrl}`);
                        return videoUrl;
                    }
                }
                
                // Strategy 6: Try to find parent elements that might contain the URL
                let parent = element.parentElement;
                let level = 0;
                while (parent && level < 3) {
                    const parentLinks = parent.querySelectorAll('a[href*="tiktok.com"]');
                    for (const link of parentLinks) {
                        const href = link.href;
                        if (href && (href.includes('/@') || href.includes('/video/'))) {
                            videoUrl = href.replace('www.tiktok.com', 'www.kktiktok.com');
                            console.log(`[DEBUG] Found URL in parent level ${level}: ${videoUrl}`);
                            return videoUrl;
                        }
                    }
                    parent = parent.parentElement;
                    level++;
                }
                
                console.log(`[DEBUG] No video URL found after trying all strategies, using placeholder`);
                return 'https://www.kktiktok.com/video/placeholder';
            }
            
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
                    if (text.includes('dwag add') && 
                        !text.includes('Messages') &&
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
                    
                    // Try to extract timestamp from the message
                    let timestamp = null;
                    
                    // Look for time patterns in the text (HH:MM format)
                    const timeMatches = text.match(/(\d{1,2}:\d{2})/g);
                    if (timeMatches && timeMatches.length > 0) {
                        // Use the last time match (most likely to be the message time)
                        const timeStr = timeMatches[timeMatches.length - 1];
                        const [hours, minutes] = timeStr.split(':').map(Number);
                        
                        // Create a timestamp for today with this time
                        const today = new Date();
                        today.setHours(hours, minutes, 0, 0);
                        timestamp = today.toISOString();
                        
                        console.log(`[DEBUG] Extracted timestamp: ${timeStr} -> ${timestamp}`);
                    }
                    
                    // Parse different message types
                    if (text.includes('dwag add')) {
                        // Extract just the dwag command, remove any usernames or timestamps
                        let command = text;
                        
                        // Remove timestamps from the command
                        command = command.replace(/\d{1,2}:\d{2}/g, '').trim();
                        
                        // Find the dwag add command within the text
                        const dwagMatch = command.match(/dwag\s+add\s+\w+.*$/i);
                        if (dwagMatch) {
                            results.push({ type: 'command', content: dwagMatch[0], timestamp });
                        }
                    } else if (text.match(/^Message request accepted|You can start chatting/)) {
                        // System message, skip
                        console.log('[DEBUG] Skipping system message');
                    } else if (item.querySelector('video') || item.querySelector('img[src*="tiktok"]') || 
                              item.querySelector('img[src*="musically"]')) {
                        // Contains media - this is likely an embedded video
                        console.log(`[DEBUG] Found media element in chat item`);
                        results.push({ 
                            type: 'video', 
                            content: 'https://www.kktiktok.com/video/placeholder',
                            needsUrlExtraction: true,
                            chatItemElement: item,
                            timestamp
                        });
                    } else if (text.length > 0 && text.length < 100 && 
                              !text.includes('Messages') && !text.includes('/2025')) {
                        // Generic text message that's not too long and not a UI element
                        results.push({ type: 'text', content: text, timestamp });
                    }
                });
            } else {
                console.log('[DEBUG] WARNING: Could not find chat container, results may be incorrect');
                
                // Emergency fallback - just look for ChatItemWrapper elements
                const allChatItems = document.querySelectorAll('[class*="ChatItemWrapper"]');
                console.log(`[DEBUG] Emergency fallback: found ${allChatItems.length} chat items globally`);
                
                allChatItems.forEach((item, index) => {
                    const text = item.textContent?.trim() || '';
                    
                    // Only process items that look like actual messages (not UI elements)
                    if (text && !seen.has(text) && 
                        !text.includes('Messages') && 
                        !text.includes('/2025') &&
                        text.length < 200) {
                        
                        seen.add(text);
                        
                        // Try to extract timestamp from the message
                        let timestamp = null;
                        const timeMatches = text.match(/(\d{1,2}:\d{2})/g);
                        if (timeMatches && timeMatches.length > 0) {
                            const timeStr = timeMatches[timeMatches.length - 1];
                            const [hours, minutes] = timeStr.split(':').map(Number);
                            const today = new Date();
                            today.setHours(hours, minutes, 0, 0);
                            timestamp = today.toISOString();
                        }
                        
                        if (text.includes('dwag add')) {
                            // Clean up the command
                            let command = text.replace(/\d{1,2}:\d{2}/g, '').trim();
                            const dwagMatch = command.match(/dwag\s+add\s+\w+.*$/i);
                            if (dwagMatch) {
                                results.push({ type: 'command', content: dwagMatch[0], timestamp });
                            }
                        } else if (text.length > 0 && text.length < 100) {
                            // Generic text message
                            results.push({ type: 'text', content: text, timestamp });
                        }
                    }
                });
            }
            
            console.log(`[DEBUG] Extracted ${results.length} messages`);
            return results;
        });
        
        return messages;
    }

    async extractVideoUrls(messages) {
        console.log('Extracting actual video URLs by clicking on videos...');
        
        // First, let's get all chat items and their associated video elements
        const chatItemsWithVideos = await this.page.evaluate(() => {
            const chatContainer = document.querySelector('[class*="ChatMain"]') || 
                                 document.querySelector('[class*="ChatBox"]') ||
                                 document.querySelector('[class*="MessageList"]');
            
            if (!chatContainer) return [];
            
            const chatItems = chatContainer.querySelectorAll('[class*="ChatItemWrapper"]');
            const videoInfo = [];
            
            chatItems.forEach((item, index) => {
                const text = item.textContent?.trim() || '';
                const videos = item.querySelectorAll('video');
                const clickableVideos = item.querySelectorAll('[class*="video"], [class*="Video"]');
                const images = item.querySelectorAll('img');
                
                // Check if this chat item has video content
                if (videos.length > 0 || clickableVideos.length > 0 || 
                    (images.length > 0 && text.length < 50 && /^[a-zA-Z\s]+$/.test(text))) {
                    
                    videoInfo.push({
                        index,
                        text,
                        hasVideo: videos.length > 0,
                        hasClickableVideo: clickableVideos.length > 0,
                        hasImages: images.length > 0
                    });
                }
            });
            
            console.log(`[DEBUG] Found ${videoInfo.length} chat items with potential videos`);
            return videoInfo;
        });
        
        let videoMessageIndex = 0;
        
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            
            if (msg.needsUrlExtraction && msg.type === 'video') {
                console.log(`Attempting to extract URL for video message ${i + 1} (video #${videoMessageIndex + 1})...`);
                
                try {
                    // Click on the specific video for this message
                    const clickResult = await this.page.evaluate((videoIndex) => {
                        const chatContainer = document.querySelector('[class*="ChatMain"]') || 
                                             document.querySelector('[class*="ChatBox"]') ||
                                             document.querySelector('[class*="MessageList"]');
                        
                        if (!chatContainer) return null;
                        
                        const chatItems = chatContainer.querySelectorAll('[class*="ChatItemWrapper"]');
                        const videoItems = [];
                        
                        // Collect all chat items that contain videos
                        chatItems.forEach((item) => {
                            const text = item.textContent?.trim() || '';
                            const videos = item.querySelectorAll('video');
                            const clickableVideos = item.querySelectorAll('[class*="video"], [class*="Video"]');
                            const images = item.querySelectorAll('img');
                            
                            if (videos.length > 0 || clickableVideos.length > 0 || 
                                (images.length > 0 && text.length < 50 && /^[a-zA-Z\s]+$/.test(text))) {
                                videoItems.push(item);
                            }
                        });
                        
                        console.log(`[DEBUG] Found ${videoItems.length} video items, trying to click item ${videoIndex}`);
                        
                        if (videoIndex < videoItems.length) {
                            const targetItem = videoItems[videoIndex];
                            console.log(`[DEBUG] Target item text: "${targetItem.textContent?.substring(0, 50)}..."`);
                            
                            // Try to click video elements first
                            const videos = targetItem.querySelectorAll('video');
                            if (videos.length > 0) {
                                for (const video of videos) {
                                    if (video.offsetParent !== null) {
                                        console.log(`[DEBUG] Clicking video in item ${videoIndex}`);
                                        video.click();
                                        return 'clicked_video';
                                    }
                                }
                            }
                            
                            // Try clickable video containers in this specific item
                            const clickableVideos = targetItem.querySelectorAll('[class*="video"], [class*="Video"]');
                            if (clickableVideos.length > 0) {
                                for (const element of clickableVideos) {
                                    if (element.offsetParent !== null) {
                                        console.log(`[DEBUG] Clicking video container in item ${videoIndex}`);
                                        element.click();
                                        return 'clicked_container';
                                    }
                                }
                            }
                            
                            // Try clicking images if it's a username-only message
                            const images = targetItem.querySelectorAll('img');
                            if (images.length > 0) {
                                for (const img of images) {
                                    if (img.offsetParent !== null) {
                                        console.log(`[DEBUG] Clicking image in item ${videoIndex}`);
                                        img.click();
                                        return 'clicked_image';
                                    }
                                }
                            }
                            
                            // Last resort: click the entire chat item
                            console.log(`[DEBUG] Clicking entire chat item ${videoIndex} as fallback`);
                            targetItem.click();
                            return 'clicked_item';
                        } else {
                            console.log(`[DEBUG] Video index ${videoIndex} is out of range (only ${videoItems.length} items)`);
                        }
                        
                        return null;
                    }, videoMessageIndex);
                    
                    if (clickResult) {
                        // Wait for potential navigation
                        await this.page.waitForTimeout(2000);
                        
                        // Check if we navigated to a TikTok video page
                        const currentUrl = this.page.url();
                        console.log(`Current URL after clicking: ${currentUrl}`);
                        
                        if (currentUrl.includes('tiktok.com') && (currentUrl.includes('/@') || currentUrl.includes('/video/'))) {
                            // We successfully navigated to a TikTok video page!
                            const realUrl = currentUrl.replace('www.tiktok.com', 'www.kktiktok.com');
                            msg.content = realUrl;
                            console.log(`  -> Found real URL: ${realUrl}`);
                            
                            // Navigate back to the chat
                            await this.page.goBack();
                            await this.page.waitForTimeout(2000);
                        } else {
                            console.log(`  -> No navigation occurred, keeping placeholder`);
                        }
                    }
                    
                } catch (error) {
                    console.log(`  -> Error extracting URL: ${error.message}`);
                }
                
                videoMessageIndex++; // Move to next video
            }
        }
        
        return messages;
    }

    async collectAllMessages() {
        const messagesByConversation = {};
        const lastRunTime = this.getLastRunTime();
        
        console.log(`Looking for messages since: ${new Date(lastRunTime).toLocaleString()}`);
        
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
            
            // Extract messages with timestamps
            let messages = await this.extractChatMessages();
            console.log(`Found ${messages.length} messages`);
            
            // Filter messages by timestamp - only include new messages
            const filteredMessages = messages.filter(msg => {
                // If message has a timestamp, check if it's newer than last run
                if (msg.timestamp) {
                    const msgTime = new Date(msg.timestamp).getTime();
                    const isNew = msgTime > lastRunTime;
                    if (!isNew) {
                        console.log(`Skipping old message: "${msg.content.substring(0, 50)}..."`);
                    }
                    return isNew;
                }
                // If no timestamp available, include the message (better to have false positives)
                return true;
            });
            
            console.log(`After filtering: ${filteredMessages.length} new messages`);
            
            // Try to extract real video URLs for new messages only
            const messagesWithUrls = await this.extractVideoUrls(filteredMessages);
            
            if (messagesWithUrls.length > 0) {
                // Format messages for Discord
                const formattedMessages = messagesWithUrls.map(msg => ({
                    sender: conv.username,
                    content: msg.content,
                    time: msg.timestamp ? new Date(msg.timestamp).toLocaleString() : new Date().toLocaleString(),
                    timestamp: msg.timestamp || new Date().toISOString(),
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