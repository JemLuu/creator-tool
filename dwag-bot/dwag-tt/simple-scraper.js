const fs = require('fs');

class SimpleScraper {
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

    async navigateToConversation() {
        console.log('Navigating to messages...');
        await this.page.goto('https://www.tiktok.com/messages', { waitUntil: 'networkidle' });
        await this.page.waitForTimeout(3000);
        
        // Click into the conversation containing "dwag add"
        console.log('Looking for conversation with dwag commands...');
        const clicked = await this.page.evaluate(() => {
            console.log('[DEBUG] Looking for conversations...');
            
            // Find all conversation wrappers
            const conversationWrappers = document.querySelectorAll('[class*="DivItemWrapper"]');
            console.log(`[DEBUG] Found ${conversationWrappers.length} conversation wrappers`);
            
            // Look for the one with "rock climbing" in it (your specific conversation)
            let targetConversation = null;
            conversationWrappers.forEach((wrapper, index) => {
                const text = wrapper.textContent || '';
                console.log(`[DEBUG] Conversation ${index}: "${text.substring(0, 100)}..."`);
                
                // Look for your specific conversation with "rock climbing"
                if (text.includes('rock climbing') || 
                    (text.includes('Jeremy L') && text.includes('dwag add skit'))) {
                    console.log(`[DEBUG] Found target conversation with rock climbing: ${index}`);
                    targetConversation = wrapper;
                }
            });
            
            if (targetConversation) {
                console.log('[DEBUG] Clicking target conversation with rock climbing');
                targetConversation.click();
                return 'rock_climbing';
            }
            
            // Fallback - click the first conversation with dwag add
            conversationWrappers.forEach((wrapper, index) => {
                const text = wrapper.textContent || '';
                if (text.includes('dwag add') && !targetConversation) {
                    console.log(`[DEBUG] Clicking fallback conversation ${index}: "${text.substring(0, 50)}..."`);
                    targetConversation = wrapper;
                    wrapper.click();
                    return 'fallback';
                }
            });
            
            if (targetConversation) {
                return 'fallback';
            }
            
            console.log('[DEBUG] Could not find any conversation to click');
            return false;
        });
        
        if (clicked) {
            console.log('Clicked into conversation, waiting for full chat to load...');
            await this.page.waitForTimeout(3000);
        }
    }

