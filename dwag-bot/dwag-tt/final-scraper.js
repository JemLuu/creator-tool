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
            
            // COMPREHENSIVE ELEMENT LOGGING
            console.log('[DEBUG] === COMPREHENSIVE CHAT ELEMENT ANALYSIS ===');
            
            // Find all possible chat containers
            const possibleContainers = [
                '[class*="ChatMain"]',
                '[class*="ChatBox"]',
                '[class*="MessageList"]',
                '[class*="ChatContent"]',
                '[class*="MessageContainer"]',
                '[data-testid*="chat"]',
                '[data-testid*="message"]'
            ];
            
            let chatContainer = null;
            for (const selector of possibleContainers) {
                const container = document.querySelector(selector);
                if (container) {
                    console.log(`[DEBUG] Found container with selector: ${selector}`);
                    chatContainer = container;
                    break;
                }
            }
            
            // Log all elements with class names containing chat/message
            const allChatRelated = document.querySelectorAll('[class*="chat" i], [class*="message" i], [class*="msg" i]');
            console.log(`[DEBUG] Found ${allChatRelated.length} elements with chat/message/msg in class names`);
            
            // Find all possible message item selectors
            const messageSelectors = [
                '[class*="ChatItemWrapper"]',
                '[class*="MessageItem"]',
                '[class*="ChatMessage"]',
                '[class*="MessageWrapper"]',
                '[class*="ChatItem"]:not([class*="Wrapper"])',
                '[data-testid*="message"]',
                '[role="listitem"]'
            ];
            
            let allChatItems = [];
            for (const selector of messageSelectors) {
                const items = document.querySelectorAll(selector);
                if (items.length > 0) {
                    console.log(`[DEBUG] Found ${items.length} items with selector: ${selector}`);
                    allChatItems = items;
                    break;
                }
            }
            
            // If no specific chat items found, look for generic divs in the chat container
            if (allChatItems.length === 0 && chatContainer) {
                const divs = chatContainer.querySelectorAll('div');
                console.log(`[DEBUG] Fallback: checking ${divs.length} divs in chat container`);
                
                // Filter divs that look like messages
                allChatItems = Array.from(divs).filter(div => {
                    const text = div.textContent || '';
                    const hasTimestamp = /\d{1,2}:\d{2}/.test(text);
                    const hasMedia = div.querySelector('video, img[src*="tiktok"], img[src*="musically"]');
                    const hasCommand = text.includes('dwag');
                    const reasonableLength = text.length > 0 && text.length < 500;
                    
                    return (hasTimestamp || hasMedia || hasCommand) && reasonableLength;
                });
                
                console.log(`[DEBUG] Found ${allChatItems.length} potential message divs after filtering`);
            }
            
            console.log(`[DEBUG] === PROCESSING ${allChatItems.length} CHAT ITEMS ===`);
            
            // Log detailed info about each chat item for debugging
            allChatItems.forEach((item, index) => {
                const text = item.textContent?.trim() || '';
                const classes = item.className || '';
                const hasVideo = item.querySelector('video') !== null;
                const imgCount = item.querySelectorAll('img').length;
                const hasTikTokImg = item.querySelector('img[src*="tiktok"]') !== null;
                const timeMatch = text.match(/(\d{1,2}:\d{2})/);
                
                // Look for time in different places
                let timeFound = null;
                
                // Check for time element
                const timeElem = item.querySelector('[class*="time" i], [class*="Time" i], time, [datetime]');
                if (timeElem) {
                    timeFound = timeElem.textContent || timeElem.getAttribute('datetime') || timeElem.getAttribute('title');
                }
                
                // Check for time in aria-label
                const elemWithAriaLabel = item.querySelector('[aria-label]');
                if (!timeFound && elemWithAriaLabel) {
                    const ariaLabel = elemWithAriaLabel.getAttribute('aria-label');
                    if (ariaLabel && /\d{1,2}:\d{2}/.test(ariaLabel)) {
                        timeFound = ariaLabel.match(/\d{1,2}:\d{2}/)[0];
                    }
                }
                
                // Check parent elements for time
                if (!timeFound) {
                    let parent = item.parentElement;
                    let level = 0;
                    while (parent && level < 2 && !timeFound) {
                        const parentTimeElem = parent.querySelector('[class*="time" i], [class*="Time" i]');
                        if (parentTimeElem) {
                            timeFound = parentTimeElem.textContent;
                        }
                        parent = parent.parentElement;
                        level++;
                    }
                }
                
                console.log(`[DEBUG] ITEM ${index}:`);
                console.log(`[DEBUG]   - Classes: ${classes.substring(0, 100)}`);
                console.log(`[DEBUG]   - Text: "${text.substring(0, 100)}..."`);
                console.log(`[DEBUG]   - Has video: ${hasVideo}`);
                console.log(`[DEBUG]   - Image count: ${imgCount}`);
                console.log(`[DEBUG]   - Has TikTok img: ${hasTikTokImg}`);
                console.log(`[DEBUG]   - Time in text: ${timeMatch ? timeMatch[1] : 'none'}`);
                console.log(`[DEBUG]   - Time found elsewhere: ${timeFound || 'none'}`);
                console.log(`[DEBUG]   - Contains 'dwag': ${text.includes('dwag')}`);
                console.log(`[DEBUG]   ---`);
            });
            
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
            
            // Process all found chat items
            console.log('[DEBUG] === EXTRACTING MESSAGES FROM ITEMS ===');
            
            if (allChatItems.length > 0) {
                allChatItems.forEach((item, index) => {
                    const text = item.textContent?.trim() || '';
                    
                    // Skip empty messages
                    if (!text) {
                        return;
                    }
                    
                    // Create a unique key for deduplication that includes index for same-text messages
                    const uniqueKey = `${text}_${index}`;
                    if (seen.has(uniqueKey)) {
                        return;
                    }
                    seen.add(uniqueKey);
                    
                    console.log(`[DEBUG] Processing message ${index}: "${text.substring(0, 100)}"`);
                    
                    // Try to extract timestamp from the message
                    let timestamp = null;
                    let timeStr = null;
                    
                    // Method 1: Look for time element within the item
                    const timeElem = item.querySelector('[class*="time" i], [class*="Time" i], time, [datetime]');
                    if (timeElem) {
                        timeStr = timeElem.textContent || timeElem.getAttribute('datetime') || timeElem.getAttribute('title');
                    }
                    
                    // Method 2: Check aria-labels
                    if (!timeStr) {
                        const elemWithAriaLabel = item.querySelector('[aria-label]');
                        if (elemWithAriaLabel) {
                            const ariaLabel = elemWithAriaLabel.getAttribute('aria-label');
                            const timeMatch = ariaLabel?.match(/(\d{1,2}:\d{2})/);
                            if (timeMatch) {
                                timeStr = timeMatch[1];
                            }
                        }
                    }
                    
                    // Method 3: Look in parent elements
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
                    
                    // Method 4: Fallback to searching text for time patterns
                    if (!timeStr) {
                        const timeMatches = text.match(/(\d{1,2}:\d{2})/g);
                        if (timeMatches && timeMatches.length > 0) {
                            // Use the last time match (most likely to be the message time)
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
                            console.log(`[DEBUG] Extracted timestamp: ${timeStr} -> ${timestamp}`);
                        }
                    }
                    
                    // Check what elements are in this chat item
                    const hasVideo = item.querySelector('video') !== null;
                    const imageCount = item.querySelectorAll('img').length;
                    const hasTikTokImg = item.querySelector('img[src*="tiktok"]') !== null;
                    const hasMusicallyImg = item.querySelector('img[src*="musically"]') !== null;
                    
                    // Analyze images more carefully
                    const images = item.querySelectorAll('img');
                    let hasLargeImage = false;
                    let hasMultipleImages = imageCount >= 2;
                    
                    images.forEach(img => {
                        if ((img.width > 50 || img.height > 50) && !img.src?.includes('-avt-')) {
                            hasLargeImage = true;
                        }
                    });
                    
                    // Parse different message types
                    if (text.match(/Message request accepted|You can start chatting/)) {
                        // System message, skip
                        console.log('[DEBUG] Skipping system message');
                    } else if (text.includes('dwag add')) {
                        // Extract just the dwag command, remove any usernames or timestamps
                        let command = text;
                        
                        // Remove timestamps from the command
                        command = command.replace(/\d{1,2}:\d{2}/g, '').trim();
                        
                        // Find the dwag add command within the text
                        const dwagMatch = command.match(/dwag\s+add\s+\w+.*$/i);
                        if (dwagMatch) {
                            console.log(`[DEBUG] Found command: ${dwagMatch[0]}`);
                            results.push({ 
                                type: 'command', 
                                content: dwagMatch[0], 
                                timestamp,
                                originalIndex: index 
                            });
                        }
                    } else if (hasVideo || hasMusicallyImg || 
                              (hasMultipleImages && !text.includes('dwag'))) {
                        // Contains media - this is likely an embedded video
                        // IMPORTANT: Only items with 2+ images are video shares (avatar + thumbnail)
                        // Single image items are just user messages with their avatar
                        console.log(`[DEBUG] Found media element in chat item (treating as video) - images: ${imageCount}, hasMultiple: ${hasMultipleImages}`);
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
                    } else if (text.length > 0 && text.length < 200 && 
                              !text.includes('Messages') && !text.includes('/2025')) {
                        // Generic text message that's not too long and not a UI element
                        console.log(`[DEBUG] Treating as text message: "${text.substring(0, 50)}"`);
                        results.push({ 
                            type: 'text', 
                            content: text, 
                            timestamp,
                            originalIndex: index 
                        });
                    } else {
                        console.log(`[DEBUG] Skipping item: "${text.substring(0, 50)}" (too long or system UI element)`);
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
        console.log(`\n[DEBUG] Messages to process for video URLs:`);
        messages.forEach((msg, i) => {
            if (msg.needsUrlExtraction) {
                console.log(`  Message ${i}: type=${msg.type}, text="${msg.originalText}", imageCount=${msg.imageCount}, originalIndex=${msg.originalIndex}`);
            }
        });
        
        // Get comprehensive info about all chat items with videos
        const chatItemsWithVideos = await this.page.evaluate(() => {
            // Find all possible chat containers and selectors
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
            
            if (!chatContainer) {
                // Try to find container with chat items
                const allContainers = document.querySelectorAll('div');
                for (const container of allContainers) {
                    if (container.querySelector('[class*="ChatItem"]')) {
                        chatContainer = container;
                        break;
                    }
                }
            }
            
            if (!chatContainer) return [];
            
            // Find all chat items using multiple possible selectors
            const messageSelectors = [
                '[class*="ChatItemWrapper"]',
                '[class*="MessageItem"]',
                '[class*="ChatMessage"]',
                '[class*="MessageWrapper"]',
                '[class*="ChatItem"]:not([class*="Wrapper"])'
            ];
            
            let chatItems = [];
            for (const selector of messageSelectors) {
                chatItems = chatContainer.querySelectorAll(selector);
                if (chatItems.length > 0) break;
            }
            
            const videoInfo = [];
            
            chatItems.forEach((item, index) => {
                const text = item.textContent?.trim() || '';
                const videos = item.querySelectorAll('video');
                const clickableVideos = item.querySelectorAll('[class*="video"], [class*="Video"]');
                const images = item.querySelectorAll('img');
                
                // Check if this chat item has video content
                if (videos.length > 0 || clickableVideos.length > 0 || 
                    (images.length > 0 && text.length < 100)) {
                    
                    videoInfo.push({
                        index,
                        text: text.substring(0, 100),
                        hasVideo: videos.length > 0,
                        hasClickableVideo: clickableVideos.length > 0,
                        hasImages: images.length > 0,
                        imageCount: images.length
                    });
                }
            });
            
            console.log(`[DEBUG] Found ${videoInfo.length} chat items with potential videos`);
            videoInfo.forEach((info, idx) => {
                console.log(`[DEBUG] Video item ${idx}: text="${info.text}", images=${info.imageCount}`);
            });
            return videoInfo;
        });
        
        console.log(`\n[DEBUG] Chat items with videos found: ${chatItemsWithVideos.length}`);
        
        let videoMessageIndex = 0;
        
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            
            if (msg.needsUrlExtraction && msg.type === 'video') {
                console.log(`\n[DEBUG] === Processing message ${i} ===`);
                console.log(`  - Original text: "${msg.originalText}"`);
                console.log(`  - Image count: ${msg.imageCount}`);
                console.log(`  - Original DOM index: ${msg.originalIndex}`);
                console.log(`  - Video message index: ${videoMessageIndex}`);
                console.log(`  - Attempting to extract URL for video message ${i + 1} (video #${videoMessageIndex + 1})...`);
                
                try {
                    // Click on the specific video for this message - pass as single object
                    const clickResult = await this.page.evaluate(({videoIndex, originalMsgIndex}) => {
                        // Find all possible chat containers
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
                        
                        if (!chatContainer) return null;
                        
                        // Find all chat items using multiple selectors
                        const messageSelectors = [
                            '[class*="ChatItemWrapper"]',
                            '[class*="MessageItem"]',
                            '[class*="ChatMessage"]',
                            '[class*="MessageWrapper"]',
                            '[class*="ChatItem"]:not([class*="Wrapper"])'
                        ];
                        
                        let chatItems = [];
                        for (const selector of messageSelectors) {
                            chatItems = chatContainer.querySelectorAll(selector);
                            if (chatItems.length > 0) break;
                        }
                        
                        const videoItems = [];
                        
                        // Collect all chat items that contain videos
                        // IMPORTANT: Only items with 2+ images are actual video shares
                        // Items with 1 image are typically user messages with just avatar
                        chatItems.forEach((item, index) => {
                            const text = item.textContent?.trim() || '';
                            const videos = item.querySelectorAll('video');
                            const clickableVideos = item.querySelectorAll('[class*="video"], [class*="Video"]');
                            const images = item.querySelectorAll('img');
                            
                            console.log(`[DEBUG] Evaluating item ${index}: text="${text.substring(0, 30)}...", images=${images.length}`);
                            
                            // Only consider items with 2+ images as videos (avatar + thumbnail)
                            // OR items with actual video elements
                            if (videos.length > 0 || clickableVideos.length > 0 || images.length >= 2) {
                                console.log(`[DEBUG] Adding item ${index} to videoItems (has ${images.length} images)`);
                                videoItems.push(item);
                            } else {
                                console.log(`[DEBUG] Skipping item ${index} (only ${images.length} image, likely just avatar)`);
                            }
                        });
                        
                        console.log(`[DEBUG] Found ${videoItems.length} video items, trying to click item ${videoIndex} (original msg index: ${originalMsgIndex})`);
                        
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
                            
                            // Try clicking images that are NOT profile pictures
                            const images = targetItem.querySelectorAll('img');
                            if (images.length > 0) {
                                console.log(`[DEBUG] Checking ${images.length} images in item ${videoIndex}`);
                                console.log(`[DEBUG] Item text content: "${targetItem.textContent?.substring(0, 50)}..."`);
                                
                                // If we have exactly 2 images, this is likely a video share
                                if (images.length === 2) {
                                    console.log(`[DEBUG] Item has 2 images - likely a video share`);
                                    
                                    // Try to find and click the larger image (thumbnail)
                                    for (let i = 0; i < images.length; i++) {
                                        const img = images[i];
                                        const width = img.width || img.naturalWidth || 0;
                                        const height = img.height || img.naturalHeight || 0;
                                        const src = img.src || '';
                                        
                                        console.log(`[DEBUG] Image ${i}: size=${width}x${height}, src="${src.substring(0, 50)}..."`);
                                        
                                        // The second image or larger image is usually the thumbnail
                                        if ((i === 1 || width > 40) && img.offsetParent !== null) {
                                            console.log(`[DEBUG] Clicking image ${i} (likely thumbnail)`);
                                            
                                            // Try clicking the image itself
                                            img.click();
                                            
                                            // Also try clicking parent elements
                                            let parent = img.parentElement;
                                            if (parent) {
                                                console.log(`[DEBUG] Also clicking parent element`);
                                                parent.click();
                                            }
                                            
                                            return 'clicked_image';
                                        }
                                    }
                                } else if (images.length === 1) {
                                    console.log(`[DEBUG] Item has only 1 image - likely just an avatar, not a video`);
                                } else {
                                    console.log(`[DEBUG] Item has ${images.length} images - unusual case`);
                                    
                                    // Sort images by size (larger images are more likely to be video thumbnails)
                                    const imageData = Array.from(images).map((img, i) => ({
                                        img: img,
                                        index: i,
                                        width: img.width || img.naturalWidth || 0,
                                        height: img.height || img.naturalHeight || 0,
                                        isInProfileLink: img.closest('a[href*="@"]') !== null,
                                        isAvatarImage: img.src?.includes('-avt-') || img.src?.includes('avatar') || img.src?.includes('profile'),
                                        src: img.src
                                    })).sort((a, b) => (b.width * b.height) - (a.width * a.height));
                                    
                                    for (const imgData of imageData) {
                                        const {img, index, isInProfileLink, isAvatarImage, width, height} = imgData;
                                        
                                        console.log(`[DEBUG] Image ${index}: size=${width}x${height}, profileLink=${isInProfileLink}, avatar=${isAvatarImage}`);
                                        
                                        // Skip small images (likely avatars)
                                        if (width < 40 && height < 40) {
                                            console.log(`[DEBUG] Skipping small image ${index} (likely avatar)`);
                                            continue;
                                        }
                                        
                                        // Try clicking if it's not in a profile link and not an avatar
                                        if (!isInProfileLink && !isAvatarImage && img.offsetParent !== null) {
                                            console.log(`[DEBUG] Clicking large image ${index} (likely video thumbnail)`);
                                            img.click();
                                            return 'clicked_image';
                                        }
                                    }
                                }
                            }
                            
                            // NO fallback to clicking entire items - better to keep placeholder than open profile tabs
                            console.log(`[DEBUG] Could not find safe clickable element in item ${videoIndex}, keeping placeholder`);
                            return 'no_safe_element';
                        } else {
                            console.log(`[DEBUG] Video index ${videoIndex} is out of range (only ${videoItems.length} items)`);
                        }
                        
                        return null;
                    }, {videoIndex: videoMessageIndex, originalMsgIndex: msg.originalIndex || videoMessageIndex});
                    
                    if (clickResult && clickResult !== 'no_safe_element') {
                        // Wait for potential navigation
                        await this.page.waitForTimeout(2000);
                        
                        // Check if we navigated to a TikTok video page
                        const currentUrl = this.page.url();
                        console.log(`Current URL after clicking: ${currentUrl}`);
                        
                        if (currentUrl.includes('tiktok.com') && currentUrl.includes('/video/')) {
                            // We successfully navigated to a TikTok video page!
                            const realUrl = currentUrl.replace('www.tiktok.com', 'www.kktiktok.com');
                            msg.content = realUrl;
                            console.log(`  -> Found real URL: ${realUrl}`);
                            
                            // Navigate back to the chat
                            await this.page.goBack();
                            await this.page.waitForTimeout(2000);
                        } else if (currentUrl.includes('tiktok.com') && currentUrl.includes('/@')) {
                            // We accidentally navigated to a profile page - go back immediately
                            console.log(`  -> Accidentally opened profile page, going back`);
                            await this.page.goBack();
                            await this.page.waitForTimeout(1000);
                        } else {
                            console.log(`  -> No navigation occurred, keeping placeholder`);
                        }
                    } else if (clickResult === 'no_safe_element') {
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