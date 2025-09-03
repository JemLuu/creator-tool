const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

const AUTH_FILE = path.join(__dirname, '.tiktok-auth.json');

async function manualLogin() {
    console.log('Starting manual TikTok login process...');
    console.log('This will open a browser window for you to login manually.');
    
    const browser = await chromium.launch({ 
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    console.log('\n=================================');
    console.log('MANUAL LOGIN INSTRUCTIONS:');
    console.log('1. The browser will open TikTok');
    console.log('2. Click "Log in" at the top right');
    console.log('3. Choose your login method');
    console.log('4. Complete login and any captcha');
    console.log('5. Once logged in, press Enter here');
    console.log('=================================\n');
    
    await page.goto('https://www.tiktok.com');
    
    // Wait for user to press enter
    await new Promise((resolve) => {
        process.stdin.once('data', resolve);
    });
    
    // Check if logged in
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    // Save the session
    const state = await context.storageState();
    await fs.writeFile(AUTH_FILE, JSON.stringify(state, null, 2));
    console.log('Session saved to', AUTH_FILE);
    
    // Test the saved session
    console.log('\nTesting saved session...');
    await page.goto('https://www.tiktok.com/messages');
    await page.waitForTimeout(3000);
    
    if (!page.url().includes('/login')) {
        console.log('✅ Session works! You can now run the bot with: npm run tt:dev');
    } else {
        console.log('❌ Session test failed. Please try again.');
    }
    
    await browser.close();
    process.exit(0);
}

console.log('Press Enter to start...');
process.stdin.once('data', () => {
    manualLogin().catch(console.error);
});