    async extractMessages() {
        console.log('Extracting messages from chat...');
        
        const messageData = await this.page.evaluate((lastRunTime) => {
            const results = [];
            console.log('[DEBUG] Looking for chat messages...');
            
            // Find all chat item wrappers (these are the individual message containers)
            const chatItems = document.querySelectorAll('.css-ca9jkb-DivChatItemWrapper');
            console.log(`[DEBUG] Found ${chatItems.length} chat item wrappers`);
            
            chatItems.forEach((item, index) => {
                const text = item.textContent?.trim() || '';
                console.log(`[DEBUG] Chat item ${index}: "${text}"`);
                
                // Check if this is a text message
                if (text && text.length > 0 && text.length < 200) {
                    // Check for dwag commands
                    if (text.includes('dwag add')) {
                        console.log(`[DEBUG] Found dwag command: "${text}"`);
                        results.push({
                            type: 'command',
                            content: text,
                            timestamp: Date.now(),
                            elementIndex: index
                        });
                    } 
                    // Check for simple text messages like "hi"
                    else if (text === 'hi' || text.length < 50) {
                        console.log(`[DEBUG] Found text message: "${text}"`);
                        results.push({
                            type: 'text', 
                            content: text,
                            timestamp: Date.now(),
                            elementIndex: index
                        });
                    }
                }
                
                // Check for video/media elements within this chat item
                const videos = item.querySelectorAll('video');
                const allLinks = item.querySelectorAll('a');
                const images = item.querySelectorAll('img');
                
                if (videos.length > 0 || allLinks.length > 0 || images.length > 0) {
                    console.log(`[DEBUG] Chat item ${index} has media: ${videos.length} videos, ${allLinks.length} total links, ${images.length} images`);
                    
                    // Try to get actual TikTok URL
                    let videoUrl = null;
                    let debugInfo = [];
                    
                    // Check ALL links, not just ones with tiktok in href
                    allLinks.forEach((link, linkIndex) => {
                        const href = link.href || '';
                        const onclick = link.getAttribute('onclick') || '';
                        const dataUrl = link.getAttribute('data-url') || '';
                        debugInfo.push(`Link ${linkIndex}: href="${href}" onclick="${onclick}" data-url="${dataUrl}"`);
                        
                        // Check various attributes for TikTok URLs - prioritize video URLs over profile URLs
                        [href, onclick, dataUrl].forEach(attr => {
                            if (attr && attr.includes('tiktok.com')) {
                                // Prefer actual video URLs over profile URLs
                                if (attr.includes('/video/')) {
                                    videoUrl = attr.replace('www.tiktok.com', 'www.kktiktok.com');
                                } else if (attr.includes('/@') && !videoUrl) {
                                    // Only use profile URL if we don't have a video URL yet
                                    videoUrl = attr.replace('www.tiktok.com', 'www.kktiktok.com');
                                }
                            }
                        });
                    });
                    
                    // Check video elements more thoroughly
                    videos.forEach((video, videoIndex) => {
                        const src = video.src || '';
                        const poster = video.poster || '';
                        const dataSrc = video.getAttribute('data-src') || '';
                        debugInfo.push(`Video ${videoIndex}: src="${src}" poster="${poster}" data-src="${dataSrc}"`);
                        
                        // Look at parent elements for TikTok URLs
                        let parent = video.parentElement;
                        let parentLevel = 0;
                        while (parent && parentLevel < 3) {
                            const parentLinks = parent.querySelectorAll('a');
                            parentLinks.forEach(pLink => {
                                const pHref = pLink.href || '';
                                if (pHref.includes('tiktok.com') && (pHref.includes('/@') || pHref.includes('/video/'))) {
                                    videoUrl = pHref.replace('www.tiktok.com', 'www.kktiktok.com');
                                }
                            });
                            parent = parent.parentElement;
                            parentLevel++;
                        }
                    });
                    
                    // Check images
                    images.forEach((img, imgIndex) => {
                        const src = img.src || '';
                        const dataSrc = img.getAttribute('data-src') || '';
                        debugInfo.push(`Image ${imgIndex}: src="${src}" data-src="${dataSrc}"`);
                        
                        // Sometimes the image src contains clues about the video URL
                        [src, dataSrc].forEach(attr => {
                            if (attr && attr.includes('tiktok') && (attr.includes('/@') || attr.includes('/video/'))) {
                                videoUrl = attr.replace('www.tiktok.com', 'www.kktiktok.com');
                            }
                        });
                    });
                    
                    console.log(`[DEBUG] Media debug info for item ${index}:`, debugInfo);
                    
                    if (!videoUrl) {
                        console.log(`[DEBUG] No direct TikTok URL found, checking page source and DOM attributes`);
                        
                        // Last resort - check the entire chat item HTML for any TikTok URLs
                        const itemHTML = item.outerHTML || '';
                        const urlMatch = itemHTML.match(/(https?:\/\/[^\s"']+tiktok\.com[^\s"']*)/);
                        if (urlMatch) {
                            videoUrl = urlMatch[1].replace('www.tiktok.com', 'www.kktiktok.com');
                            console.log(`[DEBUG] Found URL in HTML: ${videoUrl}`);
                        } else {
                            videoUrl = 'https://www.kktiktok.com/video/placeholder';
                        }
                    }
                    
                    results.push({
                        type: 'video',
                        content: videoUrl,
                        timestamp: Date.now(),
                        elementIndex: index
                    });
                }
            });
            
            console.log(`[DEBUG] Total results found: ${results.length}`);
            return results;
        }, this.getLastRunTime());
        
        console.log(`Found ${messageData.length} message elements:`);
        messageData.forEach((msg, i) => {
            console.log(`  ${i + 1}. [${msg.type.toUpperCase()}] ${msg.content}`);
        });
        
        return messageData;
    }

    async collectAllMessages() {
        const messagesByConversation = {};
        
        await this.navigateToConversation();
        const messageData = await this.extractMessages();
        
        if (messageData.length > 0) {
            // Format for our system
            const formattedMessages = messageData.map(msg => ({
                sender: 'Jeremy L',
                content: msg.content,
                time: new Date(msg.timestamp).toLocaleString(),
                timestamp: new Date(msg.timestamp).toISOString(),
                itemType: msg.type === 'video' ? 'video_share' : 'text',
                rawMessage: msg
            }));
            
            messagesByConversation['Jeremy L'] = formattedMessages;
        }
        
        return messagesByConversation;
    }
}

module.exports = SimpleScraper;