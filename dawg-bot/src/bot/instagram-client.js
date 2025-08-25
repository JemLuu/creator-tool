const { IgApiClient } = require('instagram-private-api');
const logger = require('../utils/logger');

class InstagramClient {
  constructor() {
    this.ig = new IgApiClient();
    this.loggedInUser = null;
    this.isConnected = false;
  }

  async connect(username, password) {
    try {
      logger.info('Attempting to connect to Instagram...');
      
      this.ig.state.generateDevice(username);
      
      await this.ig.simulate.preLoginFlow();
      
      this.loggedInUser = await this.ig.account.login(username, password);
      
      process.nextTick(async () => await this.ig.simulate.postLoginFlow());
      
      this.isConnected = true;
      logger.info(`Successfully logged in as ${username}`);
      
      return this.loggedInUser;
    } catch (error) {
      logger.error('Failed to connect to Instagram:', error);
      throw new Error(`Instagram connection failed: ${error.message}`);
    }
  }

  async getDirectInbox() {
    if (!this.isConnected) {
      throw new Error('Not connected to Instagram');
    }
    
    try {
      const inbox = await this.ig.feed.directInbox();
      const threads = await inbox.items();
      return threads;
    } catch (error) {
      logger.error('Failed to fetch inbox:', error);
      throw error;
    }
  }

  async getThreadMessages(threadId, cursor = null) {
    if (!this.isConnected) {
      throw new Error('Not connected to Instagram');
    }
    
    try {
      const thread = this.ig.feed.directThread({ thread_id: threadId });
      if (cursor) {
        thread.cursor = cursor;
      }
      const messages = await thread.items();
      return messages;
    } catch (error) {
      logger.error(`Failed to fetch messages for thread ${threadId}:`, error);
      throw error;
    }
  }

  async sendMessage(threadId, text) {
    if (!this.isConnected) {
      throw new Error('Not connected to Instagram');
    }
    
    try {
      const thread = this.ig.entity.directThread(threadId);
      await thread.broadcastText(text);
      logger.info(`Message sent to thread ${threadId}`);
    } catch (error) {
      logger.error(`Failed to send message to thread ${threadId}:`, error);
      throw error;
    }
  }

  async markAsRead(threadId, itemId) {
    if (!this.isConnected) {
      throw new Error('Not connected to Instagram');
    }
    
    try {
      await this.ig.directThread.markItemSeen(threadId, itemId);
    } catch (error) {
      logger.warn(`Failed to mark message as read: ${error.message}`);
    }
  }

  async getReelInfo(reelId) {
    if (!this.isConnected) {
      throw new Error('Not connected to Instagram');
    }
    
    try {
      const mediaInfo = await this.ig.media.info(reelId);
      return {
        id: reelId,
        url: `https://www.instagram.com/reel/${reelId}`,
        caption: mediaInfo.items[0].caption?.text || '',
        owner: mediaInfo.items[0].user?.username || '',
        timestamp: mediaInfo.items[0].taken_at || Date.now()
      };
    } catch (error) {
      logger.error(`Failed to fetch reel info for ${reelId}:`, error);
      return null;
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.ig.account.logout();
      this.isConnected = false;
      logger.info('Disconnected from Instagram');
    }
  }
}

module.exports = InstagramClient;