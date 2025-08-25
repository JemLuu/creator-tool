const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

class TagService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async findOrCreateTag(userId, tagName) {
    const name = tagName?.toLowerCase() || 'untagged';
    
    try {
      let tag = await this.prisma.tag.findFirst({
        where: {
          userId,
          name
        }
      });

      if (!tag) {
        tag = await this.prisma.tag.create({
          data: {
            userId,
            name
          }
        });
        logger.info(`Created new tag: ${name} for user ${userId}`);
      }

      return tag;
    } catch (error) {
      logger.error(`Error finding/creating tag: ${error.message}`);
      throw error;
    }
  }

  async getTagsWithCounts(userId) {
    try {
      return await this.prisma.tag.findMany({
        where: { userId },
        include: {
          _count: {
            select: {
              reels: {
                where: { isDeleted: false }
              }
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      });
    } catch (error) {
      logger.error(`Error fetching tags with counts: ${error.message}`);
      throw error;
    }
  }

  async getAllTags(userId) {
    try {
      return await this.prisma.tag.findMany({
        where: { userId },
        orderBy: { name: 'asc' }
      });
    } catch (error) {
      logger.error(`Error fetching all tags: ${error.message}`);
      throw error;
    }
  }

  async getTagNames(userId) {
    try {
      const tags = await this.prisma.tag.findMany({
        where: { userId },
        select: { name: true }
      });
      return tags.map(t => t.name);
    } catch (error) {
      logger.error(`Error fetching tag names: ${error.message}`);
      return ['meme', 'skit', 'audio', 'untagged'];
    }
  }

  async getTagByName(userId, tagName) {
    try {
      return await this.prisma.tag.findFirst({
        where: {
          userId,
          name: tagName.toLowerCase()
        }
      });
    } catch (error) {
      logger.error(`Error fetching tag by name: ${error.message}`);
      throw error;
    }
  }

  async deleteTag(userId, tagId) {
    try {
      const untagged = await this.findOrCreateTag(userId, 'untagged');
      
      await this.prisma.reel.updateMany({
        where: {
          userId,
          tagId
        },
        data: {
          tagId: untagged.id
        }
      });
      
      await this.prisma.tag.delete({
        where: {
          id: tagId,
          userId
        }
      });
      
      logger.info(`Deleted tag ${tagId} for user ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting tag: ${error.message}`);
      return false;
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = TagService;