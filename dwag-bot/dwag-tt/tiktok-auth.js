const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

const AUTH_FILE = path.join(__dirname, '.tiktok-auth.json');

class TikTokAuth {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
    }

    async initialize(headless = true) {
        console.log('[DEBUG TikTokAuth] initialize() called with headless:', headless);
        console.log('[DEBUG TikTokAuth] Launching Chromium browser...');
        
        try {
            this.browser = await chromium.launch({ 
                headless,
                args: ['--disable-blink-features=AutomationControlled']
            });
            console.log('[DEBUG TikTokAuth] Browser launched successfully');
        } catch (error) {
            console.error('[DEBUG TikTokAuth] Failed to launch browser:', error);
            throw error;
        }
        
        // Check for saved auth
        console.log('[DEBUG TikTokAuth] Checking for saved auth state...');
        const authState = await this.loadAuthState();
        if (authState) {
            console.log('[DEBUG TikTokAuth] Found saved auth state, loading...');
            this.context = await this.browser.newContext({ storageState: authState });
        } else {
            console.log('[DEBUG TikTokAuth] No saved auth state, creating new context...');
            this.context = await this.browser.newContext();
        }
        console.log('[DEBUG TikTokAuth] Browser context created');
        
        console.log('[DEBUG TikTokAuth] Creating new page...');
        this.page = await this.context.newPage();
        console.log('[DEBUG TikTokAuth] Page created');
        
        // Set user agent to avoid detection
        console.log('[DEBUG TikTokAuth] Setting user agent...');
        await this.page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        console.log('[DEBUG TikTokAuth] Initialization complete');
    }

    async login(username, password) {
        console.log('Navigating to TikTok...');
        await this.page.goto('https://www.tiktok.com/login/phone-or-email/email');
        
        // Wait for login form
        await this.page.waitForSelector('input[name="username"]', { timeout: 10000 });
        
        console.log('Entering credentials...');
        await this.page.fill('input[name="username"]', username);
        await this.page.fill('input[type="password"]', password);
        
        // Click login button
        await this.page.click('button[type="submit"]');
        
        // Wait for navigation or captcha
        console.log('Waiting for login result or captcha...');
        try {
            // Wait for either successful login or captcha (don't timeout on captcha check)
            await Promise.race([
                this.page.waitForURL('https://www.tiktok.com/foryou', { timeout: 30000 }),
                this.page.waitForSelector('.captcha-container', { timeout: 2000 }).catch(() => null)
            ]);
            
            // Check if we're logged in
            if (this.page.url().includes('/foryou')) {
                console.log('Login successful!');
                await this.saveAuthState();
                return true;
            } else {
                console.log('Waiting for captcha or login to complete...');
                console.log('You have 2 minutes to complete the captcha/login process...');
                
                // Give user more time to complete captcha
                try {
                    await this.page.waitForURL('https://www.tiktok.com/**', { 
                        timeout: 120000,
                        waitUntil: 'networkidle' 
                    });
                    
                    // Check if we successfully logged in
                    if (this.page.url().includes('/foryou') || this.page.url().includes('/following')) {
                        console.log('Login successful!');
                        await this.saveAuthState();
                        return true;
                    }
                } catch (timeoutError) {
                    console.log('Login timeout - please try again');
                    return false;
                }
            }
        } catch (error) {
            console.error('Login failed:', error.message);
            return false;
        }
    }

    async checkAuth() {
        console.log('[DEBUG TikTokAuth] Checking authentication...');
        try {
            // First check if we have a saved session
            const authState = await this.loadAuthState();
            if (!authState) {
                console.log('[DEBUG TikTokAuth] No saved session found');
                return false;
            }
            
            console.log('[DEBUG TikTokAuth] Saved session found, testing...');
            
            // Go to a simple page first to test auth
            await this.page.goto('https://www.tiktok.com/foryou', { 
                waitUntil: 'networkidle',
                timeout: 15000 
            });
            
            const currentUrl = this.page.url();
            console.log('[DEBUG TikTokAuth] Current URL after navigation:', currentUrl);
            
            // Check if we're redirected to login
            if (currentUrl.includes('/login')) {
                console.log('[DEBUG TikTokAuth] Redirected to login - session expired');
                return false;
            }
            
            // Additional check: try to access messages page
            console.log('[DEBUG TikTokAuth] Testing messages access...');
            await this.page.goto('https://www.tiktok.com/messages', { 
                waitUntil: 'networkidle',
                timeout: 10000 
            });
            
            if (this.page.url().includes('/login')) {
                console.log('[DEBUG TikTokAuth] Messages redirected to login - not authenticated');
                return false;
            }
            
            console.log('[DEBUG TikTokAuth] Authentication successful!');
            return true;
            
        } catch (error) {
            console.log('[DEBUG TikTokAuth] Auth check error:', error.message);
            return false;
        }
    }

    async saveAuthState() {
        const state = await this.context.storageState();
        await fs.writeFile(AUTH_FILE, JSON.stringify(state, null, 2));
        console.log('Auth state saved');
    }

    async loadAuthState() {
        try {
            const data = await fs.readFile(AUTH_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = TikTokAuth;