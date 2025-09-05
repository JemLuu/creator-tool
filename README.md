# Creator Tool

Social media DM automation bot for Instagram and TikTok with Discord integration.

## Description

This tool automatically monitors direct messages from Instagram and TikTok accounts and forwards them to a Discord channel via webhooks. It supports both manual execution and scheduled automation through macOS launchd.

## Features

- Instagram DM monitoring
- TikTok DM monitoring  
- Discord webhook integration
- Scheduled automation (macOS)
- Debug mode for testing

## Requirements

- Node.js v18.0 or higher
- npm
- macOS (for scheduled automation)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/creator-tool.git
cd creator-tool
```

2. Install dependencies:
```bash
cd dwag-bot
npm install
```

3. Configure environment variables:

Create a `.env` file in the `dwag-bot` directory with the following:
```
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password
DISCORD_WEBHOOK_URL=your_discord_webhook_url
TIKTOK_SESSION_ID=your_tiktok_session_id
```

## Usage

### Manual Execution

Run Instagram DM check:
```bash
npm start
```

Run TikTok DM check:
```bash
npm run tiktok
```

### Debug Mode

Run with frequent polling for testing:
```bash
npm run debug
```

### Automated Scheduling (macOS)

1. Copy the launchd configuration file:
```bash
cp com.dwagbot.dmcheck.plist ~/Library/LaunchAgents/
```

2. Edit `~/Library/LaunchAgents/com.dwagbot.dmcheck.plist` and replace `REPLACE_WITH_FULL_PATH_TO_REPO` with the absolute path to your repository.

3. Load the launchd agent:
```bash
launchctl load ~/Library/LaunchAgents/com.dwagbot.dmcheck.plist
```

4. To unload the agent:
```bash
launchctl unload ~/Library/LaunchAgents/com.dwagbot.dmcheck.plist
```

The bot will run automatically at 11:30 PM daily when loaded.

## Available Scripts

- `npm start` - Run Instagram DM check
- `npm run instagram` - Run Instagram DM check
- `npm run instagram:dev` - Run Instagram in debug mode
- `npm run tiktok` - Run TikTok DM check
- `npm run tt` - Run TikTok DM check (alias)
- `npm run tt:dev` - Run TikTok in debug mode
- `npm run debug` - Run in debug mode
- `npm run dev` - Run in debug mode (alias)

## Logs

Application logs are written to `dwag-bot/dm-check.log`

## Project Structure

```
creator-tool/
├── README.md
├── com.dwagbot.dmcheck.plist
└── dwag-bot/
    ├── index.js
    ├── package.json
    ├── package-lock.json
    └── .env
```

## Troubleshooting

- Ensure all environment variables are correctly set in `.env`
- Check `dwag-bot/dm-check.log` for error messages
- Verify Discord webhook URL is valid and active
- For launchd issues, check status with: `launchctl list | grep dwag`

## License

MIT

## Author

Jeremy Luu
