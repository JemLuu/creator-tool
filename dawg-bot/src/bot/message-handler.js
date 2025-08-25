const { validateInstagramUrl, extractReelId, extractTagFromMessage } = require('../utils/validators');
const CommandParser = require('./command-parser');
const logger = require('../utils/logger');

class MessageHandler {
  constructor(instagramClient, reelService, tagService, userService) {
    this.instagram = instagramClient;
    this.reelService = reelService;
    this.tagService = tagService;
    this.userService = userService;
    this.commandParser = new CommandParser();
    this.processedMessages = new Set();
  }

  async processMessage(message, threadId, username) {
    const messageId = `${threadId}-${message.item_id}`;
    
    if (this.processedMessages.has(messageId)) {
      return;
    }
    
    this.processedMessages.add(messageId);
    
    if (this.processedMessages.size > 1000) {
      const oldMessages = Array.from(this.processedMessages).slice(0, 500);
      oldMessages.forEach(msg => this.processedMessages.delete(msg));
    }
    
    try {
      const user = await this.userService.findOrCreate(username);
      const context = { userId: user.id, username, threadId };
      
      const text = message.text || '';
      
      const commandResult = await this.commandParser.parse(text, context);
      if (commandResult) {
        await this.handleCommand(commandResult, threadId);
        return;
      }
      
      if (message.media_share) {
        await this.handleReelShare(message, text, context);
        return;
      }
      
      if (message.link && validateInstagramUrl(message.link.text)) {
        await this.handleReelLink(message.link.text, text, context, threadId);
        return;
      }
      
    } catch (error) {
      logger.error(`Error processing message: ${error.message}`);
      await this.instagram.sendMessage(threadId, 'Sorry, something went wrong. Please try again.');
    }
  }

  async handleCommand(commandResult, threadId) {
    let response = '';
    
    switch (commandResult.type) {
      case 'list_tags':
        const tagCounts = await this.tagService.getTagsWithCounts(commandResult.userId);
        response = this.formatTagList(tagCounts);
        break;
        
      case 'show_tag':
        const reels = await this.reelService.getReelsByTag(
          commandResult.userId, 
          commandResult.tagName
        );
        response = this.formatReelList(reels, commandResult.tagName);
        break;
        
      case 'tag_reel':
        const tagged = await this.reelService.updateReelTag(
          commandResult.userId,
          commandResult.reelId,
          commandResult.tagName
        );
        response = tagged 
          ? `✅ Reel ${commandResult.reelId} tagged as '${commandResult.tagName}'`
          : `❌ Failed to tag reel ${commandResult.reelId}`;
        break;
        
      case 'delete_reel':
        const deleted = await this.reelService.deleteReel(
          commandResult.userId,
          commandResult.reelId
        );
        response = deleted
          ? `🗑️ Deleted reel ${commandResult.reelId}`
          : `❌ Failed to delete reel ${commandResult.reelId}`;
        break;
        
      case 'list_all_tags':
        const allTags = await this.tagService.getAllTags(commandResult.userId);
        response = `📋 Available tags:\n${allTags.map(t => `• ${t.name}`).join('\n')}`;
        break;
        
      case 'help':
        response = commandResult.message;
        break;
        
      case 'error':
        response = `❌ ${commandResult.message}`;
        break;
    }
    
    await this.instagram.sendMessage(threadId, response);
  }

  async handleReelShare(message, text, context) {
    const reelId = message.media_share.id || extractReelId(message.media_share.video_url);
    
    if (!reelId) {
      logger.error('Could not extract reel ID from media share');
      return;
    }
    
    const reelInfo = await this.instagram.getReelInfo(reelId);
    const availableTags = await this.tagService.getTagNames(context.userId);
    const { tag, idea } = extractTagFromMessage(text, availableTags);
    
    const savedReel = await this.reelService.saveReel({
      userId: context.userId,
      reelUrl: reelInfo?.url || `https://www.instagram.com/reel/${reelId}`,
      reelMetadata: reelInfo,
      idea: idea || text,
      tagName: tag
    });
    
    const response = tag
      ? `✅ Saved! Tagged as '${tag}' - ID: ${savedReel.id}`
      : `✅ Saved to 'untagged' - ID: ${savedReel.id}`;
    
    await this.instagram.sendMessage(context.threadId, response);
  }

  async handleReelLink(url, text, context, threadId) {
    const reelId = extractReelId(url);
    
    if (!reelId) {
      await this.instagram.sendMessage(threadId, '❌ Invalid Instagram URL');
      return;
    }
    
    const reelInfo = await this.instagram.getReelInfo(reelId);
    const availableTags = await this.tagService.getTagNames(context.userId);
    const { tag, idea } = extractTagFromMessage(text, availableTags);
    
    const savedReel = await this.reelService.saveReel({
      userId: context.userId,
      reelUrl: url,
      reelMetadata: reelInfo,
      idea: idea || text,
      tagName: tag
    });
    
    const response = tag
      ? `✅ Saved! Tagged as '${tag}' - ID: ${savedReel.id}`
      : `✅ Saved to 'untagged' - ID: ${savedReel.id}`;
    
    await this.instagram.sendMessage(threadId, response);
  }

  formatTagList(tagCounts) {
    if (tagCounts.length === 0) {
      return '📊 No tags yet. Start saving reels!';
    }
    
    const formatted = tagCounts.map(t => `• ${t.name} (${t._count.reels})`).join('\n');
    return `📊 Your tags:\n${formatted}`;
  }

  formatReelList(reels, tagName) {
    if (reels.length === 0) {
      return `📂 No reels in '${tagName}'`;
    }
    
    const formatted = reels.slice(0, 10).map(r => 
      `ID ${r.id}: ${r.idea.substring(0, 50)}${r.idea.length > 50 ? '...' : ''}`
    ).join('\n');
    
    const header = `🎬 ${tagName} ideas (${reels.length} total, showing recent 10):\n`;
    return header + formatted;
  }
}

module.exports = MessageHandler;