#!/usr/bin/env node

/**
 * Main runner script for dwag bots
 * This allows running from the root dwag-bot directory
 */

// Check command line arguments to determine which bot to run
const args = process.argv.slice(2);
const platform = args.find(arg => !arg.startsWith('--')) || 'instagram';

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
    default:
        console.log('Starting Instagram bot...\n');
        require('./dwag-insta/simple-dm-reader.js');
        break;
}