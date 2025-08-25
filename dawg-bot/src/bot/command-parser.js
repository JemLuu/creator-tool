const { parseCommand, sanitizeInput } = require('../utils/validators');
const logger = require('../utils/logger');

class CommandParser {
  constructor() {
    this.commands = {
      'list': this.handleList,
      'show': this.handleShow,
      'tag': this.handleTag,
      'delete': this.handleDelete,
      'tags': this.handleTags,
      'help': this.handleHelp
    };
  }

  async parse(message, context) {
    const parsed = parseCommand(message);
    
    if (!parsed.isCommand) {
      return null;
    }
    
    const handler = this.commands[parsed.command];
    
    if (!handler) {
      return {
        type: 'error',
        message: `Unknown command: ${parsed.command}. Type "dawg help" for available commands.`
      };
    }
    
    try {
      return await handler.call(this, parsed.args, context);
    } catch (error) {
      logger.error(`Command execution failed: ${error.message}`);
      return {
        type: 'error',
        message: 'Command failed. Please try again.'
      };
    }
  }

  async handleList(args, context) {
    return {
      type: 'list_tags',
      userId: context.userId
    };
  }

  async handleShow(args, context) {
    if (args.length === 0) {
      return {
        type: 'error',
        message: 'Usage: dawg show <tagname>'
      };
    }
    
    const tagName = sanitizeInput(args[0]);
    return {
      type: 'show_tag',
      userId: context.userId,
      tagName
    };
  }

  async handleTag(args, context) {
    if (args.length < 2) {
      return {
        type: 'error',
        message: 'Usage: dawg tag <id> <tagname>'
      };
    }
    
    const reelId = parseInt(args[0]);
    const tagName = sanitizeInput(args[1]);
    
    if (isNaN(reelId)) {
      return {
        type: 'error',
        message: 'Invalid reel ID. Must be a number.'
      };
    }
    
    return {
      type: 'tag_reel',
      userId: context.userId,
      reelId,
      tagName
    };
  }

  async handleDelete(args, context) {
    if (args.length === 0) {
      return {
        type: 'error',
        message: 'Usage: dawg delete <id>'
      };
    }
    
    const reelId = parseInt(args[0]);
    
    if (isNaN(reelId)) {
      return {
        type: 'error',
        message: 'Invalid reel ID. Must be a number.'
      };
    }
    
    return {
      type: 'delete_reel',
      userId: context.userId,
      reelId
    };
  }

  async handleTags(args, context) {
    return {
      type: 'list_all_tags',
      userId: context.userId
    };
  }

  async handleHelp() {
    return {
      type: 'help',
      message: `Available commands:
• dawg list - Show all tags with counts
• dawg show <tag> - Show reels in a tag
• dawg tag <id> <tag> - Tag/retag a reel
• dawg delete <id> - Delete a reel
• dawg tags - List all available tags
• dawg help - Show this help message

To save a reel, just share it with a message!
Example: "meme this would be funny"`
    };
  }
}

module.exports = CommandParser;