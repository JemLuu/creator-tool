const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

class ReelService {
  constructor(tagService) {
    this.prisma = new PrismaClient();
    this.tagService = tagService;
  }

  async saveReel({ userId, reelUrl, reelMetadata, idea, tagName }) {
    try {
      const tag = await this.tagService.findOrCreateTag(userId, tagName);
      
      const existingReel = await this.prisma.reel.findFirst({
        where: {
          userId,
          reelUrl,
          isDeleted: false
        }
      });
      
      if (existingReel) {
        const updated = await this.prisma.reel.update({
          where: { id: existingReel.id },
          data: {
            idea,
            tagId: tag.id,
            reelMetadata: reelMetadata || undefined
          }
        });
        logger.info(`Updated existing reel ${updated.id}`);
        return updated;
      }
      
      const reel = await this.prisma.reel.create({
        data: {
          userId,
          reelUrl,
          reelMetadata: reelMetadata || undefined,
          idea,
          tagId: tag.id
        }
      });
      
      logger.info(`Saved new reel ${reel.id} for user ${userId}`);
      return reel;
    } catch (error) {
      logger.error(`Error saving reel: ${error.message}`);
      throw error;
    }
  }

  async getReelsByTag(userId, tagName) {
    try {
      const tag = await this.tagService.getTagByName(userId, tagName);
      
      if (!tag) {
        return [];
      }
      
      return await this.prisma.reel.findMany({
        where: {
          userId,
          tagId: tag.id,
          isDeleted: false
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      logger.error(`Error fetching reels by tag: ${error.message}`);
      throw error;
    }
  }

  async getReelById(userId, reelId) {
    try {
      return await this.prisma.reel.findFirst({
        where: {
          id: reelId,
          userId,
          isDeleted: false
        },
        include: {
          tag: true
        }
      });
    } catch (error) {
      logger.error(`Error fetching reel by ID: ${error.message}`);
      throw error;
    }
  }

  async updateReelTag(userId, reelId, tagName) {
    try {
      const reel = await this.getReelById(userId, reelId);
      
      if (!reel) {
        logger.warn(`Reel ${reelId} not found for user ${userId}`);
        return false;
      }
      
      const tag = await this.tagService.findOrCreateTag(userId, tagName);
      
      await this.prisma.reel.update({
        where: { id: reelId },
        data: { tagId: tag.id }
      });
      
      logger.info(`Updated reel ${reelId} tag to ${tagName}`);
      return true;
    } catch (error) {
      logger.error(`Error updating reel tag: ${error.message}`);
      return false;
    }
  }

  async deleteReel(userId, reelId) {
    try {
      const reel = await this.getReelById(userId, reelId);
      
      if (!reel) {
        logger.warn(`Reel ${reelId} not found for user ${userId}`);
        return false;
      }
      
      await this.prisma.reel.update({
        where: { id: reelId },
        data: { isDeleted: true }
      });
      
      logger.info(`Soft deleted reel ${reelId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting reel: ${error.message}`);
      return false;
    }
  }

  async getRecentReels(userId, limit = 10) {
    try {
      return await this.prisma.reel.findMany({
        where: {
          userId,
          isDeleted: false
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit,
        include: {
          tag: true
        }
      });
    } catch (error) {
      logger.error(`Error fetching recent reels: ${error.message}`);
      throw error;
    }
  }

  async searchReels(userId, searchTerm) {
    try {
      return await this.prisma.reel.findMany({
        where: {
          userId,
          isDeleted: false,
          idea: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          tag: true
        }
      });
    } catch (error) {
      logger.error(`Error searching reels: ${error.message}`);
      throw error;
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = ReelService;