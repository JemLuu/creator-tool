require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Bull = require('bull');
const InstagramClient = require('./bot/instagram-client');
const MessageHandler = require('./bot/message-handler');
const UserService = require('./services/user-service');
const TagService = require('./services/tag-service');
const ReelService = require('./services/reel-service');
const logger = require('./utils/logger');

class DawgBotApp {
  constructor() {
    this.app = express();
    this.instagram = new InstagramClient();
    this.userService = new UserService();
    this.tagService = new TagService();
    this.reelService = new ReelService(this.tagService);
    this.messageHandler = null;
    this.messageQueue = null;
    this.pollingInterval = null;
  }

  async initialize() {
    try {
      this.setupExpress();
      await this.setupInstagram();
      this.setupMessageQueue();
      this.setupMessageHandler();
      await this.startPolling();
      
      logger.info('Dawg Bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Dawg Bot:', error);
      process.exit(1);
    }
  }

  setupExpress() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json());
    
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100
    });
    this.app.use('/api', limiter);
    
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        connected: this.instagram.isConnected,
        timestamp: new Date().toISOString()
      });
    });
    
    this.app.get('/stats/:username', async (req, res) => {
      try {
        const user = await this.userService.findOrCreate(req.params.username);
        const tags = await this.tagService.getTagsWithCounts(user.id);
        const recentReels = await this.reelService.getRecentReels(user.id, 5);
        
        res.json({
          user: {
            id: user.id,
            username: user.instagramUsername
          },
          tags,
          recentReels
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
      }
    });
  }

  async setupInstagram() {
    const username = process.env.INSTAGRAM_USERNAME;
    const password = process.env.INSTAGRAM_PASSWORD;
    
    if (!username || !password) {
      throw new Error('Instagram credentials not configured');
    }
    
    await this.instagram.connect(username, password);
  }

  setupMessageQueue() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.messageQueue = new Bull('instagram-messages', redisUrl, {
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });
    
    this.messageQueue.process(async (job) => {
      const { message, threadId, username } = job.data;
      await this.messageHandler.processMessage(message, threadId, username);
    });
    
    this.messageQueue.on('failed', (job, err) => {
      logger.error(`Message processing failed: ${err.message}`, {
        jobId: job.id,
        data: job.data
      });
    });
  }

  setupMessageHandler() {
    this.messageHandler = new MessageHandler(
      this.instagram,
      this.reelService,
      this.tagService,
      this.userService
    );
  }

  async startPolling() {
    const POLLING_INTERVAL = 10000;
    
    const pollMessages = async () => {
      try {
        const threads = await this.instagram.getDirectInbox();
        
        for (const thread of threads) {
          const messages = await this.instagram.getThreadMessages(thread.thread_id);
          const username = thread.users[0]?.username;
          
          if (!username) continue;
          
          for (const message of messages.slice(0, 5)) {
            if (message.user_id === this.instagram.loggedInUser.pk) {
              continue;
            }
            
            await this.messageQueue.add({
              message,
              threadId: thread.thread_id,
              username
            });
            
            await this.instagram.markAsRead(thread.thread_id, message.item_id);
          }
        }
      } catch (error) {
        logger.error('Polling error:', error);
      }
    };
    
    await pollMessages();
    this.pollingInterval = setInterval(pollMessages, POLLING_INTERVAL);
  }

  async start() {
    const port = process.env.PORT || 3000;
    
    this.server = this.app.listen(port, () => {
      logger.info(`Dawg Bot server running on port ${port}`);
    });
  }

  async shutdown() {
    logger.info('Shutting down Dawg Bot...');
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    if (this.messageQueue) {
      await this.messageQueue.close();
    }
    
    if (this.instagram) {
      await this.instagram.disconnect();
    }
    
    if (this.server) {
      this.server.close();
    }
    
    await this.userService.disconnect();
    await this.tagService.disconnect();
    await this.reelService.disconnect();
    
    logger.info('Dawg Bot shutdown complete');
    process.exit(0);
  }
}

const bot = new DawgBotApp();

bot.initialize()
  .then(() => bot.start())
  .catch(error => {
    logger.error('Failed to start Dawg Bot:', error);
    process.exit(1);
  });

process.on('SIGINT', () => bot.shutdown());
process.on('SIGTERM', () => bot.shutdown());

module.exports = DawgBotApp;