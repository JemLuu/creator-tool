const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

class UserService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async findOrCreate(instagramUsername) {
    try {
      let user = await this.prisma.user.findUnique({
        where: { instagramUsername }
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: { instagramUsername }
        });
        
        await this.createDefaultTags(user.id);
        
        logger.info(`Created new user: ${instagramUsername}`);
      }

      return user;
    } catch (error) {
      logger.error(`Error finding/creating user: ${error.message}`);
      throw error;
    }
  }

  async createDefaultTags(userId) {
    const defaultTags = ['meme', 'skit', 'audio', 'untagged'];
    
    try {
      await this.prisma.tag.createMany({
        data: defaultTags.map(name => ({
          userId,
          name
        })),
        skipDuplicates: true
      });
    } catch (error) {
      logger.error(`Error creating default tags: ${error.message}`);
    }
  }

  async getUserById(userId) {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          tags: true,
          reels: {
            where: { isDeleted: false }
          }
        }
      });
    } catch (error) {
      logger.error(`Error fetching user: ${error.message}`);
      throw error;
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

module.exports = UserService;