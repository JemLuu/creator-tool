const fs = require('fs');

class DebugScraper {
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
        return Date.now() - (60 * 60 * 1000);
    }

    saveLastRunTime() {
        fs.writeFileSync(this.lastRunFile, Date.now().toString());
    }

    async navigateToMessages() {
        console.log('Navigating to TikTok messages...');
        await this.page.goto('https://www.tiktok.com/messages', { waitUntil: 'networkidle' });
        await this.page.waitForTimeout(5000);
    }

    async debugPageStructure() {
        console.log('\n========== DEBUG: ANALYZING PAGE STRUCTURE ==========\n');
        
        const pageData = await this.page.evaluate(() => {
            const data = {
                url: window.location.href,
                title: document.title,
                conversations: [],
                allDivs: [],
                clickableElements: []
            };
            
            // 1. Find all conversation-like elements
            console.log('[DEBUG] Looking for conversation elements...');
            
            // Strategy 1: Find elements with class names containing "Item"
            const itemElements = document.querySelectorAll('[class*="Item"]');
            console.log(`Found ${itemElements.length} elements with "Item" in class`);
            
            itemElements.forEach((el, index) => {
                const text = el.textContent?.trim() || '';
                const className = el.className || '';
                
                // Only include if it looks like a conversation preview
                if (text.length > 10 && text.length < 200 && 
                    (text.includes(':') || text.includes('Message') || className.includes('ItemWrapper'))) {
                    data.conversations.push({
                        index,
                        type: 'item',
                        className: className.substring(0, 100),
                        text: text.substring(0, 150),
                        hasOnClick: !!el.onclick,
                        role: el.getAttribute('role'),
                        tagName: el.tagName
                    });
                }
            });
            
            // Strategy 2: Find all divs with usernames
            const allDivs = document.querySelectorAll('div');
            const usernameDivs = [];
            
            allDivs.forEach((div, index) => {
                const text = div.textContent?.trim() || '';
                
                // Look for divs that might be conversation items
                if ((text.includes('Jonathan Coulter') || text.includes('Jeremy L')) && 
                    text.length < 200 && text.length > 20) {
                    
                    // Check if this is a unique conversation item (not nested)
                    let isUnique = true;
                    let parent = div.parentElement;
                    while (parent && parent !== document.body) {
                        const parentText = parent.textContent?.trim() || '';
                        if (parentText === text) {
                            isUnique = false;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                    
                    if (isUnique) {
                        usernameDivs.push({
                            index,
                            type: 'username_div',
                            className: (div.className || '').substring(0, 100),
                            text: text.substring(0, 150),
                            hasOnClick: !!div.onclick,
                            style: {
                                cursor: window.getComputedStyle(div).cursor,
                                pointerEvents: window.getComputedStyle(div).pointerEvents
                            },
                            parentClass: (div.parentElement?.className || '').substring(0, 100),
                            childCount: div.children.length
                        });
                    }
                }
            });
            
            data.allDivs = usernameDivs;
            
            // Strategy 3: Find all clickable elements
            const clickable = document.querySelectorAll('[onclick], [role="button"], a, button');
            clickable.forEach((el, index) => {
                const text = el.textContent?.trim() || '';
                if (text.length > 10 && text.length < 200) {
                    data.clickableElements.push({
                        index,
                        type: 'clickable',
                        tagName: el.tagName,
                        className: (el.className || '').substring(0, 100),
                        text: text.substring(0, 150),
                        href: el.href || null,
                        role: el.getAttribute('role')
                    });
                }
            });
            
            // Log the body structure for debugging
            console.log('[DEBUG] Page body text preview:', document.body.textContent.substring(0, 500));
            
            return data;
        });
        
        // Print structured output
        console.log('PAGE URL:', pageData.url);
        console.log('PAGE TITLE:', pageData.title);
        
        console.log('\n--- CONVERSATION ITEMS (ItemWrapper elements) ---');
        if (pageData.conversations.length === 0) {
            console.log('No conversation items found with ItemWrapper classes');
        } else {
            pageData.conversations.forEach((conv, i) => {
                console.log(`\n[${i}] ${conv.type.toUpperCase()} - ${conv.tagName}`);
                console.log(`    Class: ${conv.className}`);
                console.log(`    Text: "${conv.text}"`);
                console.log(`    Clickable: ${conv.hasOnClick ? 'YES' : 'NO'}, Role: ${conv.role || 'none'}`);
            });
        }
        
        console.log('\n--- USERNAME DIVS (Potential Conversations) ---');
        if (pageData.allDivs.length === 0) {
            console.log('No divs with usernames found');
        } else {
            pageData.allDivs.forEach((div, i) => {
                console.log(`\n[${i}] ${div.type.toUpperCase()}`);
                console.log(`    Class: ${div.className}`);
                console.log(`    Parent Class: ${div.parentClass}`);
                console.log(`    Text: "${div.text}"`);
                console.log(`    Style: cursor=${div.style.cursor}, pointerEvents=${div.style.pointerEvents}`);
                console.log(`    Children: ${div.childCount}`);
            });
        }
        
        console.log('\n--- CLICKABLE ELEMENTS ---');
        const relevantClickables = pageData.clickableElements.filter(el => 
            el.text.includes('Jonathan') || el.text.includes('Jeremy') || el.text.includes('dwag')
        );
        
        if (relevantClickables.length === 0) {
            console.log('No relevant clickable elements found');
        } else {
            relevantClickables.forEach((el, i) => {
                console.log(`\n[${i}] ${el.tagName} - ${el.role || 'no role'}`);
                console.log(`    Class: ${el.className}`);
                console.log(`    Text: "${el.text}"`);
                if (el.href) console.log(`    HREF: ${el.href}`);
            });
        }
        
        console.log('\n========== END DEBUG OUTPUT ==========\n');
        
        return pageData;
    }

    async collectAllMessages() {
        await this.navigateToMessages();
        const pageData = await this.debugPageStructure();
        
        // For now, just return empty - we're debugging
        return {};
    }
}

module.exports = DebugScraper;