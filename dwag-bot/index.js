#!/usr/bin/env node

/**
 * Main runner script for dwag bots
 * This allows running from the root dwag-bot directory
 */

// Check command line arguments to determine which bot to run
const args = process.argv.slice(2);
const platform = args.find(arg => !arg.startsWith('--'));

// If no platform specified, run both
if (!platform) {
    console.log('Starting both Instagram and TikTok bots...\n');
    
    // Start Instagram bot
    console.log('🔄 Starting Instagram bot...');
    try {
        require('./dwag-insta/simple-dm-reader.js');
        console.log('✅ Instagram bot started');
    } catch (err) {
        console.error('❌ Error starting Instagram bot:', err);
    }
    
    // Start TikTok bot
    console.log('🔄 Starting TikTok bot...');
    const tiktokMain = require('./dwag-tt/tiktok-dm-reader.js');
    tiktokMain().catch(err => {
        console.error('❌ Error running TikTok bot:', err);
    });
    
} else {
    // Run specific platform
    switch(platform.toLowerCase()) {
        case 'tiktok':
        case 'tt':
            console.log('Starting TikTok bot...\n');
            const tiktokMain = require('./dwag-tt/tiktok-dm-reader.js');
            tiktokMain().catch(err => {
                console.error('Error running TikTok bot:', err);
                process.exit(1);
            });
            break;
        
        case 'instagram':
        case 'insta':
        case 'ig':
            console.log('Starting Instagram bot...\n');
            require('./dwag-insta/simple-dm-reader.js');
            break;
            
        default:
            console.error(`Unknown platform: ${platform}`);
            console.log('Available platforms: instagram, tiktok');
            process.exit(1);
    }
}