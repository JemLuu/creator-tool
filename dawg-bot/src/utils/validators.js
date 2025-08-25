const URL_REGEX = /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/?/;

const validateInstagramUrl = (url) => {
  return URL_REGEX.test(url);
};

const extractReelId = (url) => {
  const match = url.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
  return match ? match[2] : null;
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[^\w\s-]/gi, '');
};

const parseCommand = (message) => {
  const trimmed = message.trim();
  
  if (!trimmed.startsWith('dawg ')) {
    return { isCommand: false, message: trimmed };
  }
  
  const parts = trimmed.substring(5).trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);
  
  return {
    isCommand: true,
    command,
    args
  };
};

const extractTagFromMessage = (message, availableTags) => {
  const words = message.trim().split(/\s+/);
  const firstWord = words[0]?.toLowerCase();
  
  if (availableTags.includes(firstWord)) {
    return {
      tag: firstWord,
      idea: words.slice(1).join(' ')
    };
  }
  
  return {
    tag: null,
    idea: message
  };
};

module.exports = {
  validateInstagramUrl,
  extractReelId,
  sanitizeInput,
  parseCommand,
  extractTagFromMessage
};