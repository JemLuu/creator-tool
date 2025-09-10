const fs = require('fs');
const path = require('path');

class FinalScraper {
    constructor(page) {
        this.page = page;
        this.lastRunFile = '.tiktok-last-run';
        // Save sent pairs file in the dwag-tt directory
        this.sentPairsFile = path.join(__dirname, '.tiktok-sent-pairs');
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

    isDuplicatePair(videoUrl, ideaText) {
        try {
            if (!fs.existsSync(this.sentPairsFile)) {
                return false;
            }
            
            const pairToCheck = `${videoUrl}|${ideaText}`;
            const sentPairs = fs.readFileSync(this.sentPairsFile, 'utf8');
            
            return sentPairs.includes(pairToCheck);
        } catch (error) {
            console.error('Error checking duplicate pairs:', error);
            return false; // If we can't check, assume it's not a duplicate
        }
    }

    markPairAsSent(videoUrl, ideaText) {
        try {
            const pair = `${videoUrl}|${ideaText}\n`;
            fs.appendFileSync(this.sentPairsFile, pair);
        } catch (error) {
            console.error('Error saving sent pair:', error);
        }
    }

    async navigateToMessages() {
        console.log('Navigating to TikTok messages...');
        await this.page.goto('https://www.tiktok.com/messages', { waitUntil: 'networkidle' });
        await this.page.waitForTimeout(3000);
        
        // Check if we're in the notifications section and need to navigate to actual messages
        const currentUrl = this.page.url();
        console.log(`[DEBUG] Current URL: ${currentUrl}`);
        
        // Look for a "Messages" tab or button to click
        try {
            // Try to find and click on the Messages tab/button
            const messagesButton = await this.page.$('button:has-text("Messages")');
            if (messagesButton) {
                console.log('[DEBUG] Found Messages button, clicking...');
                await messagesButton.click();
                await this.page.waitForTimeout(2000);
            } else {
                // Try alternative selectors for messages navigation
                const messageSelectors = [
                    'a[href*="/messages"]',
                    'button[data-e2e="messages-tab"]',
                    '[data-testid="messages-tab"]',
                    'button:has-text("Messages")',
                    'a:has-text("Messages")'
                ];
                
                for (const selector of messageSelectors) {
                    try {
                        const element = await this.page.$(selector);
                        if (element) {
                            console.log(`[DEBUG] Found messages element with selector: ${selector}`);
                            await element.click();
                            await this.page.waitForTimeout(2000);
                            break;
                        }
                    } catch (e) {
                        // Continue to next selector
                    }
                }
            }
        } catch (error) {
            console.log('[DEBUG] Could not find Messages navigation button:', error.message);
        }
        
        // Wait a bit more for the page to settle
        await this.page.waitForTimeout(2000);
        
        // Log final URL to confirm we're in the right place
        const finalUrl = this.page.url();
        console.log(`[DEBUG] Final URL after navigation: ${finalUrl}`);
    }

    async getConversationList() {
        console.log('Getting conversation list...');
        
        // First, let's debug what's actually on the page
        const debugInfo = await this.page.evaluate(() => {
            const debug = {
                url: window.location.href,
                title: document.title,
                allDivs: document.querySelectorAll('div').length,
                allSpans: document.querySelectorAll('span').length,
                allLinks: document.querySelectorAll('a').length,
                possibleSelectors: []
            };
            
            // Look for common conversation-related selectors
            const commonSelectors = [
                '[data-e2e="message-item"]',
                '[data-testid*="message"]',
                '[class*="message"]',
                '[class*="conversation"]',
                '[class*="chat"]',
                '[class*="item"]',
                'div[role="button"]',
                'div[tabindex]'
            ];
            
            commonSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    debug.possibleSelectors.push({
                        selector,
                        count: elements.length,
                        sampleText: Array.from(elements).slice(0, 3).map(el => el.textContent?.substring(0, 50))
                    });
                }
            });
            
            // Look for elements that might contain usernames
            const allElements = document.querySelectorAll('*');
            const usernameCandidates = [];
            
            Array.from(allElements).forEach((el, index) => {
                const text = el.textContent?.trim();
                if (text && text.length > 2 && text.length < 30 && 
                    /^[a-zA-Z0-9._]+$/.test(text) && 
                    !text.includes('TikTok') && 
                    !text.includes('Messages') &&
                    !text.includes('Search')) {
                    usernameCandidates.push({
                        text,
                        tagName: el.tagName,
                        className: el.className,
                        index
                    });
                }
            });
            
            debug.usernameCandidates = usernameCandidates.slice(0, 20); // Limit to first 20
            
            return debug;
        });
        
        console.log('[DEBUG] Page debug info:', JSON.stringify(debugInfo, null, 2));
        
        // Now try to find conversations using multiple strategies
        const conversations = await this.page.evaluate(() => {
            const convList = [];
            
            // Strategy 1: Look for elements that contain usernames and message previews
            const allDivs = document.querySelectorAll('div');
            const conversationCandidates = [];
            
            Array.from(allDivs).forEach((div, index) => {
                const text = div.textContent?.trim();
                if (text && text.length > 10 && text.length < 200) {
                    // Look for patterns that suggest this is a conversation item
                    const hasUsername = /^[a-zA-Z0-9._]+$/.test(text.split('\n')[0]?.trim());
                    const hasMessagePreview = text.includes('meme') || text.includes('Message request') || 
                                            text.includes('dwag') || text.includes('skit') || 
                                            text.includes('audio') || /\d{1,2}\/\d{1,2}\/\d{4}/.test(text);
                    
                    if (hasUsername && hasMessagePreview) {
                        conversationCandidates.push({
                            element: div,
                            text: text,
                            index: index
                        });
                    }
                }
            });
            
            console.log(`[DEBUG] Found ${conversationCandidates.length} conversation candidates`);
            
            // Strategy 2: If no candidates found, try looking for specific usernames we know exist
            if (conversationCandidates.length === 0) {
                console.log('[DEBUG] No candidates found with Strategy 1, trying Strategy 2...');
                
                const knownUsernames = ['have.some.pham', 'Jonathan Coulter', 'Bray', 'dwag', 'Jeremy L'];
                const allElements = document.querySelectorAll('*');
                
                Array.from(allElements).forEach((el, index) => {
                    const text = el.textContent?.trim();
                    if (text) {
                        knownUsernames.forEach(username => {
                            if (text.includes(username)) {
                                // Make sure this isn't a notification item
                                const isNotification = text.includes('started following') || 
                                                     text.includes('liked your') || 
                                                     text.includes('commented on') ||
                                                     text.includes('ago') ||
                                                     text.includes('Follow back');
                                
                                if (!isNotification) {
                                    conversationCandidates.push({
                                        element: el,
                                        text: text,
                                        index: index,
                                        foundUsername: username
                                    });
                                }
                            }
                        });
                    }
                });
                
                console.log(`[DEBUG] Strategy 2 found ${conversationCandidates.length} candidates`);
            }
            
            // Strategy 3: Look for elements that might be conversation containers
            if (conversationCandidates.length === 0) {
                console.log('[DEBUG] No candidates found with Strategy 2, trying Strategy 3...');
                
                // Look for elements that might contain conversation lists
                const possibleContainers = document.querySelectorAll('div[class*="list"], div[class*="conversation"], div[class*="message"], div[class*="chat"]');
                
                possibleContainers.forEach((container, index) => {
                    const text = container.textContent?.trim();
                    if (text && text.length > 20) {
                        // Check if this container has multiple usernames (suggesting it's a conversation list)
                        const usernameMatches = text.match(/[a-zA-Z0-9._]+/g);
                        if (usernameMatches && usernameMatches.length >= 2) {
                            conversationCandidates.push({
                                element: container,
                                text: text,
                                index: index,
                                isContainer: true
                            });
                        }
                    }
                });
                
                console.log(`[DEBUG] Strategy 3 found ${conversationCandidates.length} candidates`);
            }
            
            // Process the candidates and deduplicate
            const seenUsernames = new Set();
            const uniqueConversations = [];
            
            conversationCandidates.forEach((candidate, index) => {
                const text = candidate.text;
                const lines = text.split('\n').map(line => line.trim()).filter(line => line);
                
                // Extract username
                let username = 'Unknown';
                if (candidate.foundUsername) {
                    username = candidate.foundUsername;
                } else if (lines.length > 0 && /^[a-zA-Z0-9._]+$/.test(lines[0])) {
                    username = lines[0];
                }
                
                // Skip if we've already seen this username
                if (seenUsernames.has(username)) {
                    return;
                }
                
                // Only include if it looks like a real conversation (not navigation elements)
                const isRealConversation = text.includes('meme') || text.includes('Message request') || 
                                         text.includes('dwag') || text.includes('skit') || 
                                         text.includes('audio') || /\d{1,2}\/\d{1,2}\/\d{4}/.test(text);
                
                // Skip navigation elements and other non-conversation items
                const isNavigation = text.includes('TikTok') || text.includes('Search') || 
                                   text.includes('For You') || text.includes('Shop') || 
                                   text.includes('Explore') || text.includes('Following') ||
                                   text.includes('Friends') || text.includes('LIVE');
                
                if (isRealConversation && !isNavigation && username !== 'Unknown') {
                    seenUsernames.add(username);
                    
                    // Get preview text
                    const preview = text.substring(0, 100);
                    
                    uniqueConversations.push({
                        index: uniqueConversations.length,
                        username,
                        preview,
                        hasMessages: true,
                        fullText: text,
                        element: candidate.element
                    });
                    
                    console.log(`[DEBUG] Unique conversation ${uniqueConversations.length - 1}: ${username} - "${preview}"`);
                }
            });
            
            return uniqueConversations;
        });
        
        console.log(`Found ${conversations.length} conversations:`);
        conversations.forEach(conv => {
            console.log(`  - ${conv.username}: ${conv.preview.substring(0, 50)}...`);
        });
        
        return conversations;
    }

    async clickIntoConversation(index) {
        console.log(`Clicking into conversation ${index}...`);
        
        // Get the conversation list again to find the element to click
        const conversations = await this.getConversationList();
        
        if (index >= conversations.length) {
            console.log(`[DEBUG] Index ${index} out of range. Found ${conversations.length} conversations.`);
            return false;
        }
        
        const targetConversation = conversations[index];
        console.log(`[DEBUG] Trying to click conversation: ${targetConversation.username}`);
        
        // Try multiple strategies to click the conversation
        const clicked = await this.page.evaluate((targetUsername) => {
            // Strategy 1: Look for elements containing the username
            const allElements = document.querySelectorAll('*');
            let foundElement = null;
            
            Array.from(allElements).forEach((el) => {
                const text = el.textContent?.trim();
                if (text && text.includes(targetUsername)) {
                    // Make sure it's not a navigation element
                    const isNavigation = text.includes('TikTok') || text.includes('Search') || 
                                       text.includes('For You') || text.includes('Shop') || 
                                       text.includes('Explore') || text.includes('Following') ||
                                       text.includes('Friends') || text.includes('LIVE');
                    
                    if (!isNavigation && (text.includes('meme') || text.includes('Message request') || 
                                         text.includes('dwag') || text.includes('skit') || 
                                         text.includes('audio') || /\d{1,2}\/\d{1,2}\/\d{4}/.test(text))) {
                        foundElement = el;
                    }
                }
            });
            
            if (foundElement) {
                console.log(`[DEBUG] Found element for ${targetUsername}, attempting to click...`);
                try {
                    foundElement.click();
                    return true;
                } catch (error) {
                    console.log(`[DEBUG] Click failed: ${error.message}`);
                    return false;
                }
            }
            
            console.log(`[DEBUG] Could not find clickable element for ${targetUsername}`);
            return false;
        }, targetConversation.username);
        
        if (clicked) {
            console.log(`[DEBUG] Successfully clicked conversation: ${targetConversation.username}`);
            // Wait for chat to load
            await this.page.waitForTimeout(3000);
        } else {
            console.log(`[DEBUG] Failed to click conversation: ${targetConversation.username}`);
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
            
            // Find chat container
            const possibleContainers = [
                '[class*="ChatMain"]',
                '[class*="ChatBox"]',
                '[class*="MessageList"]',
                '[class*="ChatContent"]',
                '[class*="MessageContainer"]'
            ];
            
            let chatContainer = null;
            for (const selector of possibleContainers) {
                const container = document.querySelector(selector);
                if (container) {
                    chatContainer = container;
                    break;
                }
            }
            
            // Find message items
            const messageSelectors = [
                '[class*="ChatItemWrapper"]',
                '[class*="MessageItem"]',
                '[class*="ChatMessage"]',
                '[class*="MessageWrapper"]',
                '[class*="ChatItem"]:not([class*="Wrapper"])'
            ];
            
            let allChatItems = [];
            for (const selector of messageSelectors) {
                const items = document.querySelectorAll(selector);
                if (items.length > 0) {
                    allChatItems = items;
                    break;
                }
            }
            
            // Fallback: look for message divs in chat container
            if (allChatItems.length === 0 && chatContainer) {
                const divs = chatContainer.querySelectorAll('div');
                allChatItems = Array.from(divs).filter(div => {
                    const text = div.textContent || '';
                    const hasMedia = div.querySelector('video, img[src*="tiktok"], img[src*="musically"]');
                    const hasCommand = text.includes('dwag');
                    return (hasMedia || hasCommand) && text.length > 0 && text.length < 500;
                });
            }
            
            console.log(`[DEBUG] Found ${allChatItems.length} chat items to process`);
            
            // Process all found chat items
            if (allChatItems.length > 0) {
                allChatItems.forEach((item, index) => {
                    const text = item.textContent?.trim() || '';
                    
                    // Skip empty messages and duplicates
                    if (!text) return;
                    
                    const uniqueKey = `${text}_${index}`;
                    if (seen.has(uniqueKey)) return;
                    seen.add(uniqueKey);
                    
                    // Extract timestamp
                    let timestamp = null;
                    let timeStr = null;
                    
                    // Look for time element
                    const timeElem = item.querySelector('[class*="time" i], [class*="Time" i], time, [datetime]');
                    if (timeElem) {
                        timeStr = timeElem.textContent || timeElem.getAttribute('datetime') || timeElem.getAttribute('title');
                    }
                    
                    // Check aria-labels for time
                    if (!timeStr) {
                        const elemWithAriaLabel = item.querySelector('[aria-label]');
                        if (elemWithAriaLabel) {
                            const ariaLabel = elemWithAriaLabel.getAttribute('aria-label');
                            const timeMatch = ariaLabel?.match(/(\d{1,2}:\d{2})/);
                            if (timeMatch) timeStr = timeMatch[1];
                        }
                    }
                    
                    // Look in parent elements for time
                    if (!timeStr) {
                        let parent = item.parentElement;
                        let level = 0;
                        while (parent && level < 3 && !timeStr) {
                            const parentTimeElem = parent.querySelector('[class*="time" i], [class*="Time" i]');
                            if (parentTimeElem && parentTimeElem !== item) {
                                timeStr = parentTimeElem.textContent;
                                break;
                            }
                            parent = parent.parentElement;
                            level++;
                        }
                    }
                    
                    // Fallback: search text for time patterns
                    if (!timeStr) {
                        const timeMatches = text.match(/(\d{1,2}:\d{2})/g);
                        if (timeMatches && timeMatches.length > 0) {
                            timeStr = timeMatches[timeMatches.length - 1];
                        }
                    }
                    
                    // Convert time string to timestamp
                    if (timeStr) {
                        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
                        if (timeMatch) {
                            const [_, hours, minutes] = timeMatch;
                            const today = new Date();
                            today.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                            timestamp = today.toISOString();
                        }
                    }
                    
                    // Analyze message content
                    const hasVideo = item.querySelector('video') !== null;
                    const imageCount = item.querySelectorAll('img').length;
                    const hasMusicallyImg = item.querySelector('img[src*="musically"]') !== null;
                    const hasMultipleImages = imageCount >= 2;
                    
                    // Parse different message types
                    if (text.match(/Message request accepted|You can start chatting/)) {
                        // Skip system messages
                        return;
                    } else if (text.includes('dwag add')) {
                        // Extract dwag command
                        const command = text.replace(/\d{1,2}:\d{2}/g, '').trim();
                        const dwagMatch = command.match(/dwag\s+add\s+\w+.*$/i);
                        if (dwagMatch) {
                            results.push({ 
                                type: 'command', 
                                content: dwagMatch[0], 
                                timestamp,
                                originalIndex: index 
                            });
                        }
                    } else if (hasVideo || hasMusicallyImg || (hasMultipleImages && !text.includes('dwag'))) {
                        // Video share - only items with 2+ images (avatar + thumbnail)
                        results.push({ 
                            type: 'video', 
                            content: 'https://www.kktiktok.com/video/placeholder',
                            needsUrlExtraction: true,
                            chatItemElement: item,
                            timestamp,
                            originalIndex: index,
                            originalText: text.substring(0, 50),
                            imageCount: imageCount
                        });
                    } else if (text.length > 0 && text.length < 200 && !text.includes('Messages') && !text.includes('/2025')) {
                        // Generic text message
                        results.push({ 
                            type: 'text', 
                            content: text, 
                            timestamp,
                            originalIndex: index 
                        });
                    }
                });
            } else {
                console.log('[DEBUG] WARNING: No chat items found with standard selectors');
            }
            
            console.log(`[DEBUG] Extracted ${results.length} messages`);
            return results;
        });
        
        return messages;
    }

    async extractVideoUrls(messages) {
        console.log('Extracting actual video URLs by clicking on videos...');
        
        let videoMessageIndex = 0;
        
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            
            if (msg.needsUrlExtraction && msg.type === 'video') {
                console.log(`Attempting to extract URL for video message ${i + 1} (video #${videoMessageIndex + 1})...`);
                
                try {
                    // Click on the specific video for this message
                    const clickResult = await this.page.evaluate(({videoIndex, originalMsgIndex}) => {
                        // Find chat container
                        const possibleContainers = [
                            '[class*="ChatMain"]',
                            '[class*="ChatBox"]',
                            '[class*="MessageList"]',
                            '[class*="ChatContent"]'
                        ];
                        
                        let chatContainer = null;
                        for (const selector of possibleContainers) {
                            const container = document.querySelector(selector);
                            if (container) {
                                chatContainer = container;
                                break;
                            }
                        }
                        
                        if (!chatContainer) return null;
                        
                        // Find chat items
                        const messageSelectors = [
                            '[class*="ChatItemWrapper"]',
                            '[class*="MessageItem"]',
                            '[class*="ChatMessage"]'
                        ];
                        
                        let chatItems = [];
                        for (const selector of messageSelectors) {
                            chatItems = chatContainer.querySelectorAll(selector);
                            if (chatItems.length > 0) break;
                        }
                        
                        // Collect video items (only items with 2+ images or actual video elements)
                        const videoItems = [];
                        chatItems.forEach((item, index) => {
                            const videos = item.querySelectorAll('video');
                            const clickableVideos = item.querySelectorAll('[class*="video"], [class*="Video"]');
                            const images = item.querySelectorAll('img');
                            
                            // Only consider items with 2+ images as videos (avatar + thumbnail)
                            if (videos.length > 0 || clickableVideos.length > 0 || images.length >= 2) {
                                videoItems.push(item);
                            }
                        });
                        
                        if (videoIndex >= videoItems.length) return null;
                        
                        const targetItem = videoItems[videoIndex];
                        
                        // Try to click video elements first
                        const videos = targetItem.querySelectorAll('video');
                        if (videos.length > 0) {
                            for (const video of videos) {
                                if (video.offsetParent !== null) {
                                    video.click();
                                    return 'clicked_video';
                                }
                            }
                        }
                        
                        // Try clickable video containers
                        const clickableVideos = targetItem.querySelectorAll('[class*="video"], [class*="Video"]');
                        if (clickableVideos.length > 0) {
                            for (const element of clickableVideos) {
                                if (element.offsetParent !== null) {
                                    element.click();
                                    return 'clicked_container';
                                }
                            }
                        }
                        
                        // Try clicking images (prefer larger images, avoid avatars)
                        const images = targetItem.querySelectorAll('img');
                        if (images.length >= 2) {
                            // For 2-image items, click the second image (likely thumbnail)
                            for (let i = 1; i < images.length; i++) {
                                const img = images[i];
                                const width = img.width || img.naturalWidth || 0;
                                
                                if ((i === 1 || width > 40) && img.offsetParent !== null) {
                                    img.click();
                                    // Also try clicking parent
                                    if (img.parentElement) {
                                        img.parentElement.click();
                                    }
                                    return 'clicked_image';
                                }
                            }
                        }
                        
                        return 'no_safe_element';
                    }, {videoIndex: videoMessageIndex, originalMsgIndex: msg.originalIndex || videoMessageIndex});
                    
                    if (clickResult && clickResult !== 'no_safe_element') {
                        // Wait for potential navigation
                        await this.page.waitForTimeout(2000);
                        
                        // Check if we navigated to a TikTok video page
                        const currentUrl = this.page.url();
                        
                        if (currentUrl.includes('tiktok.com') && currentUrl.includes('/video/')) {
                            // Successfully navigated to a TikTok video page
                            const realUrl = currentUrl.replace('www.tiktok.com', 'www.kktiktok.com');
                            msg.content = realUrl;
                            console.log(`  -> Found real URL: ${realUrl}`);
                            
                            // Navigate back to the chat
                            await this.page.goBack();
                            await this.page.waitForTimeout(2000);
                        } else if (currentUrl.includes('tiktok.com') && currentUrl.includes('/@')) {
                            // Accidentally navigated to a profile page - go back
                            console.log(`  -> Accidentally opened profile page, going back`);
                            await this.page.goBack();
                            await this.page.waitForTimeout(1000);
                        } else {
                            console.log(`  -> No navigation occurred, keeping placeholder`);
                        }
                    } else {
                        console.log(`  -> No safe element found, keeping placeholder to avoid opening profiles`);
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
        
        console.log('Collecting messages and checking for duplicates...');
        
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
            let messages = await this.extractChatMessages();
            console.log(`Found ${messages.length} messages`);
            
            // Try to extract real video URLs
            const messagesWithUrls = await this.extractVideoUrls(messages);
            
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