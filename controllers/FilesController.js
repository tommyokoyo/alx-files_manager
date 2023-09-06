const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');

const storagePath = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
  static async files(req, res) {
    const { 'x-token': token } = req.headers;
    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;

    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (!data && type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    if (parentId !== 0) {
      const parentFile = await (await dbClient.fileCollections())
        .findOne({ _id: ObjectId(parentId) });

      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }

      const fileDocument = {
        userId,
        name,
        type,
        isPublic,
        parentId,
      };

      try {
        if (type === 'folder') {
          const file = await (await dbClient.fileCollections()).insertOne(fileDocument);

          const newFile = {
            id: file.insertedId.toString(),
            userId: file.ops[0].userId,
            name: file.ops[0].name,
            type: file.ops[0].type,
            isPublic: file.ops[0].isPublic,
            parentId: file.ops[0].parentId,
          };
          return res.status(201).json(newFile);
        }
        const fileIdentifier = uuid();
        const filePath = path.join(storagePath, `${fileIdentifier}`);

        const decodedData = Buffer.from(data, 'base64');
        fs.writeFileSync(filePath, decodedData);

        fileDocument.localPath = filePath;

        const result = await (await dbClient.fileCollections()).insertOne(fileDocument);

        const newFile = {
          id: result.insertedId.toString(),
          userId: result.ops[0].userId,
          name: result.ops[0].name,
          type: result.ops[0].type,
          isPublic: result.ops[0].isPublic,
          parentId: result.ops[0].parentId,
        };
        return res.status(201).json(newFile);
      } catch (error) {
        console.error('Error creating file: ', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    }
    const newDocument = {
      userId,
      name,
      type,
      isPublic,
      parentId,
    };

    try {
      if (type === 'folder') {
        const result = await (await dbClient.fileCollections()).insertOne(newDocument);

        const newFile = {
          id: result.insertedId.toString(),
          userId: result.ops[0].userId,
          name: result.ops[0].name,
          type: result.ops[0].type,
          isPublic: result.ops[0].isPublic,
          parentId: result.ops[0].parentId,
        };
        return res.status(201).json(newFile);
      }
      const fileuuid = uuid();
      const filePath = path.join(storagePath, `${fileuuid}`);

      const decodedData = Buffer.from(data, 'base64');
      fs.writeFileSync(filePath, decodedData);

      newDocument.localPath = filePath;

      const file = await (await dbClient.fileCollections()).insertOne(newDocument);

      const newFile = {
        id: file.insertedId.toString(),
        userId: file.ops[0].userId,
        name: file.ops[0].name,
        type: file.ops[0].type,
        isPublic: file.ops[0].isPublic,
        parentId: file.ops[0].parentId,
      };
      return res.status(201).json(newFile);
    } catch (error) {
      console.error('Error creating file: ', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getShow(req, res) {
    const { 'x-token': token } = req.headers;
    const { parentId } = req.params;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;

    try {
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        const file = await (await dbClient.fileCollections())
          .find({ userId, parentId });

        if (!file) {
          return res.status(404).json({ error: 'Not found' });
        }

        return res.status(200).json(file);
      } catch (error) {
        console.log('Error fetching files: ', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    } catch (error) {
      console.log('Error fetching user sessions: ', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getIndex(req, res) {
    const { 'x-token': token } = req.headers;
    const { parentId = 0, page = 0 } = req.query;

    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const key = `auth_${token}`;

    try {
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      try {
        const pageSize = 20;
        const skip = parseInt(page, 10) * pageSize;

        const files = await (await dbClient.fileCollections())
          .find({ userId, parentId })
          .skip(skip).limit(pageSize)
          .toArray();

        if (!files) {
          return res.status(404).json({});
        }

        return res.status(200).json(files);
      } catch (error) {
        console.log('Error fetching files: ', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    } catch (error) {
      console.log('Error fetching user sessions: ', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = FilesController;
