const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { ObjectId } = require('mongodb');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');
const fileQueue = require('../utils/fileQueue');

const storagePath = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
  static async postUpload(req, res) {
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

          const fileId = file.insertedId;

          if (type === 'image') {
            fileQueue.add({
              fileId: fileId.toString(),
              user: userId,
            });
          }
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
    const { parentId = 0 } = req.params;

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
        const userFiles = await (await dbClient.fileCollections())
          .find({ userId, parentId }).toArray();

        if (!userFiles) {
          return res.status(404).json({ error: 'Not found' });
        }
        console.log(userFiles);

        return res.status(200).json(userFiles);
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

  static async putPublish(req, res) {
    const { 'x-token': token } = req.headers;
    const { id } = req.params;

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
        const filter = { _id: ObjectId(id), userId };
        const update = { $set: { isPublic: true } };
        const userFile = await (await dbClient.fileCollections())
          .findOneAndUpdate(filter, update, { returnOriginal: false });

        if (!userFile) {
          return res.status(404).json({ error: 'Not found' });
        }

        const newFile = {
          id: userFile.value._id,
          userId: userFile.value.userId,
          name: userFile.value.name,
          type: userFile.value.type,
          isPublic: userFile.value.isPublic,
          parentId: userFile.value.parentId,
        };
        return res.status(201).json(newFile);
      } catch (error) {
        console.log('Error updating the file: ', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    } catch (error) {
      console.log('Error fetching user sessions: ', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putUnpublish(req, res) {
    const { 'x-token': token } = req.headers;
    const { id } = req.params;

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
        const filter = { _id: ObjectId(id), userId };
        const update = { $set: { isPublic: false } };
        const newUserFile = await (await dbClient.fileCollections())
          .findOneAndUpdate(filter, update, { returnOriginal: false });

        if (!newUserFile) {
          return res.status(404).json({ error: 'Not found' });
        }

        const newFile = {
          id: newUserFile.value._id,
          userId: newUserFile.value.userId,
          name: newUserFile.value.name,
          type: newUserFile.value.type,
          isPublic: newUserFile.value.isPublic,
          parentId: newUserFile.value.parentId,
        };
        return res.status(201).json(newFile);
      } catch (error) {
        console.log('Error updating the file: ', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    } catch (error) {
      console.log('Error fetching user sessions: ', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getFile(req, res) {
    const { 'x-token': token } = req.headers;
    const { id } = req.params;
    const { size } = req.query;

    if (!token) {
      return res.status(404).json({ error: 'Not found' });
    }

    const key = `auth_${token}`;

    try {
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(404).json({ error: 'Not found' });
      }

      const userFile = await (await dbClient.fileCollections())
        .findOne({ _id: ObjectId(id) });

      if (!userFile) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (!userFile.isPublic && userId !== userFile) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (userFile.file === 'folder') {
        return res.status(404).json({ error: 'A folder doesn\'t have content' });
      }

      if (!fs.existsSync(userFile.localPath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const mimetype = mime.lookup(userFile.filename);

      res.setHeader('Content-Type', mimetype);

      const fileStream = fs.createReadStream(userFile.localPath);
      fileStream.pipe(res);
    } catch (error) {
      console.log('Error fetching user sessions: ', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = FilesController;
