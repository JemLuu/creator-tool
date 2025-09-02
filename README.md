# dwag bot by Jeremy

:D

## Daily Instagram DM Checker Setup

1. Install dependencies: `cd dwag-bot && npm install`
2. Set up `.env` with Instagram credentials and Discord webhook
3. Copy `com.dwagbot.dmcheck.plist` to `~/Library/LaunchAgents/`
4. Edit the plist file and replace `REPLACE_WITH_FULL_PATH_TO_REPO` with full path to this repo
5. Load: `launchctl load ~/Library/LaunchAgents/com.dwagbot.dmcheck.plist`
6. Runs daily at 11:30 PM, logs to `dwag-bot/dm-check.log`

## Manual Testing
```bash
cd dwag-bot
npm start        # Run once
npm run debug    # Monitor every second
```